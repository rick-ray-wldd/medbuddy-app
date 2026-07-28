/**
 * Record something the family noticed.
 *
 * There is no field for an observation reported by the subject, and that is
 * the design rather than an omission: the product never asks the older adult
 * to confirm or deny anything, so there is nowhere to put such an answer.
 */

import { NextResponse } from "next/server";
import { getRegistry } from "@/lib/registry";
import { findSubject } from "@/lib/subjects";
import type { ObservationKind } from "@/lib/log/types";
import { parseObservations } from "@/lib/observations/parse";
import { observationExtractor } from "@/lib/observations/gemini";

const KINDS: ObservationKind[] = [
  "symptom",
  "self_medication",
  "alcohol",
  "missed_dose",
  "other",
];

export async function POST(request: Request) {
  let body: { subjectId?: string; kind?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const subject = findSubject(body.subjectId ?? "");
  if (!subject) return NextResponse.json({ error: "unknown subject" }, { status: 400 });

  const note = (body.note ?? "").trim();
  if (!note) return NextResponse.json({ error: "note is required" }, { status: 400 });

  const { logStore } = getRegistry();
  const observedAt = new Date().toISOString();

  // An explicit kind means the caregiver used the dropdown: take them at their
  // word and record one observation. No kind means they typed a paragraph, so
  // it gets segmented — and every note is checked to be their own words.
  const explicit = KINDS.includes(body.kind as ObservationKind)
    ? (body.kind as ObservationKind)
    : null;

  const parsed = explicit
    ? { observations: [{ kind: explicit, note }], usedFallback: false, rejected: [] }
    : await parseObservations(note, observationExtractor());

  let index = 0;
  for (const observation of parsed.observations) {
    await logStore.appendObservation({
      id: `${subject.id}:${observedAt}:${index++}`,
      subjectId: subject.id,
      observedAt,
      kind: observation.kind,
      // The carer's own words. Rewriting them would lose the specificity that
      // makes an observation usable in a consultation — 「上樓梯到二樓開始喘」
      // is something a doctor can act on; 「最近比較累」 is not.
      note: observation.note,
      reportedByCarerId: "carer-demo",
    });
  }

  return NextResponse.json({
    ok: true,
    observedAt,
    recorded: parsed.observations,
    // Surfaced rather than hidden: if the model produced something that was
    // not in what they typed, the caregiver should be able to see that it was
    // thrown away.
    usedFallback: parsed.usedFallback,
    rejected: parsed.rejected,
  });
}
