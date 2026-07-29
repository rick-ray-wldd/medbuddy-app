"use client";

import { useState } from "react";
import type { SeededSubject } from "@/lib/subjects";
import type { Verdict } from "@/lib/verdict/types";
import type { Narration, NarrationAudience } from "@/lib/narration/types";
import type { ItemSource } from "@/lib/grounding/types";
import { DictateButton, SpeakButton } from "./speech";

const SOURCE_LABELS: Record<ItemSource, string> = {
  prescription: "處方",
  otc: "自己買的",
  supplement: "保健食品",
  leftover: "上次剩的",
  unknown: "不確定",
};

type CheckResponse = { verdict: Verdict; narration: Narration };

function toLines(subject: SeededSubject): string {
  return subject.cupboard.map((item) => `${item.text} | ${item.source}`).join("\n");
}

function parseLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, source] = line.split("|").map((part) => part.trim());
      const known = (Object.keys(SOURCE_LABELS) as ItemSource[]).includes(
        source as ItemSource,
      );
      return { text: name, source: (known ? source : "unknown") as ItemSource };
    });
}

export default function CheckClient({ subject }: { subject: SeededSubject }) {
  const [text, setText] = useState(() => toLines(subject));
  const [audience, setAudience] = useState<NarrationAudience>("caregiver");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(next: NarrationAudience = audience) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          items: parseLines(text),
          audience: next,
        }),
      });
      if (!response.ok) throw new Error(`伺服器回應 ${response.status}`);
      setResult(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "核對失敗");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  function changeAudience(next: NarrationAudience) {
    if (next === audience || busy) return;
    setAudience(next);
    void run(next);
  }

  function replaceMedicationText(next: string) {
    setText(next);
    setResult(null);
  }

  function appendMedicationText(said: string) {
    setText((current) => (current ? `${current}\n${said}` : said));
    setResult(null);
  }

  return (
    <div className="workspace-grid">
      <div className="workspace-main">
        <section className="medical-card" aria-labelledby="medication-input-heading">
          <div className="card-heading">
            <div>
              <span className="step-label">STEP 01</span>
              <h2 id="medication-input-heading" className="card-title">
                建立完整用藥清單
              </h2>
              <p className="card-description">
                處方藥、自己購買的藥、保健食品與剩藥都要列入。每行一項，直線後方標記來源。
              </p>
            </div>
            <span className="fixed-subject-chip">固定對象：{subject.displayName}</span>
          </div>

          <label htmlFor="cupboard" className="field-label">
            家中實際使用的藥品
          </label>
          <div className="source-legend" aria-label="可用的用藥來源代碼">
            {(Object.entries(SOURCE_LABELS) as Array<[ItemSource, string]>).map(
              ([code, label]) => (
                <span key={code}>{code} = {label}</span>
              ),
            )}
          </div>
          <textarea
            id="cupboard"
            value={text}
            onChange={(event) => replaceMedicationText(event.target.value)}
            rows={7}
            spellCheck={false}
            className="medication-input"
            aria-describedby="medication-format-hint"
          />
          <p id="medication-format-hint" className="mt-2 text-sm text-[var(--muted)]">
            範例：普拿疼膜衣錠500毫克 | otc
          </p>
          <div className="card-actions">
            <DictateButton
              label="按住唸出品名"
              onText={appendMedicationText}
            />
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy || parseLines(text).length === 0}
              className="primary-action"
            >
              {busy ? "正在核對資料…" : "開始用藥核對"}
            </button>
            <span className={`inline-status${error ? " error" : ""}`} role="status">
              {error ?? "不確定的項目會被標出，不會自動猜測。"}
            </span>
          </div>
        </section>

        {result ? (
          <>
            <Result
              data={result}
              audience={audience}
              busy={busy}
              onAudience={changeAudience}
            />
            {audience === "caregiver" ? <Observe subjectId={subject.id} /> : null}
            <Handoff subjectId={subject.id} itemsText={text} />
          </>
        ) : null}
      </div>

      <aside className="workspace-aside" aria-label="Demo 流程與安全邊界">
        <DemoFlow />
        <section className="medical-card safety-card">
          <h2>安全邊界</h2>
          <p>
            MedBuddy 不診斷、不決定停藥或改藥，也不把模糊品名當成已辨識。高風險與不確定內容只會升級給藥師或醫師確認。
          </p>
        </section>
      </aside>
    </div>
  );
}

