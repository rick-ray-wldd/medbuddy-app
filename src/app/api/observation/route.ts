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

  const kind = KINDS.includes(body.kind as ObservationKind)
    ? (body.kind as ObservationKind)
    : "other";

  const { logStore } = getRegistry();
  const observedAt = new Date().toISOString();

  await logStore.appendObservation({
    id: `${subject.id}:${observedAt}`,
    subjectId: subject.id,
    observedAt,
    kind,
    // Kept in the carer's own words. Rewriting it would lose the specificity
    // that makes it usable in a consultation.
    note,
    reportedByCarerId: "carer-demo",
  });

  return NextResponse.json({ ok: true, observedAt });
}
