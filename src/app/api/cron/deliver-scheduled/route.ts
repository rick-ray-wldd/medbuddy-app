import { NextResponse } from "next/server";
import { BlobScheduleStore } from "@/lib/schedule/store";
import { runScheduledDeliveries } from "@/lib/schedule/run";

/**
 * GET /api/cron/deliver-scheduled — Vercel Cron target (vercel.json, every
 * minute). Delivers the caregiver-configured medication-time reminders
 * (spec §6.2's sanctioned outbound, multi-slot per the joint 守豐+Ray
 * decision of 2026-07-29 recorded in src/lib/schedule/types.ts).
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}`. Wrong/missing →
 * 401, no body, nothing read. All real logic is in lib/schedule/run.ts,
 * tested offline.
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
