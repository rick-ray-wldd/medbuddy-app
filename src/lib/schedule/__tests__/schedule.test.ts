import { describe, expect, it, vi } from "vitest";
import { dueNow, parseMinutes, validateSlots } from "../due";
import { InMemoryScheduleStore } from "../store";
import { runScheduledDeliveries } from "../run";
import type { SubjectSchedule } from "../types";

/**
 * The bounds that keep §6.2's scheduled exception from becoming a burst,
 * plus cron idempotency. All offline, all injected.
 */

const clock = (date: string, hhmm: string) => ({
  date,
  minutesOfDay: parseMinutes(hhmm),
});

function schedule(
  slots: Partial<SubjectSchedule["slots"][number]>[],
): SubjectSchedule {
  return {
    subjectId: "subj-father",
    createdByCarerId: "carer-demo",
    slots: slots.map((s, i) => ({
      id: `slot-${i}`,
      timeOfDay: "08:00",
      enabled: true,
      ...s,
    })),
  };
}

describe("validateSlots — burst-prevention bounds", () => {
  it("accepts up to four spaced daytime slots", () => {
    expect(
      validateSlots([
        { timeOfDay: "08:00" },
        { timeOfDay: "12:00" },
        { timeOfDay: "18:00" },
        { timeOfDay: "21:00" },
      ]),
    ).toBeNull();
  });

  it("rejects a fifth slot", () => {
    expect(
      validateSlots(
        ["07:30", "09:00", "12:00", "15:00", "18:00"].map((t) => ({ timeOfDay: t })),
      ),
    ).toBe("too-many-slots");
  });

  it("rejects slots closer than 60 minutes", () => {
    expect(
      validateSlots([{ timeOfDay: "08:00" }, { timeOfDay: "08:30" }]),
    ).toBe("slots-too-close");
  });

  it("rejects quiet-hours slots (22:00–07:00) — the elder is never woken", () => {
    expect(validateSlots([{ timeOfDay: "22:00" }])).toBe("slot-in-quiet-hours");
    expect(validateSlots([{ timeOfDay: "06:59" }])).toBe("slot-in-quiet-hours");
    expect(validateSlots([{ timeOfDay: "07:00" }])).toBeNull();
    expect(validateSlots([{ timeOfDay: "21:59" }])).toBeNull();
  });

  it("rejects malformed times and empty schedules", () => {
    expect(validateSlots([{ timeOfDay: "8am" }])).toBe("invalid-time");
    expect(validateSlots([])).toBe("no-slots");
  });
});

describe("dueNow — grace, idempotency and skips", () => {
  it("fires within the grace window only", () => {
    const s = schedule([{ timeOfDay: "08:00" }]);
    expect(dueNow(s, clock("2026-07-29", "07:59")).due).toHaveLength(0);
    expect(dueNow(s, clock("2026-07-29", "08:00")).due).toHaveLength(1);
    expect(dueNow(s, clock("2026-07-29", "08:10")).due).toHaveLength(1);
  });

  it("past grace → late (to be skipped), never due — no back-filled reminders", () => {
    const s = schedule([{ timeOfDay: "08:00" }]);
    const r = dueNow(s, clock("2026-07-29", "08:11"));
    expect(r.due).toHaveLength(0);
    expect(r.late).toHaveLength(1);
  });

  it("already attempted today → silent; a new day re-arms", () => {
    const s = schedule([{ timeOfDay: "08:00", lastAttemptDate: "2026-07-29" }]);
    expect(dueNow(s, clock("2026-07-29", "08:05")).due).toHaveLength(0);
    expect(dueNow(s, clock("2026-07-30", "08:05")).due).toHaveLength(1);
  });

  it("disabled slots never fire", () => {
    const s = schedule([{ timeOfDay: "08:00", enabled: false }]);
    const r = dueNow(s, clock("2026-07-29", "08:05"));
    expect(r.due).toHaveLength(0);
    expect(r.late).toHaveLength(0);
  });
});

describe("runScheduledDeliveries — one attempt per slot per day", () => {
  const okDeliver = () =>
    vi.fn(async (_opts: { items: { text: string }[] }) => {
      void _opts;
      return {
        delivery: { ok: true as const },
        speech: "delivered" as const,
        narrationFallback: false,
      };
    });

  it("delivers a due slot once; the same tick re-run delivers nothing", async () => {
    const store = new InMemoryScheduleStore();
    await store.put(schedule([{ timeOfDay: "08:00" }]));
    const deliver = okDeliver();
    const deps = {
      store,
      clock: clock("2026-07-29", "08:01"),
      deliver,
      elderRecipient: () => "U-elder",
    };

    const first = await runScheduledDeliveries(deps);
    expect(first.attempted).toEqual([
      { subjectId: "subj-father", slotId: "slot-0", result: "delivered" },
    ]);
    expect(deliver).toHaveBeenCalledTimes(1);
    // reminder content is the subject's own list through the real pipeline:
    expect(deliver.mock.calls[0]![0].items.length).toBeGreaterThan(0);

    const second = await runScheduledDeliveries(deps);
    expect(second.attempted).toHaveLength(0);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("a failed attempt still consumes the slot — never auto-retried (§6.2)", async () => {
    const store = new InMemoryScheduleStore();
    await store.put(schedule([{ timeOfDay: "08:00" }]));
    const deliver = vi.fn(async () => ({
      delivery: { ok: false as const, reason: "rate-limited", retryable: true },
      speech: "not requested" as const,
      narrationFallback: false,
    }));
    const deps = {
      store,
      clock: clock("2026-07-29", "08:01"),
      deliver,
      elderRecipient: () => "U-elder",
    };

    const first = await runScheduledDeliveries(deps);
    expect(first.attempted[0]!.result).toBe("failed: rate-limited");
    const second = await runScheduledDeliveries(deps);
    expect(second.attempted).toHaveLength(0);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect((await store.get("subj-father"))!.slots[0]!.lastResult).toBe(
      "failed: rate-limited",
    );
  });

  it("late slots are marked skipped and never delivered", async () => {
    const store = new InMemoryScheduleStore();
    await store.put(schedule([{ timeOfDay: "08:00" }]));
    const deliver = okDeliver();
    const summary = await runScheduledDeliveries({
      store,
      clock: clock("2026-07-29", "09:30"),
      deliver,
      elderRecipient: () => "U-elder",
    });
    expect(summary.skippedLate).toHaveLength(1);
    expect(deliver).not.toHaveBeenCalled();
    expect((await store.get("subj-father"))!.slots[0]!.lastResult).toBe(
      "skipped-late",
    );
  });
});
