/**
 * Run a check: resolve what was submitted, evaluate the rules, narrate.
 *
 * The route is thin on purpose. Everything it does is in src/lib, under test;
 * this file only reads a request and shapes a response.
 */

import { NextResponse } from "next/server";
import { getRegistry } from "@/lib/registry";
import { buildVerdict } from "@/lib/verdict/build";
import { narrate } from "@/lib/narration/narrate";
import { findSubject } from "@/lib/subjects";
import type { ItemSource } from "@/lib/grounding/types";
import type { NarrationAudience } from "@/lib/narration/types";

type Body = {
  subjectId?: string;
  items?: { text: string; source?: ItemSource }[];
  audience?: NarrationAudience;
};

export async function POST(request: Request) {
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

  const submitted = (body.items ?? []).filter((i) => i.text.trim().length > 0);
  const audience: NarrationAudience = body.audience === "elder" ? "elder" : "caregiver";

  const { resolver, ruleSets, classes, knownMedicines, logStore } = getRegistry();

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

  // No model is wired up in this build, so narration is the deterministic
  // route. The seam is here: pass a Narrator and its output is validated
  // against the verdict before it is returned, and rejected if it deviates.
  const outcome = await narrate(verdict, audience, null, knownMedicines);

  // Every check becomes a point in the record. The signal a clinician can use
  // is the change between captures, and there is no change without a history.
  const capturedAt = new Date().toISOString();
  await logStore.appendSnapshot({
    id: `${subject.id}:${capturedAt}`,
    subjectId: subject.id,
    capturedAt,
    capturedByCarerId: "carer-demo",
    items: verdict.items,
    verdict,
  });

  return NextResponse.json({
    verdict,
    narration: outcome.narration,
    // Surfaced rather than hidden: if a model's narration had been rejected,
    // the reader should be able to find out that it was.
    narrationFallback: outcome.usedFallback,
  });
}
