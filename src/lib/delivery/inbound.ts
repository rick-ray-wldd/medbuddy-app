/**
 * Inbound seam: the LINE adapter hands every normalised inbound message here.
 *
 * ⚠️ OWNERSHIP: Ray owns this file (spec §3, §5). This version replaces the
 * original stub (2026-07-28, approved by 守豐 to unblock the two-way demo) —
 * Ray: reshape freely; the adapter only ever calls `handleInbound(msg)`.
 *
 * What it does now: an elder TEXTS a medicine name → the same pipeline as
 * /api/check runs (grounding → rules → verdict → elder narration) → the
 * narration is pushed back over LINE. He speaks to ask, never to answer
 * (§6.3): the reply is initiated by his own question (§6.2), and its content
 * can only ever be rule-produced narration — nothing here composes text.
 *
 * AUDIO messages are received, logged and kept OUT of this flow on purpose:
 * transcription (Mandarin, possibly Taiwanese-mixed) is a product decision
 * upstream (spec §5), not transport. Until an STT lands, a voice message is
 * recorded-and-dropped, never answered wrongly.
 */

// Pipeline modules are imported lazily inside the text branch: the registry
// is `server-only` and heavy, and the webhook import chain must stay light.
import type { Delivery } from "./types";

export type InboundMessage = {
  channelUserId: string;
  receivedAt: string; // ISO 8601
  providerMessageId: string; // for idempotency
  body:
    | { kind: "text"; text: string }
    | { kind: "audio"; audio: Uint8Array; format: string; durationMs?: number };
};

/**
 * DEMO mapping: which subject a LINE user may ask about. One known elder →
 * one subject. An unknown sender gets no reply at all — never a guessed
 * subject (§6.5: wrong-person findings are the worst error this product can
 * make) and never a composed "who are you?" (§6.4).
 */
function subjectIdFor(channelUserId: string): string | null {
  if (
    process.env.LINE_ELDER_USER_ID &&
    channelUserId === process.env.LINE_ELDER_USER_ID
  ) {
    return process.env.LINE_ELDER_SUBJECT_ID ?? "subj-father";
  }
  return null;
}

export type InboundDeps = {
  /** injectable so tests run offline; defaults to the LINE adapter */
  delivery?: Delivery;
};

export async function handleInbound(
  msg: InboundMessage,
  deps: InboundDeps = {},
): Promise<void> {
  // Logging rule: ids and kinds only — never message text or audio.
  console.log("[medbuddy] inbound", {
    channelUserId: msg.channelUserId,
    kind: msg.body.kind,
    providerMessageId: msg.providerMessageId,
  });

  if (msg.body.kind === "audio") {
    // Received and recorded; answering requires transcription, which is
    // upstream's decision. Never a substitute reply (§6.6/§6.3).
    console.log("[medbuddy] audio inbound recorded, no STT wired — not answered", {
      providerMessageId: msg.providerMessageId,
    });
    return;
  }

  const subjectId = subjectIdFor(msg.channelUserId);
  if (!subjectId) {
    console.log("[medbuddy] inbound from unmapped user — no reply", {
      channelUserId: msg.channelUserId,
    });
    return;
  }

  try {
    const [{ findSubject }, { getRegistry }, { buildVerdict }, { narrate }] =
      await Promise.all([
        import("../subjects"),
        import("../registry"),
        import("../verdict/build"),
        import("../narration/narrate"),
      ]);

    const subject = findSubject(subjectId);
    if (!subject) {
      console.error("[medbuddy] mapped subject not found", { subjectId });
      return;
    }

    // The elder's message is treated as one cupboard item (he texts a
    // medicine name). Sentence understanding is upstream work, not done here.
    const { resolver, ruleSets, classes, knownMedicines } = getRegistry();
    const verdict = buildVerdict(
      {
        id: subject.id,
        displayName: subject.displayName,
        ageYears: subject.ageYears,
        conditions: subject.conditions,
      },
      resolver.resolveAll([{ text: msg.body.text.trim(), source: "unknown" }]),
      ruleSets,
      classes,
    );
    const outcome = await narrate(verdict, "elder", null, knownMedicines);
    const text = outcome.narration.segments.map((s) => s.text).join("\n");

    // Voice when an exact pre-rendered match exists; text-only otherwise.
    const { findPrerenderedSpeech } = await import("./prerendered-speech");
    const speech = await findPrerenderedSpeech(text);

    const delivery =
      deps.delivery ??
      new (await import("./line/LineDelivery")).LineDelivery({
        channelAccessToken: (await import("./line/config")).getLineConfig()
          .channelAccessToken,
      });

    const result = await delivery.send(
      {
        channelUserId: msg.channelUserId,
        role: "elder",
        subject: { id: subject.id, displayName: subject.displayName },
      },
      speech ? { text, speech } : { text },
    );
    console.log("[medbuddy] inbound answered", {
      providerMessageId: msg.providerMessageId,
      ok: result.ok,
      ...(result.ok ? {} : { reason: result.reason }),
    });
  } catch (err) {
    // §6.6 — loud in the logs, silent to the user: no substitute messages.
    console.error("[medbuddy] inbound handling failed", {
      providerMessageId: msg.providerMessageId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
