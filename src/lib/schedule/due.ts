import {
  GRACE_MINUTES,
  MAX_SLOTS_PER_DAY,
  MIN_SLOT_GAP_MINUTES,
  QUIET_END_MINUTES,
  QUIET_START_MINUTES,
  type ScheduleSlot,
  type SubjectSchedule,
} from "./types";

/**
 * All time logic lives here as pure functions, so every rule that keeps the
 * schedule from becoming a burst (§6.2) is unit-tested offline.
 */

export type TaipeiClock = { date: string; minutesOfDay: number };

/** Current wall clock in Asia/Taipei, injectable everywhere else. */
export function taipeiClock(nowMs: number = Date.now()): TaipeiClock {
  const d = new Date(nowMs);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
  }).format(d); // YYYY-MM-DD
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d); // HH:MM
  return { date, minutesOfDay: parseMinutes(hhmm) };
}

export function parseMinutes(timeOfDay: string): number {
  const m = timeOfDay.match(/^(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) < 24 && Number(m[2]) < 60 ? minutes : NaN;
}

export function isQuietHours(minutesOfDay: number): boolean {
  return minutesOfDay >= QUIET_START_MINUTES || minutesOfDay < QUIET_END_MINUTES;
}

/** null when valid; otherwise a stable kebab-case reason for the UI. */
export function validateSlots(
  slots: Pick<ScheduleSlot, "timeOfDay">[],
): string | null {
  if (slots.length === 0) return "no-slots";
  if (slots.length > MAX_SLOTS_PER_DAY) return "too-many-slots";
  const minutes = slots.map((s) => parseMinutes(s.timeOfDay));
  if (minutes.some(Number.isNaN)) return "invalid-time";
  if (minutes.some(isQuietHours)) return "slot-in-quiet-hours";
  const sorted = [...minutes].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - sorted[i - 1]! < MIN_SLOT_GAP_MINUTES) {
      return "slots-too-close";
    }
  }
  return null;
}

/**
 * Slots that should fire right now: enabled, not yet attempted today, and
 * within [due, due + grace]. Anything past grace is reported separately so
 * the caller can mark it skipped — a late medication reminder is worse than
 * none (§6.6's spirit).
 */
export function dueNow(
  schedule: SubjectSchedule,
  clock: TaipeiClock,
): { due: ScheduleSlot[]; late: ScheduleSlot[] } {
  const due: ScheduleSlot[] = [];
  const late: ScheduleSlot[] = [];
  for (const slot of schedule.slots) {
    if (!slot.enabled) continue;
    if (slot.lastAttemptDate === clock.date) continue;
    const at = parseMinutes(slot.timeOfDay);
    if (Number.isNaN(at) || clock.minutesOfDay < at) continue;
    const minutesPast = clock.minutesOfDay - at;
    if (minutesPast <= GRACE_MINUTES) due.push(slot);
    else late.push(slot);
  }
  return { due, late };
}
