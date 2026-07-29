/**
 * Caregiver-configured medication-time reminders.
 *
 * Product basis: spec §6.2's sanctioned exception ("the scheduled explanation
 * the caregiver has configured"), amended by joint agreement of 守豐 + Ray on
 * 2026-07-29 (in person) to allow up to four daily slots. Every constraint
 * that made the original exception safe is kept structurally:
 *   - content is ALWAYS the rule-produced elder narration — no reminder
 *     prose exists anywhere in this feature (§6.3/§6.4);
 *   - slots are bounded (≤4/day, ≥60 min apart, none during quiet hours) so
 *     the schedule can never become an unsolicited burst;
 *   - a missed slot is skipped, never back-filled; failures are recorded,
 *     never retried (§6.2, §6.6).
 */

export type ScheduleSlot = {
  /** stable id so per-slot state survives edits */
  id: string;
  /** "HH:MM", Asia/Taipei */
  timeOfDay: string;
  enabled: boolean;
  /** "YYYY-MM-DD" (Taipei) of the last attempt — the idempotency key */
  lastAttemptDate?: string;
  /** outcome of the last attempt, for the dashboard; never retried */
  lastResult?: "delivered" | "delivered-text-only" | `failed: ${string}` | "skipped-late";
};

export type SubjectSchedule = {
  subjectId: string;
  createdByCarerId: string;
  slots: ScheduleSlot[];
};

export const MAX_SLOTS_PER_DAY = 4;
export const MIN_SLOT_GAP_MINUTES = 60;
/** No audio before 07:00 or from 22:00 — the elder is never woken by a bot. */
export const QUIET_START_MINUTES = 22 * 60;
export const QUIET_END_MINUTES = 7 * 60;
/** A slot more than this many minutes past due is skipped, never back-sent. */
export const GRACE_MINUTES = 10;
