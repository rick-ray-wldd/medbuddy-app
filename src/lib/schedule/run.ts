import { findSubject } from "../subjects";
import { defaultVoice } from "../voice/profiles";
import { recipientForDemoRole } from "../delivery/line/demo-pair";
import {
  deliverExplanationToElder,
  type ExplanationOutcome,
} from "../delivery/deliver-explanation";
import { dueNow, taipeiClock, type TaipeiClock } from "./due";
import type { ScheduleStore } from "./store";
import type { ScheduleSlot } from "./types";

/**
 * One cron tick. Pure orchestration, everything injectable for tests.
 *
 * Idempotency: a slot is stamped with today's date BEFORE its delivery is
 * attempted — an attempt, successful or not, consumes the slot for the day.
 * That ordering is deliberate and mirrors §6.2: never auto-retry; a failed
 * reminder surfaces on the dashboard instead of firing again.
 */

export type RunDeps = {
  store: ScheduleStore;
  clock?: TaipeiClock;
  deliver?: typeof deliverExplanationToElder;
  /** injectable recipient lookup so tests run env-free */
  elderRecipient?: () => string | null;
};

export type RunSummary = {
  attempted: { subjectId: string; slotId: string; result: string }[];
  skippedLate: { subjectId: string; slotId: string }[];
};

export async function runScheduledDeliveries(deps: RunDeps): Promise<RunSummary> {
  const clock = deps.clock ?? taipeiClock();
  const deliver = deps.deliver ?? deliverExplanationToElder;
  const elderRecipient =
    deps.elderRecipient ?? (() => recipientForDemoRole("elder"));

  const summary: RunSummary = { attempted: [], skippedLate: [] };

  for (const schedule of await deps.store.list()) {
    const { due, late } = dueNow(schedule, clock);
    if (due.length === 0 && late.length === 0) continue;

    // Anything past grace: consumed for today as skipped, never back-sent.
    for (const slot of late) {
      stamp(slot, clock, "skipped-late");
      summary.skippedLate.push({ subjectId: schedule.subjectId, slotId: slot.id });
      console.log("[medbuddy] reminder slot skipped (past grace)", {
        subjectId: schedule.subjectId, slotId: slot.id,
      });
    }

    for (const slot of due) {
      // Stamp first — the attempt consumes the slot regardless of outcome.
      stamp(slot, clock, undefined);
      await deps.store.put(schedule);

      const subject = findSubject(schedule.subjectId);
      const to = elderRecipient();
      let outcome: ExplanationOutcome | null = null;
      if (subject && to) {
        outcome = await deliver({
          subjectId: subject.id,
          // The reminder's content is the subject's own medication list run
          // through the SAME pipeline as every other explanation — this
          // feature composes zero text (§6.3/§6.4).
          items: subject.cupboard,
          to,
          voiceProfile: defaultVoice() ?? null,
        });
      }

      slot.lastResult = !outcome
        ? `failed: ${!subject ? "unknown-subject" : "no-elder-recipient"}`
        : outcome.delivery.ok
          ? outcome.speech === "delivered"
            ? "delivered"
            : "delivered-text-only"
          : `failed: ${outcome.delivery.reason}`;
      await deps.store.put(schedule);

      summary.attempted.push({
        subjectId: schedule.subjectId,
        slotId: slot.id,
        result: slot.lastResult,
      });
      console.log("[medbuddy] reminder slot attempted", {
        subjectId: schedule.subjectId, slotId: slot.id, result: slot.lastResult,
      });
    }
  }
  return summary;
}

function stamp(
  slot: ScheduleSlot,
  clock: TaipeiClock,
  result: ScheduleSlot["lastResult"],
): void {
  slot.lastAttemptDate = clock.date;
  slot.lastResult = result;
}
