/**
 * POST /api/line/deliver — the caregiver-initiated explanation (spec §6.2's
 * sanctioned outbound): run the check pipeline and deliver the narration to
 * the subject's LINE.
 *
 * The pipeline → narration → synthesis → send core lives in
 * src/lib/delivery/deliver-explanation.ts, shared with the caregiver-
 * configured schedule (/api/cron/deliver-scheduled) so there is exactly one
 * place deciding what may reach the elder. This route keeps: request
 * parsing, the demo-pair recipient checks, and voice-consent resolution
 * (only profiles in the server-side catalogue may be requested — a provider
 * voice id is not proof of consent).
 *
 * ⚠️ Demo-grade: no auth on this route yet (matches the rest of the app).
 */

import { NextResponse } from "next/server";
import { findSubject } from "@/lib/subjects";
import { defaultVoice, findDemoVoice } from "@/lib/voice/profiles";
import {
  getDemoLinePair,
  recipientForDemoRole,
} from "@/lib/delivery/line/demo-pair";
import { deliverExplanationToElder } from "@/lib/delivery/deliver-explanation";
import type { ItemSource } from "@/lib/grounding/types";

type Body = {
  subjectId?: string;
  items?: { text: string; source?: ItemSource }[];
  /** Fish external voice id of a calibrated caregiver voice (optional) */
  voiceId?: string;
};

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

  const profile = body.voiceId ? findDemoVoice(body.voiceId) : defaultVoice();
  if (body.voiceId && !profile) {
    return NextResponse.json(
      { error: "unknown or unconsented voice profile" },
      { status: 400 },
    );
  }

  const outcome = await deliverExplanationToElder({
    subjectId: subject.id,
    items: body.items ?? [],
    to,
    voiceProfile: profile ?? null,
  });

  return NextResponse.json(outcome);
}
