"use client";

/**
 * Read a medication bag into the list, without the list trusting it.
 *
 * ## Why the names land in the textarea rather than in the record
 *
 * The extraction is a transcription of a photograph. It has not been through
 * grounding, no rule has seen it, and no verdict exists for it. Writing it
 * straight to a `RegimenSnapshot` would give OCR output a privilege that text
 * typed by hand does not have — and the thing typed by hand is the one a
 * person read off the bag in front of them.
 *
 * So the names go into the same textarea, on the same lines, in the same
 * format. From there they walk the identical path: `/api/check` → resolve →
 * rules → verdict. If a name was misread, the resolver says it cannot identify
 * it, exactly as it would for a typo.
 *
 * The caregiver still has to press 開始用藥核對. That press is the human review
 * the OCR contract makes unconditional, and it is not a checkbox somewhere —
 * it is the thing they were going to do anyway.
 *
 * ## What is shown and what is not
 *
 * Rows whose `printedName` came back blank are listed but not inserted: there
 * is nothing to insert, and a placeholder line would be a guess. They are named
 * so the caregiver knows to type that one from the bag in their hand.
 */

import { useRef, useState } from "react";

type Field = {
  value: string | null;
  status: "observed" | "partially_legible" | "not_visible" | "conflicting";
  evidence: string | null;
};

type Row = {
  rowIndex: number;
  printedName: Field;
  printedNameZh: Field;
  strength: Field;
  dosePerAdministration: Field;
  frequency: Field;
  timing: Field;
  durationDays: Field;
};

type Extraction = {
  rows: Row[];
  provenance: { institution: Field; department: Field; dispensedOn: Field };
  patientIdentifyingTextDetected: boolean;
  reviewReasons: string[];
};

/**
 * The line handed to the medication list.
 *
 * Prefers the Chinese name over the whole cell, because the TFDA register
 * lists Chinese names: 「TAMIFLU 75MG 克流感膠囊75MG」 resolves to nothing and
 * 「克流感膠囊75MG」 resolves exactly. Both are on the bag; this picks the one
 * the resolver can use, and falls back to the whole cell when there is no
 * Chinese name to pick.
 *
 * A bag is a prescription, so every line it produces is marked as one.
 */
function toLine(row: Row): string | null {
  const name = (row.printedNameZh.value ?? row.printedName.value)?.trim();
  if (!name) return null;
  return `${name} | rx`;
}

function summarise(row: Row): string {
  const parts = [
    row.strength.value,
    row.dosePerAdministration.value,
    row.frequency.value,
    row.timing.value ?? "沒印時間",
    row.durationDays.value ? `${row.durationDays.value} 天` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function BagCapture({
  subjectId,
  onLines,
  disabled,
}: {
  subjectId: string;
  /** Appends to the medication textarea. Never replaces what is already there. */
  onLines: (lines: string[]) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [added, setAdded] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    setExtraction(null);
    setAdded(false);

    const body = new FormData();
    body.append("subjectId", subjectId);
    body.append("image", file);

    try {
      const res = await fetch("/api/ocr/bag", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "image_too_small"
            ? "照片太小,字看不清楚,請靠近一點重拍"
            : data.error === "not_a_medication_bag"
              ? "這張照片看起來不是藥袋"
              : data.error === "no_rows_found"
                ? "沒有讀到任何藥品列"
                : (data.error ?? "讀取失敗"),
        );
        return;
      }
      setExtraction(data.extraction);
    } catch {
      setError("送出失敗,請再試一次");
    } finally {
      setBusy(false);
    }
  }

  function addToList() {
    if (!extraction) return;
    const lines = extraction.rows.map(toLine).filter((l): l is string => l !== null);
    if (lines.length === 0) return;
    onLines(lines);
    setAdded(true);
  }

  const readable =
    extraction?.rows.filter((r) => r.printedNameZh.value ?? r.printedName.value) ?? [];
  const unreadable =
    extraction?.rows.filter((r) => !(r.printedNameZh.value ?? r.printedName.value)) ?? [];

  return (
    <div className="bag-capture">
      <div className="card-actions">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={busy || disabled}
          className="secondary-action"
        >
          {busy ? "正在讀藥袋…" : "拍藥袋"}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || disabled}
          className="secondary-action"
        >
          上傳藥袋照片
        </button>
        <span className={`inline-status${error ? " error" : ""}`} role="status">
          {error ?? "只照抄藥袋上印的字,沒印的欄位會留白。"}
        </span>
      </div>

      {/* capture opens the camera on a phone; without it the same input opens
          the photo library. Two buttons, one tap each. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void send(f);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void send(f);
        }}
      />

      {extraction && (
        <div className="bag-draft">
          <p className="bag-draft-title">
            讀到 {extraction.rows.length} 列 —— 這是草稿,還不是紀錄
          </p>

          <ul className="bag-draft-rows">
            {readable.map((row) => (
              <li key={row.rowIndex}>
                <strong>{row.printedNameZh.value ?? row.printedName.value}</strong>
                <span className="bag-draft-detail">{summarise(row)}</span>
              </li>
            ))}
            {unreadable.map((row) => (
              <li key={row.rowIndex} className="bag-draft-unreadable">
                第 {row.rowIndex + 1} 列的藥名沒讀出來,請對照藥袋自己輸入
                <span className="bag-draft-detail">{summarise(row)}</span>
              </li>
            ))}
          </ul>

          {extraction.reviewReasons.length > 0 && (
            <ul className="bag-draft-reasons">
              {extraction.reviewReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}

          <p className="bag-draft-provenance">
            {[
              extraction.provenance.institution.value,
              extraction.provenance.department.value,
              extraction.provenance.dispensedOn.value,
            ]
              .filter(Boolean)
              .join(" · ") || "來源欄位未讀到"}
            {extraction.patientIdentifyingTextDetected &&
              " · 照片上有個資,系統沒有讀取或儲存"}
          </p>

          <div className="card-actions">
            <button
              type="button"
              onClick={addToList}
              disabled={readable.length === 0 || added}
              className="primary-action"
            >
              {added
                ? `已加入 ${readable.length} 項,請核對後開始用藥核對`
                : `把這 ${readable.length} 項加進清單`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
