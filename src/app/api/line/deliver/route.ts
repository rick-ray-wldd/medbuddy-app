/**
 * POST /api/line/deliver — the caregiver-initiated explanation (spec §6.2's
 * one sanctioned outbound): run the check pipeline and deliver the narration
 * to the subject's LINE.
 *
 * Deliberately re-runs the pipeline server-side instead of accepting text
 * from the client: what reaches the elder's phone can only ever be narration
 * the rules produced. The adapter then enforces its own guards (§6.1 links,
 * §6.5 subject, limits) before anything is sent.
 *
 * Speech is optional: with FISH_AUDIO_API_KEY set and a `voiceId` (a cloned
 * caregiver voice, Ray's fish.ts), the narration is synthesised and delivered
 * as [text, audio]; otherwise text only. A failed synthesis degrades to
 * text-only and is reported in the response — never a silent drop, never a
 * substitute message (§6.6).
 *
 * ⚠️ Demo-grade: no auth on this route yet (matches the rest of the app).
 * Decide with Ray before anything public-facing.
 */

import { NextResponse } from "next/server";
import { getRegistry } from "@/lib/registry";
import { buildVerdict } from "@/lib/verdict/build";
import { narrate } from "@/lib/narration/narrate";
import { findSubject } from "@/lib/subjects";
import { FishVoiceProvider } from "@/lib/voice/fish";
import { defaultVoice, findDemoVoice } from "@/lib/voice/profiles";
import { LineDelivery } from "@/lib/delivery/line/LineDelivery";
import { getLineConfig } from "@/lib/delivery/line/config";
import {
  getDemoLinePair,
  recipientForDemoRole,
} from "@/lib/delivery/line/demo-pair";
import type { ItemSource } from "@/lib/grounding/types";
import type { NarrationAudience } from "@/lib/narration/types";
import type { DeliveryMessage } from "@/lib/delivery/types";

type Body = {
  subjectId?: string;
  items?: { text: string; source?: ItemSource }[];
  audience?: NarrationAudience;
  /** Fish external voice id of a calibrated caregiver voice (optional) */
  voiceId?: string;
};

/** Fish synthesises 128 kbps CBR mp3 (fish.ts) → ~16 bytes per ms. */
const MP3_BYTES_PER_MS = 16;

export async function POST(request: Request): Promise<NextResponse> {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const subject = findSubject(body.subjectId ?? "");
  if (!subject) {
    return NextResponse.json({ error: "unknown subject" }, { status: 400 });
  }

  const demoPair = getDemoLinePair();
  if (subject.id !== demoPair.subjectId) {
    return NextResponse.json(
      { error: "the demo supports one fixed care subject" },
      { status: 400 },
    );
  }

  const to = recipientForDemoRole("elder");
  if (!to) {
    return NextResponse.json(
      { error: "no demo elder recipient: set LINE_DEMO_ELDER_USER_ID" },
      { status: 400 },
    );
  }

  // Same pipeline as /api/check — grounding → rules → verdict → narration.
  const submitted = (body.items ?? []).filter((i) => i.text.trim().length > 0);
  const audience: NarrationAudience =
    body.audience === "caregiver" ? "caregiver" : "elder";
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
  const outcome = await narrate(verdict, audience, null, knownMedicines);

  // VERBATIM join — the adapter must receive exactly what narration produced.
  const text = outcome.narration.segments.map((s) => s.text).join("\n");

  // VOICE-DELIVERY-SPEC §5: empty narration → send NOTHING. No default text.
  if (!text.trim()) {
    return NextResponse.json(
      { delivery: { ok: false, reason: "empty-narration", retryable: false } },
      { status: 200 },
    );
  }

  // Optional speech: cloned caregiver voice via Fish (mp3 — the LINE adapter
  // accepts mp3 directly, verified drift in its README).
  let speech: DeliveryMessage["speech"];
  let speechError: string | null = null;
  // A named voice wins; otherwise the deployment's configured one, which is
  // absent unless MEDBUDDY_DEMO_VOICE_ID is set. No voice → no synthesis → no
  // request leaves the process.
  const profile = body.voiceId
    ? (findDemoVoice(body.voiceId) ?? {
        id: `fish:${body.voiceId}`,
        subjectId: subject.id,
        displayName: subject.displayName,
        provider: "fish" as const,
        externalVoiceId: body.voiceId,
        createdAt: "",
        consent: {
          statement:
            "Supplied per-request; this repository holds no consent record for it.",
          givenAt: "",
        },
      })
    : defaultVoice();

  if (profile) {
    const synthesis = await new FishVoiceProvider().synthesise({
      text,
      language: "zh",
      profile,
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
      // Degrade to text-only, loudly reported to the caller — never a
      // substitute message to the recipient (§6.6).
      speechError = synthesis.reason;
    }
  }

  const delivery = new LineDelivery({
    channelAccessToken: getLineConfig().channelAccessToken,
  });
  const result = await delivery.send(
    {
      channelUserId: to,
      role: audience === "caregiver" ? "caregiver" : "elder",
      subject: { id: subject.id, displayName: subject.displayName },
    },
    speech ? { text, speech } : { text },
  );

  return NextResponse.json({
    delivery: result,
    speech: speech ? "delivered" : speechError ? `failed: ${speechError}` : "not requested",
    narrationFallback: outcome.usedFallback,
  });
}
