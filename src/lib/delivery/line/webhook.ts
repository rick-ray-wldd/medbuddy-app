import { handleInbound, type InboundMessage } from "../inbound";
import { getLineConfig } from "./config";
import { fetchAudioContentFromLine } from "./content";
import { ProviderMessageDedupe } from "./dedupe";
import { verifyLineSignature } from "./signature";

/**
 * Webhook core, kept OUT of the Next.js route so it is unit-testable offline
 * with no framework and no network (spec §8). The route at
 * `src/app/api/line/webhook/route.ts` is a thin shell over this function.
 *
 * Event/field names VERIFIED 2026-07-28 against current LINE docs:
 * https://developers.line.biz/en/reference/messaging-api/#webhook-event-objects
 */

/** Minimal slice of the LINE webhook payload this adapter cares about. */
type LineWebhookBody = {
  events?: Array<{
    type?: string; // "message" | "follow" | "postback" | …
    timestamp?: number; // ms epoch
    source?: { userId?: string };
    /** Present on every event; the only id `follow` and `postback` carry, so
     *  it is what those dedupe on. Verified 2026-07-28 against
     *  https://developers.line.biz/en/reference/messaging-api/#common-properties */
    webhookEventId?: string;
    /** postback only. Free-form string WE authored into a menu or card — but
     *  it arrives from the client, so upstream re-checks it rather than
     *  trusting it (see lib/roles/bind.ts). */
    postback?: { data?: string };
    message?: {
      id?: string;
      type?: string; // "text" | "audio" | "sticker" | …
      text?: string;
      /** ms — on audio events, documented "Not always included" (verified
       *  2026-07-28: https://developers.line.biz/en/reference/messaging-api/#wh-audio) */
      duration?: number;
      /** "line" = bytes retrievable via the api-data content endpoint;
       *  "external" = they are NOT (same doc section as above) */
      contentProvider?: { type?: string };
    };
    /** single-use, short-lived (§7). Unused for now — send() is push-only;
     *  see the seam note in LineDelivery.ts and raise with Ray. */
    replyToken?: string;
  }>;
};

export type FetchedAudio = {
  bytes: Uint8Array;
  format: string;
  durationMs?: number;
};

export type WebhookDeps = {
  /** defaults to env config — inject in tests */
  channelSecret?: string;
  /** inject a fresh instance per test to avoid cross-test state */
  dedupe?: ProviderMessageDedupe;
  /** defaults to Ray's handleInbound — inject a collector in tests */
  onInbound?: (msg: InboundMessage) => Promise<void>;
  /**
   * Downloads inbound audio bytes for a messageId. Injectable so tests run
   * offline; defaults to the real api-data content download (content.ts),
   * with config constructed lazily ONLY on the audio path so injected tests
   * stay env-free.
   */
  fetchAudioContent?: (messageId: string) => Promise<FetchedAudio>;
};

/** module-level default so retries across requests dedupe (per instance). */
const defaultDedupe = new ProviderMessageDedupe();

