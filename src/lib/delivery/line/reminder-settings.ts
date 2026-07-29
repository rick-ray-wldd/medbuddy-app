import { randomUUID } from "node:crypto";
import { validateSlots } from "../../schedule/due";
import { BlobScheduleStore, type ScheduleStore } from "../../schedule/store";
import type { SubjectSchedule } from "../../schedule/types";

/**
 * The in-LINE editing operations behind the reminders card. Same store and
 * same validation as the web dashboard (/api/schedule) — one set of bounds,
 * two front doors. Error strings are fixed interface furniture in the
 * caregiver's language; they never carry medication content.
 */

const ERROR_MESSAGES: Record<string, string> = {
  "too-many-slots": "最多只能設 4 個時段。",
  "slots-too-close": "時段之間至少要相隔 1 小時。",
  "slot-in-quiet-hours": "22:00–07:00 是安靜時段,不能設提醒。",
  "invalid-time": "時間格式不正確。",
  "no-slots": "至少要有一個時段。",
};

function defaultStore(): ScheduleStore {
  return new BlobScheduleStore();
}

export async function addReminderSlot(
  subjectId: string,
  pickedTime: string | undefined,
  store: ScheduleStore = defaultStore(),
): Promise<
  { ok: true; schedule: SubjectSchedule } | { ok: false; message: string }
> {
  // Client input (datetimepicker or a crafted postback) — validated like any
  // other. LINE's time mode sends "HH:mm".
  const time = (pickedTime ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, message: ERROR_MESSAGES["invalid-time"]! };
  }

  const previous = await store.get(subjectId);
  const slots = [
    ...(previous?.slots ?? []),
    { timeOfDay: time },
  ];
  const invalid = validateSlots(slots);
  if (invalid) {
    return { ok: false, message: ERROR_MESSAGES[invalid] ?? "無法新增這個時段。" };
  }

  const schedule: SubjectSchedule = {
    subjectId,
    createdByCarerId: previous?.createdByCarerId ?? "carer-demo",
    slots: [
      ...(previous?.slots ?? []),
      { id: randomUUID(), timeOfDay: time, enabled: true },
    ],
  };
  await store.put(schedule);
  // The just-written schedule is returned so the caller can render it
  // directly — the confirmation card must never depend on reading back a
  // store that is only eventually consistent.
  return { ok: true, schedule };
}

export async function removeReminderSlot(
  subjectId: string,
  slotId: string,
  store: ScheduleStore = defaultStore(),
): Promise<SubjectSchedule | null> {
  const previous = await store.get(subjectId);
  if (!previous) return null;
  const remaining = previous.slots.filter((s) => s.id !== slotId);
  if (remaining.length === 0) {
    await store.remove(subjectId);
    return null;
  }
  const schedule = { ...previous, slots: remaining };
  await store.put(schedule);
  return schedule;
}
