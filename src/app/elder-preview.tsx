"use client";

/**
 * The elder's phone, on the dashboard.
 *
 * A reviewer opens the web app and meets the caregiver's half of the product.
 * The other half — the half the whole design is bent around — happens on a
 * phone they do not have, so it has to be shown rather than described.
 *
 * ## It renders the real message, not a mock-up
 *
 * The text comes from `/api/preview/elder`, which runs the same narration and
 * the same framing his LINE receives. A screenshot would drift the first time
 * the narrator changed a word; this cannot.
 *
 * ## Why the segment kinds are visible here and not on his phone
 *
 * He should read a sentence, not a taxonomy. A reviewer needs to see which
 * sentence is the regulator's own words and which is the product stating its
 * limit, because that distinction is the safety argument — so the colouring
 * lives on the dashboard and never travels to LINE.
 */

import { useCallback, useEffect, useState } from "react";

type Segment = { kind: string; text: string };

type Preview = {
  subject: { id: string; displayName: string };
  hasSnapshot: boolean;
  capturedAt?: string;
  text?: string;
  slots: string[];
  segments?: Segment[];
  usedFallback?: boolean;
};

const KIND_NOTE: Record<string, string> = {
  verified: "來源原文,逐字引用 —— 主管機關核可的警語或準則條文",
  explained: "規則產生的說明,寫給這位讀者",
  action: "下一步。永遠停在藥師或醫師,不替他決定",
  coverage: "本次比對涵蓋到哪裡,以及沒涵蓋什麼",
  unresolved: "認不出來的品項 —— 說認不出來,不猜",
};

export function ElderPreview({ subjectId }: { subjectId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/preview/elder?subjectId=${encodeURIComponent(subjectId)}`);
      if (res.ok) setPreview(await res.json());
    } catch {
      /* the card simply stays empty; nothing here is load-bearing */
    }
  }, [subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function makeQr() {
    setQrBusy(true);
    setQrError(null);
    try {
      const res = await fetch("/api/summary/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQrError(data.error ?? "產生失敗");
        return;
      }
      setQr(data.qrDataUrl ?? data.dataUrl ?? null);
    } catch {
      setQrError("產生失敗");
    } finally {
      setQrBusy(false);
    }
  }

  return (
    <section className="medical-card" aria-labelledby="elder-preview-heading">
      <div className="card-heading">
        <div>
          <span className="step-label">長輩端</span>
          <h2 id="elder-preview-heading" className="card-title">
            他的手機上會看到什麼
          </h2>
          <p className="card-description">
            這不是示意圖。下面的文字由與 LINE 相同的敘述與框架產生,規則改了它就跟著改。
          </p>
        </div>
      </div>

      {!preview ? (
        <p className="text-sm text-[var(--muted)]">讀取中…</p>
      ) : !preview.hasSnapshot ? (
        <p className="text-sm text-[var(--muted)]">
          還沒有核對過的用藥紀錄。先在上面完成一次核對,這裡就會出現他會收到的訊息。
        </p>
      ) : (
        <>
          <div className="phone-frame">
            <div className="phone-bubble">
              {preview.text?.split("\n").map((line, i) =>
                line.trim() === "" ? (
                  <div key={i} className="h-2" />
                ) : (
                  <p key={i}>{line}</p>
                ),
              )}
            </div>
            <p className="phone-voice">
              🔊 這段會用 Serin 的聲音唸出來(孫女語氣)
            </p>
          </div>

          {preview.segments && preview.segments.length > 0 && (
            <div className="segment-key">
              <p className="segment-key-title">每一句從哪裡來</p>
              <ul>
                {preview.segments.map((s, i) => (
                  <li key={i}>
                    <span className={`segment-tag segment-${s.kind}`}>{s.kind}</span>
                    <span className="segment-note">
                      {KIND_NOTE[s.kind] ?? "產品自己的說明文字"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="card-actions">
        <button type="button" onClick={makeQr} disabled={qrBusy} className="secondary-action">
          {qrBusy ? "產生中…" : "產生回診單 QR"}
        </button>
        <span className={`inline-status${qrError ? " error" : ""}`} role="status">
          {qrError ?? "8 小時後失效。醫師掃描後看到用藥清單與家屬觀察表。"}
        </span>
      </div>

      {qr && (
        <div className="qr-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="回診單 QR code" width={180} height={180} />
          <p>
            長輩把這張圖拿給醫師掃。他收到的是<strong>圖片而不是連結</strong> ——
            照顧者可以收連結,他不行。
          </p>
        </div>
      )}
    </section>
  );
}
