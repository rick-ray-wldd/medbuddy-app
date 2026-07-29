import Link from "next/link";
import type { ObservationKind } from "@/lib/log/types";
import { CONDITION_LABELS, type SeededSubject } from "@/lib/subjects";
import { buildClinicianSummary, type ClinicianSummary } from "@/lib/summary/clinician";
import type { SubjectLog } from "@/lib/log/types";
import type { Verdict } from "@/lib/verdict/types";

/**
 * The sheet a family hands to a clinician.
 *
 * Shared by two routes deliberately. `/summary/[subjectId]` is the caregiver
 * reviewing it before an appointment; `/summary/s/[token]` is the clinician
 * reading it after scanning the QR the family is holding. The same page,
 * because the caregiver must be able to see exactly what the doctor will —
 * handing over something you have not read is how a family loses the room.
 */

const SOURCE_LABELS: Record<string, string> = {
  prescription: "處方藥",
  otc: "自己買的成藥",
  leftover: "上次剩下的",
  supplement: "保健食品",
  unknown: "來源不確定",
};

const KIND_LABELS: Record<string, string> = {
  symptom: "症狀",
  self_medication: "自行用藥",
  alcohol: "飲酒",
  missed_dose: "漏服",
  other: "其他",
};

export function SummarySheet({
  subject,
  verdict,
  log,
  expiresAt,
}: {
  subject: SeededSubject;
  verdict: Verdict;
  log: SubjectLog;
  /** Present on the shared view: tells the reader the page will stop working. */
  expiresAt?: number;
}) {
  const summary = buildClinicianSummary(verdict, log, new Date().toISOString());

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 print:py-0">
      <Header subject={subject} summary={summary} />
      <Questions summary={summary} />
      <Medications summary={summary} />
      <Unidentified summary={summary} />
      <Change summary={summary} />
      <Observations summary={summary} />
      <Footer summary={summary} />
      {expiresAt !== undefined && (
        <p className="mt-4 rounded bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400 print:hidden">
          這個連結會在 {new Date(expiresAt).toLocaleString("zh-TW", { hour12: false }).slice(0, 16)} 後失效。
          回診單含個人健康資料,連結刻意設為短效。
        </p>
      )}
    </main>
  );
}

export function NoHistory({
  subject,
  sharedView = false,
}: {
  subject: SeededSubject;
  sharedView?: boolean;
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">{subject.displayName}的用藥摘要</h1>
      <p className="mt-4 text-neutral-600 dark:text-neutral-400">
        尚未有任何核對紀錄。{sharedView ? "請家屬先完成一次核對。" : "請先在首頁完成一次核對,這張單子才有內容。"}
      </p>
      {!sharedView && (
        <Link className="mt-6 inline-block underline" href="/">
          回到首頁
        </Link>
      )}
    </main>
  );
}