function DemoFlow() {
  const steps = [
    ["完整列藥", "照顧者補上診間看不到的成藥、保健食品與剩藥"],
    ["資料核對", "只用登記資料與版本化規則產生結構化 verdict"],
    ["記錄觀察", "把症狀、漏服與自行用藥保留成照顧者原話"],
    ["交接照護", "產生回診摘要，或把長者版說明送到固定 LINE 帳號"],
  ] as const;

  return (
    <section className="medical-card">
      <p className="eyebrow">DEMO WORKFLOW</p>
      <h2 className="card-title">一條可講清楚的照護流程</h2>
      <div className="flow-list">
        {steps.map(([title, description], index) => (
          <div className="flow-item" key={title}>
            <span className="flow-index">0{index + 1}</span>
            <div>
              <strong>{title}</strong>
              <span>{description}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Handoff({ subjectId, itemsText }: { subjectId: string; itemsText: string }) {
  return (
    <section className="medical-card handoff-band" aria-labelledby="handoff-heading">
      <div className="card-heading">
        <div>
          <span className="step-label">STEP 04</span>
          <h2 id="handoff-heading" className="card-title">完成照護交接</h2>
          <p className="card-description">
            回診單給醫師快速審閱；LINE 說明固定傳到本次 Demo 的長者手機。
          </p>
        </div>
      </div>
      <div className="handoff-actions">
        <a href={`/summary/${subjectId}`} className="secondary-action">
          查看回診摘要
        </a>
        <SendToLine subjectId={subjectId} itemsText={itemsText} />
      </div>
    </section>
  );
}

/** The only caregiver-initiated outbound message in the demo. */
function SendToLine({ subjectId, itemsText }: { subjectId: string; itemsText: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed">("idle");
  const [reason, setReason] = useState<string | null>(null);

  async function send() {
    setState("busy");
    setReason(null);
    try {
      const response = await fetch("/api/line/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          items: parseLines(itemsText),
        }),
      });
      const data = (await response.json()) as {
        delivery?: { ok: boolean; reason?: string };
      };
      if (response.ok && data.delivery?.ok) {
        setState("sent");
      } else {
        setState("failed");
        setReason(data.delivery?.reason ?? `伺服器回應 ${response.status}`);
      }
    } catch {
      setState("failed");
      setReason("連線失敗");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void send()}
        disabled={state === "busy"}
        className="primary-action"
      >
        {state === "busy"
          ? "正在傳送…"
          : state === "sent"
            ? "已傳到長者 LINE ✓"
            : "傳到長者 LINE"}
      </button>
      <span className={`inline-status${state === "failed" ? " error" : ""}`} role="status">
        {state === "failed" ? `傳送失敗：${reason}` : ""}
      </span>
    </span>
  );
}

function Observe({ subjectId }: { subjectId: string }) {
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("symptom");
  const [state, setState] = useState<"idle" | "busy" | "saved" | "failed">("idle");
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    const trimmed = note.trim();
    if (!trimmed) return;
    setState("busy");
    const response = await fetch("/api/observation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId, kind, note: trimmed }),
    }).catch(() => null);

    if (response?.ok) {
      setSaved(trimmed);
      setNote("");
      setState("saved");
    } else {
      setState("failed");
    }
  }

  return (
    <section className="medical-card" aria-labelledby="observation-heading">
      <div className="card-heading">
        <div>
          <span className="step-label">STEP 03</span>
          <h2 id="observation-heading" className="card-title">記錄照顧觀察</h2>
          <p className="card-description">
            用具體原話記下症狀、漏服或自行用藥，內容會進入回診摘要，不會被改寫成診斷。
          </p>
        </div>
      </div>
      <div className="observation-form">
        <label className="sr-only" htmlFor="observation-kind">觀察類型</label>
        <select
          id="observation-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className="form-control"
        >
          <option value="symptom">症狀</option>
          <option value="self_medication">自行用藥</option>
          <option value="alcohol">飲酒</option>
          <option value="missed_dose">漏服</option>
          <option value="other">其他</option>
        </select>
        <label className="sr-only" htmlFor="observation-note">照顧觀察內容</label>
        <input
          id="observation-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
          }}
          placeholder="例如：晚上腰痛，自己拿了櫃子裡的止痛藥"
          className="form-control note-input"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={!note.trim() || state === "busy"}
          className="secondary-action"
        >
          {state === "busy" ? "記錄中…" : "儲存觀察"}
        </button>
      </div>
      <p className={`mt-3 inline-status${state === "failed" ? " error" : ""}`} role="status">
        {state === "saved" && saved
          ? `已記錄：「${saved}」`
          : state === "failed"
            ? "記錄失敗，請稍後再試。"
            : ""}
      </p>
    </section>
  );
}