export async function handleLineWebhookRequest(
  rawBody: string,
  signatureHeader: string | null,
  deps: WebhookDeps = {},
): Promise<{ status: number }> {
  const channelSecret = deps.channelSecret ?? getLineConfig().channelSecret;

  // §7 — verify against the RAW body before any JSON parsing. Mismatch → 401.
  if (!verifyLineSignature(rawBody, signatureHeader, channelSecret)) {
    return { status: 401 };
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    // Correctly signed but unparseable should not happen; per §5's spirit for
    // unknown input: acknowledge and drop. (LINE's verification ping — valid
    // signature, empty events — also lands harmlessly on the 200 below.)
    return { status: 200 };
  }

  const dedupe = deps.dedupe ?? defaultDedupe;
  const onInbound = deps.onInbound ?? handleInbound;

  // ⚠️ TODO(serverless): spec §5 says return 200 fast and do the work after —
  // LINE's webhook timeout is short. On Vercel, work after the response needs
  // `waitUntil` (or a queue). For now the work runs inline; keep handlers fast
  // and revisit before wiring the real upstream.
  for (const event of body.events ?? []) {
    const eventUserId = event?.source?.userId;

    // `follow` and `postback` carry no message, so they normalise straight
    // through: this layer decides nothing about them beyond idempotency.
    // Which role a postback may claim, and whether it may be honoured, is
    // upstream's call (lib/roles/bind.ts) — postback data is client input.
    if (event?.type === "follow" || event?.type === "postback") {
      const eventId = event.webhookEventId;
      if (!eventId || !eventUserId) continue;
      if (!dedupe.markIfNew(eventId)) continue;

      await onInbound({
        channelUserId: eventUserId,
        receivedAt: new Date(event.timestamp ?? Date.now()).toISOString(),
        providerMessageId: eventId,
        body:
          event.type === "follow"
            ? { kind: "follow" }
            : { kind: "postback", data: event.postback?.data ?? "" },
      });
      continue;
    }

    // §5: handle exactly `message` events of type text/audio.
    // Everything else (sticker, image, …): 200 OK, no action.
    if (event?.type !== "message") continue;
    const messageType = event.message?.type;
    if (messageType !== "text" && messageType !== "audio") continue;

    const messageId = event.message?.id;
    const userId = event.source?.userId;
    if (!messageId || !userId) continue;

    // §5 idempotency — a duplicate must not produce a duplicate downstream
    // call. NOTE: the id is marked BEFORE onInbound runs; if upstream can
    // fail and needs LINE's retry to replay, revisit this ordering (decide
    // with Ray, then encode the decision in a test).
    if (!dedupe.markIfNew(messageId)) continue;

    const receivedAt = new Date(event.timestamp ?? Date.now()).toISOString();

    if (messageType === "text" && typeof event.message?.text === "string") {
      await onInbound({
        channelUserId: userId,
        receivedAt,
        providerMessageId: messageId,
        body: { kind: "text", text: event.message.text },
      });
      continue;
    }

    if (messageType === "audio") {
      // §5 — download the content, hand off the bytes. DO NOT transcribe:
      // transcription is a product decision upstream, not transport.

      // Verified 2026-07-28: the content endpoint only serves audio whose
      // contentProvider.type is "line"; "external" bytes are NOT retrievable
      // there. Log ids only (§6.6 + logging rule), ack, drop.
      const providerType = event.message?.contentProvider?.type;
      if (providerType !== undefined && providerType !== "line") {
        console.error(
          "[line-adapter] audio inbound with non-line contentProvider — content not retrievable, dropping",
          { messageId, providerType },
        );
        continue;
      }

      // Default = the real api-data download; config is constructed lazily
      // HERE (audio path only) so injected tests never need env vars.
      const fetchAudioContent =
        deps.fetchAudioContent ??
        ((id: string) =>
          fetchAudioContentFromLine(id, {
            channelAccessToken: getLineConfig().channelAccessToken,
          }));

      let fetched: FetchedAudio;
      try {
        fetched = await fetchAudioContent(messageId);
      } catch (err) {
        // Download failure (incl. the 202 still-preparing case): log loudly —
        // ids and status only, never bytes — ack 200, drop. KNOWN TRADE-OFF:
        // dedupe already marked this id, so LINE's retry would also be
        // dropped (module README question 2 for Ray — do not redesign here).
        console.error("[line-adapter] audio content download failed, dropping", {
          messageId,
          error: err instanceof Error ? err.message : "unknown",
        });
        continue;
      }

      await onInbound({
        channelUserId: userId,
        receivedAt,
        providerMessageId: messageId,
        body: {
          kind: "audio",
          audio: fetched.bytes,
          format: fetched.format,
          // Precedence: the webhook event's duration (documented, though "not
          // always included") wins over anything the fetch layer knows.
          durationMs: event.message?.duration ?? fetched.durationMs,
        },
      });
    }
  }

  return { status: 200 };
}
