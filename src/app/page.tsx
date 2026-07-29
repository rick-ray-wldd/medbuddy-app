import { CONDITION_LABELS, DEMO_SUBJECT } from "@/lib/subjects";
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
  const conditions = DEMO_SUBJECT.conditions.map((code) => CONDITION_LABELS[code]);

  return (
    <main className="medbuddy-shell">
      <header className="app-header">
        <div>
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">M</span>
            <div>
              <p className="brand-name">MedBuddy</p>
              <p className="brand-subtitle">照顧者用藥工作台</p>
            </div>
          </div>
          <p className="header-copy">
            把家中實際使用的藥品與照顧觀察，整理成長者看得懂、醫師用得上的資訊。
          </p>
        </div>
        <div className="demo-badge" aria-label="示範環境：單一長者模式">
          <span className="status-dot" aria-hidden="true" />
          DEMO · 單一長者模式
        </div>
      </header>

      <section className="patient-banner" aria-labelledby="patient-heading">
        <div className="patient-identity">
          <div className="patient-avatar" aria-hidden="true">父</div>
          <div>
            <p className="eyebrow">目前照護對象</p>
            <h1 id="patient-heading">{DEMO_SUBJECT.displayName}</h1>
            <div className="patient-meta">
              <span>{DEMO_SUBJECT.ageYears} 歲</span>
              {conditions.map((condition) => (
                <span key={condition}>{condition}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="pairing-panel" aria-label="LINE 雙手機示範配對">
          <p className="eyebrow">LINE 示範配對</p>
          <div className="phone-pair">
            <div className="phone-role">
              <span className="role-number" aria-hidden="true">1</span>
              <div>
                <strong>長者手機</strong>
                <span>選「我是長輩」後，自動綁定父親</span>
              </div>
            </div>
            <div className="phone-role">
              <span className="role-number" aria-hidden="true">2</span>
              <div>
                <strong>照顧者手機</strong>
                <span>選「我是照顧者」後，自動記錄照顧觀察</span>
              </div>
            </div>
          </div>
          <p className="pairing-note">本次 Demo 固定 1 位長者 + 1 位照顧者，不提供切換對象。</p>
        </div>
      </section>

      <CheckClient subject={DEMO_SUBJECT} />

      <details className="source-disclosure">
        <summary>資料來源與規則版本</summary>
        <div className="source-content">
          <p>
            衛福部食藥署藥品許可證 <strong>{stats.drugs.toLocaleString()}</strong> 筆、
            健康食品 <strong>{stats.healthFoods}</strong> 筆；資料擷取於 {stats.registerDate}。
          </p>
          <ul>
            {stats.ruleSets.map((rule) => (
              <li key={rule.title}>
                {rule.title}：本系統編碼 {rule.encoded} / 原始來源 {rule.inSource} 條（{rule.licence}）
              </li>
            ))}
          </ul>
          <p>
            規則以 JSON 版本控制；系統不做醫療決定，只整理證據、指出不確定處，並把問題交給藥師或醫師。
          </p>
        </div>
      </details>
    </main>
  );
}
