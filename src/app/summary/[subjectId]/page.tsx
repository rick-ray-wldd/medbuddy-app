import { notFound } from "next/navigation";
import { getRegistry } from "@/lib/registry";
import { findSubject, CONDITION_LABELS } from "@/lib/subjects";
import { buildClinicianSummary } from "@/lib/summary/clinician";
import type { ClinicianSummary } from "@/lib/summary/clinician";

export const dynamic = "force-dynamic";

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

/**
 * The sheet a family hands over.
 *
 * Designed for a doctor with three minutes: scannable, one page, no
 * recommendations. Everything on it is either what the family reported or text
 * quoted from a source, and nothing on it tells anyone what to prescribe.
 */
export default async function SummaryPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  const subject = findSubject(subjectId);
  if (!subject) notFound();

  const { logStore } = getRegistry();
  const log = await logStore.read(subjectId);
  const latest = log.snapshots.at(-1);

  if (!latest) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">{subject.displayName}的用藥摘要</h1>
        <p className="mt-4 text-neutral-600">
          尚未有任何核對紀錄。請先在首頁完成一次核對,這張單子才有內容。
        </p>
        <a className="mt-6 inline-block underline" href="/">
          回到首頁
        </a>
      </main>
    );
  }

  const summary = buildClinicianSummary(latest.verdict, log, new Date().toISOString());

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 print:py-0">
      <Header subject={subject} summary={summary} />
      <Questions summary={summary} />
      <Medications summary={summary} />
      <Unidentified summary={summary} />
      <Change summary={summary} />
      <Observations summary={summary} />
      <Footer summary={summary} />
      <div className="mt-8 print:hidden">
        <a className="underline" href="/">
          ← 回到核對
        </a>
      </div>
    </main>
  );
}

function Header({
  subject,
  summary,
}: {
  subject: ReturnType<typeof findSubject> & object;
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
      <ul className="space-y-1 text-sm">
        {summary.observations.map((o, i) => (
          <li key={i}>
            <span className="text-neutral-500">
              {o.observedAt.slice(0, 10)} · {KIND_LABELS[o.kind] ?? o.kind}
            </span>
            <br />
            {o.note}
          </li>
        ))}
      </ul>
    </Section>
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
