import { getRegistry } from "../registry";
import { buildVerdict } from "../verdict/build";
import { narrate } from "../narration/narrate";
import { assertNoSelfReport, frameReminder, type Framing } from "./reminder-framing";
import { findSubject } from "../subjects";
import { FishVoiceProvider } from "../voice/fish";
import type { VoiceProfile } from "../voice/types";
import { LineDelivery } from "./line/LineDelivery";
import { getLineConfig } from "./line/config";
import type { ItemSource } from "../grounding/types";
import type { Delivery, DeliveryMessage } from "./types";

/**
 * The one sanctioned outbound (spec §6.2), shared by its two callers — the
 * caregiver's 傳到 LINE button (/api/line/deliver) and the caregiver-
 * configured schedule (/api/cron/deliver-scheduled). One implementation so
 * there is exactly one place where "what may reach the elder" is decided:
 * the rule pipeline's own narration, verbatim, or nothing.
 */

/** Fish synthesises 128 kbps CBR mp3 (fish.ts) → ~16 bytes per ms. */
const MP3_BYTES_PER_MS = 16;

export type ExplanationOutcome = {
  delivery: import("./types").DeliveryResult;
  speech: "delivered" | "not requested" | `failed: ${string}`;
  narrationFallback: boolean;
};

export type DeliverExplanationDeps = {
  /** injectable so tests run offline */
  delivery?: Delivery;
  synthesise?: InstanceType<typeof FishVoiceProvider>["synthesise"];
};

export async function deliverExplanationToElder(
  opts: {
    subjectId: string;
    items: { text: string; source?: ItemSource }[];
    to: string;
    voiceProfile: VoiceProfile | null;
    /**
     * "reminder" wraps the narration in a granddaughter's greeting and
     * sign-off. The medical sentences are unchanged either way — see
     * reminder-framing.ts for why only the frame may be casual.
     */
    framing?: Framing;
    /** Stable per-slot key so the same slot greets the same way each day. */
    framingKey?: string;
  },
  deps: DeliverExplanationDeps = {},
): Promise<ExplanationOutcome> {
  const subject = findSubject(opts.subjectId);
  if (!subject) {
    return {
      delivery: { ok: false, reason: "unknown-subject", retryable: false },
      speech: "not requested",
      narrationFallback: false,
    };
  }

  // Same pipeline as /api/check — grounding → rules → verdict → narration.
  const submitted = opts.items.filter((i) => i.text.trim().length > 0);
  const { resolver, ruleSets, classes, knownMedicines } = getRegistry();
  const verdict = buildVerdict(
    {
      id: subject.id,
      displayName: subject.displayName,
      ageYears: subject.ageYears,
      conditions: subject.conditions,
    },
    resolver.resolveAll(submitted),
    ruleSets,
    classes,
  );
  // One recipient, one projection: elder (see the route's rationale).
  const outcome = await narrate(verdict, "elder", null, knownMedicines);

  // VERBATIM join; empty narration → send NOTHING (VOICE-DELIVERY-SPEC §5).
  const narration = outcome.narration.segments.map((s) => s.text).join("\n");
  // Framed AFTER the verbatim join, so the rules' words travel untouched and
  // only a greeting is added around them.
  const text =
    opts.framing === "reminder" && narration.trim()
      ? frameReminder(narration, opts.framingKey ?? opts.subjectId)
      : narration;
  if (opts.framing === "reminder" && text.trim()) assertNoSelfReport(text);
  if (!text.trim()) {
    return {
      delivery: { ok: false, reason: "empty-narration", retryable: false },
      speech: "not requested",
      narrationFallback: outcome.usedFallback,
    };
  }

  let speech: DeliveryMessage["speech"];
  let speechError: string | null = null;
  if (opts.voiceProfile) {
    const synthesise =
      deps.synthesise ??
      ((req) => new FishVoiceProvider().synthesise(req));
    const synthesis = await synthesise({
      text,
      language: "zh",
      profile: opts.voiceProfile,
    });
    if (synthesis.ok) {
      speech = {
        audio: synthesis.audio,
        format: "mp3",
        durationMs:
          synthesis.durationMs ??
          Math.round(synthesis.audio.byteLength / MP3_BYTES_PER_MS),
      };
    } else {
      // Degrade to text-only, loudly reported — never a substitute message.
      speechError = synthesis.reason;
    }
  }

  const delivery =
    deps.delivery ??
    new LineDelivery({
      channelAccessToken: getLineConfig().channelAccessToken,
    });
  const result = await delivery.send(
    {
      channelUserId: opts.to,
      role: "elder",
      subject: { id: subject.id, displayName: subject.displayName },
    },
    speech ? { text, speech } : { text },
  );

  return {
    delivery: result,
    speech: speech
      ? "delivered"
      : speechError
        ? (`failed: ${speechError}` as const)
        : "not requested",
    narrationFallback: outcome.usedFallback,
  };
}
