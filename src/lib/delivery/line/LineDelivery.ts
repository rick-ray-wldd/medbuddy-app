import type {
  Delivery,
  DeliveryMessage,
  DeliveryResult,
  DeliveryTarget,
} from "../types";
import { type AudioStore, NotImplementedAudioStore } from "./audio";
import { LIMITS } from "./config";
import { checkTextLimit, containsTappableLink, validateSubject } from "./validate";

/**
 * LINE transport ONLY (spec §2). This class contains no medical logic and
 * composes no user-facing content. `message.text` goes out VERBATIM — never
 * append, prepend, truncate, translate or "improve" it. If it cannot be sent
 * as-is, return { ok: false } and send NOTHING (§6.6 — fail loudly, no
 * substitute messages).
 */
export type LineDeliveryDeps = {
  channelAccessToken: string;
  /** injectable so the test suite runs fully offline (spec §8) */
  fetchImpl?: typeof fetch;
  audioStore?: AudioStore;
};

export class LineDelivery implements Delivery {
  private readonly fetchImpl: typeof fetch;
  private readonly audioStore: AudioStore;

  constructor(private readonly deps: LineDeliveryDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.audioStore = deps.audioStore ?? new NotImplementedAudioStore();
  }

  async send(
    target: DeliveryTarget,
    message: DeliveryMessage,
  ): Promise<DeliveryResult> {
    // §6.5 — refuse anything unattributed; never send a bare finding.
    const subjectError = validateSubject(target);
    if (subjectError) return subjectError;

    // §6.1 — never send a link to an elder. Caregiver links are fine.
    if (target.role === "elder" && containsTappableLink(message.text)) {
      return { ok: false, reason: "link-in-elder-message", retryable: false };
    }

    // §7 limits — refuse, never truncate. Ray fixes oversize upstream.
    const limitError = checkTextLimit(message.text);
    if (limitError) return limitError;

    // §7 audio out — hosted HTTPS URL + explicit duration; m4a target.
    if (message.speech) {
      if (message.speech.durationMs > LIMITS.maxAudioDurationMs) {
        return {
          ok: false,
          reason: "audio-exceeds-duration-limit",
          retryable: false,
        };
      }
      // TODO(line-adapter): transcodeToM4a() if format !== "m4a" (see audio.ts)
      // → this.audioStore.put() → send an audio message referencing the hosted
      // URL + durationMs alongside the text. Until implemented: fail loudly
      // rather than silently dropping the speech half (§6.6).
      return {
        ok: false,
        reason: "audio-delivery-not-implemented",
        retryable: false,
      };
    }

    // Push endpoint verified 2026-07-28: POST https://api.line.me/v2/bot/message/push
    // with Authorization: Bearer {token} + Content-Type: application/json,
    // body { to, messages } (max 5 messages — we send 1).
    // https://developers.line.biz/en/reference/messaging-api/#send-push-message
    //
    // `message.text` is assigned VERBATIM by direct property assignment — no
    // templates, no trim, no normalisation (§4). The Delivery interface
    // carries no reply token → push-only (README question 1 for Ray).
    // Exactly ONE request per send(), never auto-retried (§6.2); upstream
    // decides what to do with `retryable`. send() never throws (§6.6).
    const payload = {
      to: target.channelUserId,
      messages: [{ type: "text", text: message.text }],
    };

    let response: Response;
    try {
      response = await this.fetchImpl("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.deps.channelAccessToken}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Logging rule: ids/reasons/status only — never message.text, and not
      // the thrown error either (it could echo request details).
      console.error("[line-adapter] push network error", {
        to: target.channelUserId,
        reason: "network-error",
      });
      return { ok: false, reason: "network-error", retryable: true };
    }

    if (response.ok) {
      return { ok: true, ...(await extractProviderMessageId(response)) };
    }

    const { reason, retryable } = mapPushFailure(response.status);
    console.error("[line-adapter] push failed", {
      to: target.channelUserId,
      status: response.status,
      reason,
      retryable,
    });
    return { ok: false, reason, retryable };
  }
}

/**
 * Stable kebab-case failure reasons (§6.2, §6.6). Verified 2026-07-28: 429 =
 * rate limit / monthly quota (no Retry-After header is documented); 400 =
 * invalid request or message object; 401/403 = auth/permission.
 * https://developers.line.biz/en/reference/messaging-api/#status-codes
 */
function mapPushFailure(status: number): { reason: string; retryable: boolean } {
  if (status === 401 || status === 403) {
    return { reason: "line-auth-failed", retryable: false };
  }
  if (status === 429) {
    return { reason: "rate-limited", retryable: true };
  }
  if (status >= 500) {
    return { reason: "line-server-error", retryable: true };
  }
  // Everything else non-2xx (incl. other 4xx): LINE refused this request as
  // constructed; retrying the same payload cannot help.
  return { reason: "line-rejected-request", retryable: false };
}

/**
 * Success response verified 2026-07-28: `{ "sentMessages": [{ "id": … }] }`.
 * The doc types `id` as Number but its own example shows a JSON string —
 * accept both and normalise with String() (also avoids 2^53 precision loss).
 * https://developers.line.biz/en/reference/messaging-api/#send-push-message
 */
async function extractProviderMessageId(
  response: Response,
): Promise<{ providerMessageId: string } | undefined> {
  try {
    const body = (await response.json()) as {
      sentMessages?: Array<{ id?: string | number }>;
    };
    const id = body?.sentMessages?.[0]?.id;
    return id === undefined || id === null
      ? undefined
      : { providerMessageId: String(id) };
  } catch {
    // 2xx with no/unparseable body — still a success, just without an id.
    return undefined;
  }
}
