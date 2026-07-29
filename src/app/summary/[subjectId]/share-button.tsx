"use client";

import { useState } from "react";

type Share = { url: string; qrDataUrl: string; subjectName: string };

/**
 * Turns the sheet into something that can be carried into a consulting room.
 *
 * Two destinations, and they are not the same action:
 *
 * - **Show the QR here** — the caregiver is at the appointment themselves.
 * - **Send it to LINE** — they are not, so the older adult carries it. This is
 *   the case the whole product exists for.
 *
 * The QR is an image rather than a link, which is why it may go to him at all:
 * `LINE-ADAPTER-SPEC` §6.1 forbids sending him a tappable link because he taps
 * links without checking. He does not tap this; he holds it up.
 */
export default function ShareButton({
  subjectId,
}: {
  subjectId: string;
}) {
  const [share, setShare] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/summary/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `伺服器回應 ${res.status}`);
      setShare(data as Share);
    } catch (e) {
      setError(e instanceof Error ? e.message : "產生失敗");
    } finally {
      setBusy(false);
    }
  }

  async function sendToLine() {
    if (!share) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/summary/share/to-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `伺服器回應 ${res.status}`);
      setSent(data.deliveredAt ?? "已送出");
    } catch (e) {
      setError(e instanceof Error ? e.message : "傳送失敗");
    } finally {
      setBusy(false);
    }
  }

  if (!share) {
    return (
      <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <h2 className="mb-2 font-medium">帶進診間</h2>
        <p className="mb-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          產生一個 QR code。醫師掃一下就看得到這張單子,不需要註冊、不需要安裝。
          連結含個人健康資料,所以幾個小時後就會失效。
        </p>
        <button
          onClick={generate}
          disabled={busy}
          className="rounded-lg bg-neutral-900 px-5 py-2.5 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "產生中…" : "產生 QR code"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="mb-3 font-medium">請醫師掃描</h2>
      <div className="flex flex-wrap items-start gap-6">
        {/* White plate regardless of theme: a dark-mode QR does not scan. */}
        <div className="rounded-lg bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={share.qrDataUrl}
            alt={`${share.subjectName}的回診單 QR code`}
            width={200}
            height={200}
          />
        </div>
        <div className="flex-1 space-y-3 text-sm">
          <p className="leading-relaxed text-neutral-600 dark:text-neutral-400">
            如果您陪同回診,直接把這個畫面拿給醫師掃。
            如果不能陪同,傳到 {share.subjectName} 的 LINE,讓他自己帶去。
          </p>
          <button
            onClick={sendToLine}
            disabled={busy}
            className="rounded-lg border border-neutral-900 px-4 py-2 font-medium disabled:opacity-50 dark:border-neutral-100"
          >
            {busy ? "傳送中…" : `傳到 ${share.subjectName} 的 LINE`}
          </button>
          {sent && <p className="text-neutral-600 dark:text-neutral-400">已傳送。</p>}
          {error && <p className="text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
