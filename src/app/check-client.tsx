"use client";

import { useState } from "react";
import type { SeededSubject } from "@/lib/subjects";
import { CONDITION_LABELS } from "@/lib/subjects";
import type { Verdict } from "@/lib/verdict/types";
import type { Narration, NarrationAudience } from "@/lib/narration/types";
import type { ItemSource } from "@/lib/grounding/types";

const SOURCE_LABELS: Record<ItemSource, string> = {
  prescription: "處方",
  otc: "自己買的",
  supplement: "保健食品",
  leftover: "上次剩的",
  unknown: "不確定",
};

type CheckResponse = { verdict: Verdict; narration: Narration };

function toLines(subject: SeededSubject): string {
  return subject.cupboard.map((c) => `${c.text} | ${c.source}`).join("\n");
}

function parseLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, source] = line.split("|").map((p) => p.trim());
      const known = (Object.keys(SOURCE_LABELS) as ItemSource[]).includes(
        source as ItemSource,
      );
      return { text: name, source: (known ? source : "unknown") as ItemSource };
    });
}

export default function CheckClient({ subjects }: { subjects: SeededSubject[] }) {
  const [subject, setSubject] = useState(subjects[0]);
  const [text, setText] = useState(toLines(subjects[0]));
  const [audience, setAudience] = useState<NarrationAudience>("caregiver");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(next: NarrationAudience = audience) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          items: parseLines(text),
          audience: next,
        }),
      });
      if (!res.ok) throw new Error(`伺服器回應 ${res.status}`);
      setResult(await res.json());
    } catch (e) {
      // Nothing is shown rather than something wrong.
      setError(e instanceof Error ? e.message : "核對失敗");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  function pick(next: SeededSubject) {
    setSubject(next);
    setText(toLines(next));
    setResult(null);
  }

  return (
    <div className="space-y-7">
      <section>
        <h2 className="mb-2 font-medium">這是誰的藥</h2>
        {/* A carer may hold one parent or twelve residents. Which person this
            is about is a choice, never an assumption. */}
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => pick(s)}
              className={`rounded-lg border px-4 py-2 transition ${
                s.id === subject.id
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-300 hover:border-neutral-500 dark:border-neutral-700"
              }`}
            >
              {s.displayName}
              <span className="ml-2 text-sm opacity-70">{s.ageYears} 歲</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          已記錄的狀況:
          {subject.conditions.length === 0
            ? "(無)"
            : subject.conditions.map((c) => CONDITION_LABELS[c]).join("、")}
        </p>
      </section>

      <section>
        <label htmlFor="cupboard" className="mb-2 block font-medium">
          櫃子裡有什麼
        </label>
        <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
          一行一項。處方藥、自己買的、上次剩的、鄰居給的 —— 都寫進來,
          因為醫師看得到的只有處方。
        </p>
        <textarea
          id="cupboard"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          spellCheck={false}
          className="w-full rounded-lg border border-neutral-300 bg-transparent p-3 font-mono text-[15px] leading-relaxed outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-300"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => run()}
            disabled={busy}
            className="rounded-lg bg-neutral-900 px-5 py-2.5 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {busy ? "核對中…" : "核對"}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </section>

      {result && (
        <Result
          data={result}
          audience={audience}
          onAudience={(a) => {
            setAudience(a);
            void run(a);
          }}
        />
      )}
    </div>
  );
}

function Result({
  data,
  audience,
  onAudience,
}: {
  data: CheckResponse;
  audience: NarrationAudience;
  onAudience: (a: NarrationAudience) => void;
}) {
  const { verdict, narration } = data;

  return (
    <section className="space-y-5 border-t border-neutral-200 pt-7 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Whose medicines these are, on the result itself. */}
        <h2 className="text-xl font-semibold">{verdict.subject.displayName}的核對結果</h2>
        <div className="flex gap-1 rounded-lg border border-neutral-300 p-1 dark:border-neutral-700">
          {(["caregiver", "elder"] as const).map((a) => (
            <button
              key={a}
              onClick={() => onAudience(a)}
              className={`rounded px-3 py-1 text-sm ${
                a === audience
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : ""
              }`}
            >
              {a === "caregiver" ? "子女看到的" : "長輩看到的"}
            </button>
          ))}
        </div>
      </div>

      <Coverage verdict={verdict} />

      <div className="space-y-3">
        {narration.segments.map((segment, i) => (
          <SegmentView key={i} segment={segment} />
        ))}
      </div>

      <Provenance verdict={verdict} />
    </section>
  );
}

