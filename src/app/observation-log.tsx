"use client";

/**
 * The running record, newest first.
 *
 * A caregiver types a paragraph into LINE and has no way to know it arrived.
 * This is that confirmation — and it is deliberately the raw list rather than
 * a count, because the thing she needs to check is that the record holds *her
 * words*, which a number cannot show her.
 *
 * Ordered newest-first, the opposite of the clinician sheet. The sheet leads
 * with self-medication because that is what changes a prescription; she leads
 * with the last thing she said because that is what she is verifying.
 */

import { useCallback, useEffect, useState } from "react";

type Row = {
  observedAt: string;
  kind: string;
  note: string;
  viaLine: boolean;
};

type Payload = {
  total: number;
  snapshots: number;
  lastCapturedAt: string | null;
  observations: Row[];
};

const KIND_LABEL: Record<string, string> = {
  symptom: "症狀",
  self_medication: "自行用藥",
  alcohol: "飲酒",
  missed_dose: "漏服",
  other: "其他",
};

function when(iso: string): string {
  // Taipei, because the record is about his days rather than the server's.
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function ObservationLog({ subjectId }: { subjectId: string }) {
  const [data, setData] = useState<Payload | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/preview/observations?subjectId=${encodeURIComponent(subjectId)}`,
      );
      if (res.ok) setData(await res.json());
    } catch {
      /* the card stays empty; nothing here is load-bearing */
    }
  }, [subjectId]);

  useEffect(() => {
    void load();
    // Re-reads when the tab is returned to, which is exactly when a caregiver
    // comes back from typing into LINE on her phone.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return (
    <section className="medical-card" aria-labelledby="observation-log-heading">
      <div className="card-heading">
        <div>
          <span className="step-label">追蹤</span>
          <h2 id="observation-log-heading" className="card-title">
            記下來的事
          </h2>
          <p className="card-description">
            照顧者在網頁或 LINE 打的每一段話,原文保存。用藥核對 {data?.snapshots ?? 0} 次
            {data?.lastCapturedAt ? ` · 最近一次 ${when(data.lastCapturedAt)}` : ""}。
          </p>
        </div>
      </div>

      {!data ? (
        <p className="text-sm text-[var(--muted)]">讀取中…</p>
      ) : data.observations.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          還沒有紀錄。在下方「記一件事」打一段話,或直接傳訊息給 LINE bot。
        </p>
      ) : (
        <>
          <ul className="obs-log">
            {data.observations.map((o, i) => (
              <li key={i}>
                <span className={`obs-kind obs-${o.kind}`}>
                  {KIND_LABEL[o.kind] ?? o.kind}
                </span>
                <span className="obs-when">{when(o.observedAt)}</span>
                <span className="obs-note">{o.note}</span>
                {o.viaLine && <span className="obs-via">LINE</span>}
              </li>
            ))}
          </ul>
          {data.total > data.observations.length && (
            <p className="text-sm text-[var(--muted)] mt-2">
              共 {data.total} 筆,這裡顯示最近 {data.observations.length} 筆。
              回診單會帶上全部。
            </p>
          )}
        </>
      )}
    </section>
  );
}
