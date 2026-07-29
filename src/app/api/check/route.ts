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

type Body = {
  subjectId?: string;
  items?: { text: string; source?: ItemSource }[];
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
  // A check creates one clinical fact and two read-only projections of it.
  // Returning both means switching the dashboard preview cannot accidentally
  // append another regimen snapshot or briefly mislabel one audience's prose
  // as the other's while a second request is in flight.
  const [caregiverOutcome, elderOutcome] = await Promise.all([
    narrate(verdict, "caregiver", null, knownMedicines),
    narrate(verdict, "elder", null, knownMedicines),
  ]);

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
    narrations: {
      caregiver: caregiverOutcome.narration,
      elder: elderOutcome.narration,
    },
    // Carried out to the surface rather than kept internal. A review found the
    // route dropping these while the design document claimed they were
    // reported — which made a documented failure mode false at the only place
    // anyone could observe it.
    narrationMeta: {
      caregiver: {
        fallback: caregiverOutcome.usedFallback,
        rejected: caregiverOutcome.rejected ?? null,
        fallbackViolations: caregiverOutcome.fallbackViolations ?? null,
      },
      elder: {
        fallback: elderOutcome.usedFallback,
        rejected: elderOutcome.rejected ?? null,
        fallbackViolations: elderOutcome.fallbackViolations ?? null,
      },
    },
  });
}
