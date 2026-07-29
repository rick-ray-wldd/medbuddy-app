import { NextResponse } from "next/server";
import { BlobScheduleStore } from "@/lib/schedule/store";
import { runScheduledDeliveries } from "@/lib/schedule/run";

/**
 * GET /api/cron/deliver-scheduled — Vercel Cron target. Delivers the
 * caregiver-configured medication-time reminders
 * (spec §6.2's sanctioned outbound, multi-slot per the joint 守豐+Ray
 * decision of 2026-07-29 recorded in src/lib/schedule/types.ts).
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}`. Wrong/missing →
 * 401, no body, nothing read. All real logic is in lib/schedule/run.ts,
 * tested offline.
 *
 * ## The schedule in vercel.json is daily, and this endpoint wants a minute
 *
 * `due.ts` computes what is owed from the wall clock on each tick, so a
 * reminder set for 08:00 arrives at 08:00 only if something calls this around
 * then. Every minute is the right frequency and it is not available: a Vercel
 * Hobby account permits one cron run per day and **refuses the entire
 * deployment** for anything finer — a deploy that had nothing to do with
 * reminders failed on this, which is how it was found.
 *
 * So the platform trigger is daily and the demo drives this endpoint directly.
 * Nothing in the scheduling logic assumes a particular tick rate; raising the
 * cron on a Pro plan is a one-line change to vercel.json and no change here.
 */
// A tick may deliver several slots, each with synthesis + hosting.
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }
  const summary = await runScheduledDeliveries({ store: new BlobScheduleStore() });
  return NextResponse.json(summary);
}
