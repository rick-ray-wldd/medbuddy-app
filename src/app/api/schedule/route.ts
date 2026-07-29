import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { findSubject } from "@/lib/subjects";
import { BlobScheduleStore } from "@/lib/schedule/store";
import { validateSlots } from "@/lib/schedule/due";
import type { SubjectSchedule } from "@/lib/schedule/types";

/**
 * Caregiver CRUD for the medication-time reminder schedule.
 *
 * PUT replaces the whole schedule for a subject (slots are a small bounded
 * set, ≤4). Validation lives in lib/schedule/due.ts: ≤4 slots, ≥60 min
 * apart, none in quiet hours (22:00–07:00) — the bounds that keep §6.2's
 * exception from becoming a burst.
 *
 * ⚠️ Demo-grade: no auth (matches the rest of the app).
 */

const store = new BlobScheduleStore();

export async function GET(req: Request): Promise<NextResponse> {
  const subjectId = new URL(req.url).searchParams.get("subjectId") ?? "";
  if (!findSubject(subjectId)) {
    return NextResponse.json({ error: "unknown subject" }, { status: 400 });
  }
  return NextResponse.json({ schedule: await store.get(subjectId) });
}

export async function PUT(req: Request): Promise<NextResponse> {
  let body: {
    subjectId?: string;
    slots?: { timeOfDay: string; enabled?: boolean }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const subject = findSubject(body.subjectId ?? "");
  if (!subject) {
    return NextResponse.json({ error: "unknown subject" }, { status: 400 });
  }
  const slots = body.slots ?? [];
  const invalid = validateSlots(slots);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  // Carry per-slot state across edits when the time is unchanged, so editing
  // one slot does not re-arm another that already fired today.
  const previous = await store.get(subject.id);
  const schedule: SubjectSchedule = {
    subjectId: subject.id,
    createdByCarerId: "carer-demo",
    slots: slots.map((s) => {
      const kept = previous?.slots.find((p) => p.timeOfDay === s.timeOfDay);
      return {
        id: kept?.id ?? randomUUID(),
        timeOfDay: s.timeOfDay,
        enabled: s.enabled ?? true,
        lastAttemptDate: kept?.lastAttemptDate,
        lastResult: kept?.lastResult,
      };
    }),
  };
  await store.put(schedule);
  return NextResponse.json({ schedule });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const subjectId = new URL(req.url).searchParams.get("subjectId") ?? "";
  if (!findSubject(subjectId)) {
    return NextResponse.json({ error: "unknown subject" }, { status: 400 });
  }
  await store.remove(subjectId);
  return NextResponse.json({ schedule: null });
}