function Header({
  subject,
  summary,
}: {
  subject: SeededSubject;
  summary: ClinicianSummary;
}) {
  return (
    <header className="border-b-2 border-neutral-900 pb-4 dark:border-neutral-100">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {summary.subject.displayName}
          {summary.subject.ageYears ? ` · ${summary.subject.ageYears} 歲` : null}
        </h1>
        <span className="text-sm text-neutral-500">
          {summary.generatedAt.slice(0, 16).replace("T", " ")}
        </span>
      </div>
      <p className="mt-2 text-sm">
        已記錄狀況:
        {subject.conditions.length === 0
          ? "(無)"
          : subject.conditions.map((c) => CONDITION_LABELS[c]).join("、")}
      </p>
      {/* The line that says why the sheet exists. */}
      <p className="mt-3 rounded bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900">
        其中 <strong>{summary.notInPrescriptionRecord}</strong> 項不在處方紀錄中
        —— 成藥、上次剩下的、或家屬自行購買的保健食品。
      </p>
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Questions({ summary }: { summary: ClinicianSummary }) {
  if (summary.questions.length === 0) return null;
  return (
    <Section title="家屬想請教的問題">
      <ol className="space-y-4">
        {summary.questions.map((q) => (
          <li key={q.ruleId} className="border-l-4 border-neutral-900 pl-3 dark:border-neutral-100">
            <p className="font-medium">
              關於 {q.about.join("、")} —— 想請教{" "}
              {q.escalateTo === "physician" ? "醫師" : "藥師"}
            </p>
            <blockquote className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {q.quoted}
            </blockquote>
            <p className="mt-1 text-xs text-neutral-500">出處:{q.attribution}</p>
            {q.limits && (
              <p className="mt-1 text-xs text-neutral-500">適用範圍:{q.limits}</p>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Medications({ summary }: { summary: ClinicianSummary }) {
  return (
    <Section title="目前在服用的全部品項">
      {summary.medications.map((group) => (
        <div key={group.source} className="mb-3">
          <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            {SOURCE_LABELS[group.source] ?? group.source}
          </h3>
          <ul className="mt-1 space-y-0.5">
            {group.items.map((item, i) => (
              <li key={i} className="text-sm">
                {item.nameZh ?? item.inputText}
                {item.ingredients?.length ? (
                  <span className="text-neutral-500"> · {item.ingredients.join("、")}</span>
                ) : null}
                {!item.identified && <span className="text-neutral-500"> · 未能辨識</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}

function Unidentified({ summary }: { summary: ClinicianSummary }) {
  if (summary.unidentified.length === 0) return null;
  return (
    <Section title="無法辨識的品項(本次核對未涵蓋)">
      <ul className="space-y-0.5 text-sm">
        {summary.unidentified.map((u, i) => (
          <li key={i}>
            「{u.inputText}」— {u.reason}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Change({ summary }: { summary: ClinicianSummary }) {
  const change = summary.changeSinceLastVisit;
  if (!change) {
    return (
      <Section title="與上次的差異">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          這是第一次紀錄,沒有可比較的對象。
        </p>
      </Section>
    );
  }
  return (
    <Section title={`與上次的差異(${change.since.slice(0, 10)} → ${change.until.slice(0, 10)})`}>
      <ul className="space-y-0.5 text-sm">
        {change.added.map((i, k) => (
          <li key={`a${k}`}>＋ 新增 {i.nameZh ?? i.inputText}</li>
        ))}
        {change.removed.map((i, k) => (
          <li key={`r${k}`}>－ 不再出現 {i.nameZh ?? i.inputText}</li>
        ))}
        <li className="text-neutral-500">其餘 {change.unchanged} 項未變動</li>
      </ul>
    </Section>
  );
}

function Observations({ summary }: { summary: ClinicianSummary }) {
  if (summary.observations.length === 0) return null;
  return (
    <Section title="家屬觀察到的事">
      <ObservationTable observations={summary.observations} />
    </Section>
  );
}

/**
 * Ordered by what a prescriber acts on, not by when it was typed.
 *
 * A three-minute appointment is scanned, not read. Chronological order buries
 * 「自己拿櫃子裡的止痛藥吃」 between two unremarkable notes, and that line is
 * the one that changes a dose. Within a group the order is chronological,
 * because a pattern over three weeks is itself information.
 */
const KIND_ORDER: ObservationKind[] = [
  "self_medication",
  "missed_dose",
  "alcohol",
  "symptom",
  "other",
];

function ObservationTable({
  observations,
}: {
  observations: ClinicianSummary["observations"];
}) {
  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    rows: observations
      .filter((o) => o.kind === kind)
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt)),
  })).filter((g) => g.rows.length > 0);

  if (grouped.length === 0) {
    return <p className="text-sm text-neutral-500">這段期間家屬沒有記錄。</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-400 text-left">
            <th className="py-1 pr-3 font-medium whitespace-nowrap">類別</th>
            <th className="py-1 pr-3 font-medium whitespace-nowrap">日期</th>
            <th className="py-1 font-medium">家屬原話</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((group) =>
            group.rows.map((o, i) => (
              <tr
                key={`${group.kind}-${i}`}
                className="border-b border-neutral-200 align-top dark:border-neutral-800"
              >
                {/* The label spans its group so the eye lands on the category
                    once rather than reading it down the page. */}
                {i === 0 ? (
                  <td
                    rowSpan={group.rows.length}
                    className="py-1 pr-3 font-medium whitespace-nowrap"
                  >
                    {KIND_LABELS[group.kind] ?? group.kind}
                  </td>
                ) : null}
                <td className="py-1 pr-3 whitespace-nowrap text-neutral-500">
                  {o.observedAt.slice(5, 10)}
                </td>
                {/* Verbatim. The specificity is the value: 「大概三四次」 is
                    what the family said, and a tidier 「約每週三次」 would be
                    the product's words on a sheet a prescriber acts from. */}
                <td className="py-1">{o.note}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function Footer({ summary }: { summary: ClinicianSummary }) {
  return (
    <footer className="mt-8 border-t border-neutral-300 pt-3 text-xs leading-relaxed text-neutral-500 dark:border-neutral-700">
      <p>
        本單由家屬提供,內容為家屬回報與登記資料原文,
        <strong>不含任何用藥建議</strong>,亦非診斷。用藥決定由醫師判斷。
      </p>
      <p className="mt-1">
        藥品登記擷取於 {summary.provenance.registers.drugs} · 健康食品登記擷取於{" "}
        {summary.provenance.registers.healthFoods} ·{" "}
        {summary.provenance.ruleSets.map((r) => `${r.id} ${r.version}`).join(" · ")}
      </p>
    </footer>
  );
}
