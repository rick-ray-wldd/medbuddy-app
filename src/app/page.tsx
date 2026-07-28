import { SUBJECTS } from "@/lib/subjects";
import { getRegistry } from "@/lib/registry";
import CheckClient from "./check-client";

/**
 * The whole product on one page: whose medicines these are, what is actually
 * in the cupboard, and what the registers and the criteria make of it.
 */
export default function Home() {
  const { registers, ruleSets } = getRegistry();

  const stats = {
    drugs: registers.drugs.drugs.length,
    healthFoods: registers.healthFoods.healthFoods.length,
    registerDate: registers.drugs.retrievedAt,
    ruleSets: ruleSets.map((r) => ({
      title: r.title,
      encoded: r.coverage.criteriaEncodedHere,
      inSource: r.coverage.criteriaInSource,
      licence: r.citation.licence,
    })),
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <header className="mb-9">
        <h1 className="text-3xl font-semibold tracking-tight">MedBuddy</h1>
        <p className="mt-3 text-lg leading-relaxed text-neutral-600 dark:text-neutral-300">
          帶長輩看診的那一次,和他自己去的那一次,拿到的醫療是不一樣的。
          差別不在醫術,在診間裡的資訊。
        </p>
      </header>

      <CheckClient subjects={SUBJECTS} />

      <section className="mt-14 border-t border-neutral-200 pt-6 text-sm leading-relaxed text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        <h2 className="mb-3 font-medium text-neutral-900 dark:text-neutral-100">
          這些判斷從哪裡來
        </h2>
        <ul className="space-y-1.5">
          <li>
            衛福部食藥署藥品許可證 <strong>{stats.drugs.toLocaleString()}</strong> 筆 ·
            健康食品 <strong>{stats.healthFoods}</strong> 筆 · 擷取於 {stats.registerDate}
          </li>
          {stats.ruleSets.map((r) => (
            <li key={r.title}>
              {r.title} — 收錄 <strong>{r.encoded}</strong> / {r.inSource} 條 · {r.licence}
            </li>
          ))}
        </ul>
        <p className="mt-4">
          規則以 JSON 存在版本控制中,任何一條用藥安全規則的變動都是一個可 review 的 diff。
          本系統不做醫療決定,只提出應該由藥師或醫師回答的問題。
        </p>
      </section>
    </main>
  );
}