function Coverage({ verdict }: { verdict: Verdict }) {
  const { itemsSubmitted, itemsResolved, itemsUnresolved } = verdict.coverage;
  const unresolved = verdict.items.filter((i) => !i.resolved);

  return (
    <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <p>
        送出 <strong>{itemsSubmitted}</strong> 項 · 辨識出{" "}
        <strong>{itemsResolved}</strong> 項 · 無法辨識{" "}
        <strong>{itemsUnresolved}</strong> 項
      </p>
      {unresolved.length > 0 && (
        <ul className="mt-2 space-y-1 text-neutral-600 dark:text-neutral-400">
          {unresolved.map((item, i) => (
            <li key={i}>
              「{item.inputText}」—{" "}
              {item.resolved
                ? null
                : item.reason === "ambiguous"
                  ? "名稱不夠明確,無法確定是哪一個品項"
                  : item.reason === "matched_without_ingredients"
                    ? "查得到這個品名,但登記沒有記載成分"
                    : "任何登記都查不到"}
            </li>
          ))}
        </ul>
      )}
      {itemsUnresolved > 0 && (
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          這幾項不在這次核對的範圍內。台灣的「健康食品」是法定登記類別,
          家裡常見的保健食品多半沒有登記,也就查不到 —— 那正是醫師看不見的部分。
        </p>
      )}
    </div>
  );
}

/**
 * The seam, made visible.
 *
 * A reader has to be able to tell what a regulator or a published criterion
 * said from what this product wrote. Quoted text is set apart and attributed;
 * everything else is plainly ours.
 */
function SegmentView({ segment }: { segment: Narration["segments"][number] }) {
  if (segment.kind === "verified") {
    return (
      <figure className="rounded-lg border-l-4 border-emerald-600 bg-emerald-50/60 p-4 dark:bg-emerald-950/25">
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
          原文引用 · 未經改寫
        </div>
        <blockquote className="whitespace-pre-wrap leading-relaxed">
          {segment.text}
        </blockquote>
        {segment.attribution && (
          <figcaption className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
            出處:{segment.attribution}
          </figcaption>
        )}
      </figure>
    );
  }

  if (segment.kind === "action") {
    return (
      <p className="rounded-lg border border-neutral-900 px-4 py-3 font-medium dark:border-neutral-100">
        {segment.text}
      </p>
    );
  }

  if (segment.kind === "coverage") {
    return (
      <p className="rounded-lg bg-amber-50 px-4 py-3 text-[15px] leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        {segment.text}
        {segment.attribution && (
          <span className="mt-1 block text-xs opacity-75">{segment.attribution}</span>
        )}
      </p>
    );
  }

  return <p className="px-1 leading-relaxed">{segment.text}</p>;
}

function Provenance({ verdict }: { verdict: Verdict }) {
  return (
    <details className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <summary className="cursor-pointer font-medium">這次核對用了什麼版本</summary>
      <ul className="mt-3 space-y-1 text-neutral-600 dark:text-neutral-400">
        <li>藥品登記擷取於 {verdict.provenance.registers.drugs}</li>
        <li>健康食品登記擷取於 {verdict.provenance.registers.healthFoods}</li>
        {verdict.provenance.ruleSets.map((r) => (
          <li key={r.id}>
            {r.id} · {r.version}
          </li>
        ))}
        {verdict.provenance.skippedRuleSets.map((r) => (
          <li key={r.id}>已跳過 {r.id}:{r.reason}</li>
        ))}
      </ul>
    </details>
  );
}