function Result({
  data,
  audience,
  busy,
  onAudience,
}: {
  data: CheckResponse;
  audience: NarrationAudience;
  busy: boolean;
  onAudience: (audience: NarrationAudience) => void;
}) {
  const { verdict, narration } = data;

  return (
    <section className="medical-card" aria-labelledby="result-heading">
      <div className="card-heading">
        <div>
          <span className="step-label">STEP 02</span>
          <h2 id="result-heading" className="card-title">
            {verdict.subject.displayName}的核對結果
          </h2>
          <p className="card-description">
            同一份結構化結果，依照顧者與長者的理解需求呈現不同語氣；醫療事實不變。
          </p>
        </div>
        <div className="result-tabs" role="tablist" aria-label="結果閱讀角色">
          {(["caregiver", "elder"] as const).map((next) => (
            <button
              type="button"
              role="tab"
              aria-selected={next === audience}
              aria-controls="result-panel"
              id={`result-tab-${next}`}
              key={next}
              disabled={busy}
              onClick={() => onAudience(next)}
            >
              {next === "caregiver" ? "照顧者詳細版" : "長者 LINE 預覽"}
            </button>
          ))}
        </div>
      </div>

      <div
        id="result-panel"
        role="tabpanel"
        aria-labelledby={`result-tab-${audience}`}
        className="grid gap-5"
      >
        {audience === "elder" ? (
          <p className="channel-hint">
            這裡預覽長者會在 LINE 收到的簡明說明；長者可直接輸入藥名詢問，並使用「再唸一次」播放最近的說明。
          </p>
        ) : null}
        <Coverage verdict={verdict} />
        <div className="narration-stack">
          {narration.segments.map((segment, index) => (
            <SegmentView key={`${segment.kind}-${index}`} segment={segment} />
          ))}
        </div>
        <div className="card-actions">
          <SpeakButton
            text={narration.segments.map((segment) => segment.text).join("。")}
            label="朗讀這份說明"
          />
        </div>
        <Provenance verdict={verdict} />
      </div>
    </section>
  );
}

function Coverage({ verdict }: { verdict: Verdict }) {
  const { itemsSubmitted, itemsResolved, itemsUnresolved } = verdict.coverage;
  const unresolved = verdict.items.filter((item) => !item.resolved);

  return (
    <div>
      <div className="coverage-grid" aria-label="本次資料覆蓋率">
        <div className="coverage-metric">
          <span>送出項目</span>
          <strong>{itemsSubmitted}</strong>
        </div>
        <div className="coverage-metric">
          <span>成功辨識</span>
          <strong>{itemsResolved}</strong>
        </div>
        <div className={`coverage-metric${itemsUnresolved > 0 ? " warning" : ""}`}>
          <span>需要確認</span>
          <strong>{itemsUnresolved}</strong>
        </div>
      </div>

      {unresolved.length > 0 ? (
        <div className="unresolved-panel">
          <strong>以下項目未納入安全判斷，請保留包裝並交由藥師確認：</strong>
          <ul>
            {unresolved.map((item, index) => (
              <li key={`${item.inputText}-${index}`}>
                「{item.inputText}」— {unresolvedReason(item)}
                {item.candidates && item.candidates.length > 0 ? (
                  <ul>
                    {item.candidates.map((candidate) => (
                      <li key={candidate.permit}>
                        {candidate.nameZh}（{candidate.permit}）
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            台灣「健康食品」是法定登記類別；一般保健食品可能沒有登記，因此查不到不代表安全或不安全。
          </p>
        </div>
      ) : null}
    </div>
  );
}

function unresolvedReason(item: Verdict["items"][number]): string {
  if (item.resolved) return "";
  if (item.reason === "ambiguous") return "名稱不夠明確，可能對應多個品項";
  if (item.reason === "matched_without_ingredients") {
    return "找到登記品名，但登記資料沒有記載成分";
  }
  return "目前登記資料中查不到";
}

function SegmentView({ segment }: { segment: Narration["segments"][number] }) {
  if (segment.kind === "verified") {
    return (
      <figure className="narration-segment narration-verified">
        <div className="segment-label">原文引用 · 未經改寫</div>
        <blockquote className="whitespace-pre-wrap">{segment.text}</blockquote>
        {segment.attribution ? (
          <figcaption className="segment-attribution">出處：{segment.attribution}</figcaption>
        ) : null}
      </figure>
    );
  }

  if (segment.kind === "action") {
    return <p className="narration-segment narration-action">{segment.text}</p>;
  }

  if (segment.kind === "coverage") {
    return (
      <p className="narration-segment narration-coverage">
        {segment.text}
        {segment.attribution ? (
          <span className="segment-attribution block">{segment.attribution}</span>
        ) : null}
      </p>
    );
  }

  return <p className="narration-segment bg-[var(--surface-soft)]">{segment.text}</p>;
}

function Provenance({ verdict }: { verdict: Verdict }) {
  return (
    <details className="source-disclosure">
      <summary>檢視本次核對版本</summary>
      <div className="source-content">
        <ul>
          <li>藥品登記擷取於 {verdict.provenance.registers.drugs}</li>
          <li>健康食品登記擷取於 {verdict.provenance.registers.healthFoods}</li>
          {verdict.provenance.ruleSets.map((rule) => (
            <li key={rule.id}>{rule.id} · {rule.version}</li>
          ))}
          {verdict.provenance.skippedRuleSets.map((rule) => (
            <li key={rule.id}>已跳過 {rule.id}：{rule.reason}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}
