/**
 * What the family has recorded lately.
 *
 * The dashboard could re-derive this from the clinician sheet, but the sheet
 * is ordered for a prescriber — self-medication first, because that is the row
 * that changes a dose. A caregiver checking her own work wants the opposite:
 * newest first, so she can see the thing she typed a minute ago actually
 * landed.
 *
 * Same records, different order, and the order is the product decision.
 */

import { NextResponse } from "next/server";
import { getRegistry } from "@/lib/registry";
import { findSubject } from "@/lib/subjects";

export async function GET(request: Request) {
  const subjectId =
    new URL(request.url).searchParams.get("subjectId") ?? "subj-father";
  const subject = findSubject(subjectId);
  if (!subject) return NextResponse.json({ error: "unknown subject" }, { status: 400 });

  const { logStore } = getRegistry();
  const log = await logStore.read(subject.id).catch(() => null);

  const observations = [...(log?.observations ?? [])]
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
    .slice(0, 12)
    .map((o) => ({
      observedAt: o.observedAt,
      kind: o.kind,
      // Verbatim, here as everywhere. This view exists so she can confirm the
      // record holds her words, which it cannot do if it shows a summary.
      note: o.note,
      viaLine: o.reportedByCarerId.startsWith("line:"),
    }));

  return NextResponse.json({
    subject: { id: subject.id, displayName: subject.displayName },
    total: log?.observations.length ?? 0,
    snapshots: log?.snapshots.length ?? 0,
    lastCapturedAt: log?.snapshots.at(-1)?.capturedAt ?? null,
    observations,
  });
}
