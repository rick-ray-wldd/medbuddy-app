"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 服藥提醒 — caregiver-configured schedule (spec §6.2's sanctioned outbound,
 * multi-slot per the joint decision recorded in src/lib/schedule/types.ts).
 * This card carries times only; what is sent at those times is always the
 * rule pipeline's own narration in the configured demo voice.
 */

type Slot = {
  id?: string;
  timeOfDay: string;
  enabled: boolean;
  lastAttemptDate?: string;
  lastResult?: string;
};

const ERROR_LABELS: Record<string, string> = {
  "too-many-slots": "最多 4 個時段",
  "slots-too-close": "時段之間至少要相隔 60 分鐘",
  "slot-in-quiet-hours": "22:00–07:00 是安靜時段,不能設定提醒",
  "invalid-time": "時間格式不正確",
  "no-slots": "至少要有一個時段",
};

export function ScheduleCard({ subjectId }: { subjectId: string }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [saved, setSaved] = useState<Slot[] | null>(null);
  const [state, setState] = useState<"loading" | "idle" | "busy">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/schedule?subjectId=${subjectId}`);
      const data = (await res.json()) as { schedule: { slots: Slot[] } | null };
      setSlots(data.schedule?.slots ?? []);
      setSaved(data.schedule?.slots ?? null);
    } catch {
      setSlots([]);
    } finally {
      setState("idle");
    }
  }, [subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          slots: slots.map((s) => ({ timeOfDay: s.timeOfDay, enabled: s.enabled })),
        }),
      });
      const data = (await res.json()) as { schedule?: { slots: Slot[] }; error?: string };
      if (!res.ok || !data.schedule) {
        setError(ERROR_LABELS[data.error ?? ""] ?? data.error ?? "儲存失敗");
      } else {
        setSlots(data.schedule.slots);
        setSaved(data.schedule.slots);
      }
    } catch {
      setError("連線失敗");
    } finally {
      setState("idle");
    }
  }

  async function removeAll() {
    setState("busy");
    setError(null);
    try {
      await fetch(`/api/schedule?subjectId=${subjectId}`, { method: "DELETE" });
      setSlots([]);
      setSaved(null);
    } finally {
      setState("idle");
    }
  }

  if (state === "loading") return null;

  return (
    <section className="rounded-lg border border-neutral-300 p-4 dark:border-neutral-700">
      <h3 className="mb-1 font-medium">服藥提醒</h3>
      <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
        到點時,用藥說明會以語音送到長輩的 LINE。最多 4 個時段、彼此相隔至少
        60 分鐘;22:00–07:00 不發送。錯過的時段不補送。
      </p>

      <div className="space-y-2">
        {slots.map((slot, i) => (
          <div key={slot.id ?? i} className="flex flex-wrap items-center gap-3">
            <input
              type="time"
              value={slot.timeOfDay}
              onChange={(e) =>
                setSlots((all) =>
                  all.map((s, j) => (j === i ? { ...s, timeOfDay: e.target.value } : s)),
                )
              }
              className="rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 dark:border-neutral-700"
            />
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={slot.enabled}
                onChange={(e) =>
                  setSlots((all) =>
                    all.map((s, j) => (j === i ? { ...s, enabled: e.target.checked } : s)),
                  )
                }
              />
              啟用
            </label>
            {slot.lastAttemptDate && (
              <span className="text-xs text-neutral-500">
                {slot.lastAttemptDate} {slot.lastResult ?? ""}
              </span>
            )}
            <button
              onClick={() => setSlots((all) => all.filter((_, j) => j !== i))}
              className="text-sm text-neutral-500 hover:text-red-600"
            >
              移除
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {slots.length < 4 && (
          <button
            onClick={() =>
              setSlots((all) => [...all, { timeOfDay: "08:00", enabled: true }])
            }
            className="rounded-lg border border-neutral-300 px-4 py-1.5 text-sm dark:border-neutral-700"
          >
            + 新增時段
          </button>
        )}
        <button
          onClick={save}
          disabled={state === "busy" || slots.length === 0}
          className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {state === "busy" ? "儲存中…" : "儲存排程"}
        </button>
        {saved !== null && slots.length === 0 && (
          <button
            onClick={removeAll}
            className="text-sm text-neutral-500 hover:text-red-600"
          >
            取消所有提醒
          </button>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}
