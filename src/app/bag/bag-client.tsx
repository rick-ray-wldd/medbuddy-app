"use client";

/**
 * Photograph a medication bag, see what was read off it.
 *
 * Two inputs rather than one control with a mode: `capture="environment"`
 * opens the camera directly, a plain picker opens the roll. On a phone these
 * are one tap each; behind a segmented control they are two.
 *
 * ## The table shows what was NOT read, as prominently as what was
 *
 * A blank cell is the useful output. It says the bag may well carry that
 * information and we do not have it, which is the thing a caregiver can act on
 * — and the alternative, a plausible value quietly filled in, is what the
 * whole extraction path is built to prevent.
 */

import { useRef, useState } from "react";
import Link from "next/link";

type Field = {
  value: string | null;
  status: "observed" | "partially_legible" | "not_visible" | "conflicting";
  evidence: string | null;
  locationHint: string | null;
};

type Row = {
  rowIndex: number;
  printedName: Field;
  strength: Field;
  dosePerAdministration: Field;
  frequency: Field;
  route: Field;
  timing: Field;
  durationDays: Field;
  quantity: Field;
};

type Extraction = {
  rows: Row[];
  provenance: { institution: Field; department: Field; dispensedOn: Field };
  patientIdentifyingTextDetected: boolean;
  reviewReasons: string[];
};

const COLUMNS: { key: keyof Row; label: string }[] = [
  { key: "printedName", label: "藥品名稱" },
  { key: "strength", label: "含量" },
  { key: "dosePerAdministration", label: "每次" },
  { key: "frequency", label: "頻次" },
  { key: "timing", label: "時間" },
  { key: "route", label: "途徑" },
  { key: "durationDays", label: "天數" },
  { key: "quantity", label: "總量" },
];

function Cell({ field }: { field: Field }) {
  if (field.value === null) {
    return (
      <td className="border border-slate-300 px-3 py-2 align-top">
        <span className="text-amber-700 text-sm">
          {field.status === "conflicting" ? "寫法不一致" : "未讀到"}
        </span>
      </td>
    );
  }
  return (
    <td className="border border-slate-300 px-3 py-2 align-top">
      <span className="text-slate-900">{field.value}</span>
      {field.status === "partially_legible" && (
        <span className="ml-1 text-amber-700 text-sm">(部分模糊)</span>
      )}
      {/* The quote it came from, so a caregiver can check against the bag in
          their hand rather than trusting the row. */}
      {field.evidence && field.evidence !== field.value && (
        <span className="block text-xs text-slate-500 mt-0.5">
          原文:{field.evidence}
        </span>
      )}
    </td>
  );
}

export function BagClient({ subjectId }: { subjectId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    setExtraction(null);
    setPreview(URL.createObjectURL(file));

    const body = new FormData();
    body.append("subjectId", subjectId);
    body.append("image", file);

    try {
      const res = await fetch("/api/ocr/bag", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "image_too_small" ? "照片太小,字看不清楚,請靠近一點重拍" : data.error);
        return;
      }
      setExtraction(data.extraction);
    } catch {
      setError("送出失敗,請再試一次");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          className="rounded-lg bg-slate-900 px-5 py-3 text-white text-lg disabled:opacity-50"
        >
          拍藥袋
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-slate-400 px-5 py-3 text-lg disabled:opacity-50"
        >
          從相簿選
        </button>
        {/* capture opens the camera; without it the same input opens the roll. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          hidden
          onChange={(e) => e.target.files?.[0] && send(e.target.files[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => e.target.files?.[0] && send(e.target.files[0])}
        />
      </div>

      {busy && <p className="text-slate-600">正在讀藥袋上的字…</p>}
      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-900">
          {error}
        </p>
      )}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="剛拍的藥袋" className="max-h-64 rounded-lg border" />
      )}

      {extraction && (
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3">
            <p className="font-medium text-amber-900">這是讀出來的草稿,還不是紀錄。</p>
            <p className="text-sm text-amber-900 mt-1">
              這一版不會自動寫入用藥紀錄。請逐列對照手上的藥袋,再回工作台輸入已確認的藥名。系統只照抄看得見的字,不會補上沒印出來的東西。
            </p>
            {extraction.reviewReasons.length > 0 && (
              <ul className="mt-2 text-sm text-amber-900 list-disc pl-5">
                {extraction.reviewReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100">
                  {COLUMNS.map((c) => (
                    <th
                      key={String(c.key)}
                      className="border border-slate-300 px-3 py-2 text-left font-medium"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {extraction.rows.map((row) => (
                  <tr key={row.rowIndex}>
                    {COLUMNS.map((c) => (
                      <Cell key={String(c.key)} field={row[c.key] as Field} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="text-sm text-slate-700 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt>院所</dt>
            <dd>{extraction.provenance.institution.value ?? "未讀到"}</dd>
            <dt>科別</dt>
            <dd>{extraction.provenance.department.value ?? "未讀到"}</dd>
            <dt>調劑日期</dt>
            <dd>{extraction.provenance.dispensedOn.value ?? "未讀到"}</dd>
          </dl>

          {extraction.patientIdentifyingTextDetected && (
            <p className="text-sm text-slate-600">
              這張照片上有姓名之類的個人資料。系統沒有讀取、也沒有儲存那些欄位。
            </p>
          )}

          <Link href="/" className="inline-flex rounded-lg bg-teal-700 px-5 py-3 font-medium text-white">
            回工作台手動核對
          </Link>
        </div>
      )}
    </div>
  );
}
