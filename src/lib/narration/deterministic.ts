/**
 * Narration without a model.
 *
 * Two jobs. It is the fallback when the language model is unavailable or
 * produces something that fails validation, and it is the reference the model
 * is measured against — the same verdict must survive both routes.
 *
 * Templates only. Every sentence is assembled from verdict fields, so this
 * narrator cannot say anything the verdict does not contain.
 */

import type { Verdict } from "../verdict/types";
import { outcomeOf } from "../verdict/types";
import type { Narration, NarrationAudience, Narrator, Segment } from "./types";

/** Medicine names are marked so the validator can check what was named. */
function mark(name: string): string {
  return `【${name}】`;
}

export class DeterministicNarrator implements Narrator {
  readonly name = "deterministic" as const;

  async narrate(verdict: Verdict, audience: NarrationAudience): Promise<Narration> {
    return {
      subjectId: verdict.subject.id,
      subjectName: verdict.subject.displayName,
      producedBy: this.name,
      segments:
        audience === "elder" ? elderSegments(verdict) : caregiverSegments(verdict),
    };
  }
}

function caregiverSegments(verdict: Verdict): Segment[] {
  const name = verdict.subject.displayName;
  const segments: Segment[] = [];

  const outcome = outcomeOf(verdict);
  if (outcome === "nothing_checkable") {
    segments.push({
      kind: "coverage",
      text: `${name}的清單裡有 ${verdict.coverage.itemsSubmitted} 項,目前一項都無法辨識,所以這次沒有做任何核對。`,
    });
    return segments;
  }

  if (outcome === "checked_no_findings") {
    segments.push({
      kind: "explained",
      text: `${name}的 ${verdict.coverage.itemsResolved} 項已完成核對,依目前收錄的準則沒有發現需要提出的問題。`,
    });
  }

  for (const finding of verdict.findings) {
    const involved = finding.involves.map((i) => mark(i.nameZh ?? i.inputText)).join("、");

    segments.push({
      kind: "explained",
      text: `${name}的 ${involved} 需要跟專業人員確認一下。`,
      findingId: finding.id,
    });

    // The source, word for word. Not our rendering of it.
    for (const quoted of finding.officialText ?? []) {
      segments.push({
        kind: "verified",
        text: quoted.text,
        attribution: `${quoted.productName} 核可警語(${quoted.permit})`,
        findingId: finding.id,
      });
    }
    if (!finding.officialText?.length) {
      segments.push({
        kind: "verified",
        text: finding.verbatim,
        attribution: `${finding.ruleId} · ${finding.citation.reference}`,
        findingId: finding.id,
      });
    }

    if (finding.limits) {
      segments.push({
        kind: "coverage",
        text: finding.limits,
        attribution: `${finding.ruleId} 的適用範圍`,
        findingId: finding.id,
      });
    }

    segments.push({
      kind: "action",
      text:
        finding.severity === "consult_physician"
          ? `把這張單子帶去給醫師看,請醫師確認。`
          : `把這張單子帶去問藥師。`,
      findingId: finding.id,
    });
  }

  if (verdict.coverage.itemsUnresolved > 0) {
    segments.push({
      kind: "coverage",
      text: `另外有 ${verdict.coverage.itemsUnresolved} 項無法辨識,這次的核對沒有涵蓋到它們。可以把包裝帶去一起問。`,
    });
  }

  return segments;
}

/**
 * The elder's version says less, and never mentions a shortfall.
 *
 * He speaks to ask, never to answer: when a gap is raised with him he goes
 * quiet and looks embarrassed, so nothing here asks him to confirm or deny
 * anything, and nothing reports him to himself. What he gets is what a
 * medicine is for.
 */
function elderSegments(verdict: Verdict): Segment[] {
  const segments: Segment[] = [];
  const name = verdict.subject.displayName;

  const explained = verdict.items.filter((i) => i.resolved && i.indications);
  if (explained.length === 0) {
    segments.push({
      kind: "explained",
      text: `${name}好,目前還沒有可以說明的藥品資料。`,
    });
    return segments;
  }

  segments.push({ kind: "explained", text: `${name}好,這是您現在在吃的藥。` });

  for (const item of explained) {
    if (!item.resolved) continue;
    segments.push({
      kind: "explained",
      text: `${mark(item.nameZh)}:`,
      findingId: undefined,
    });
    segments.push({
      kind: "verified",
      text: item.indications!,
      attribution: `衛福部食品藥物管理署許可證 ${item.permit}`,
    });
  }

  // Coverage is disclosed to him too. Saying "there is one I could not
  // identify" is the system admitting its own limit, not asking him to admit
  // anything, so it costs him nothing and keeps the two views honest with
  // each other.
  if (verdict.coverage.itemsUnresolved > 0) {
    segments.push({
      kind: "coverage",
      text: `另外有 ${verdict.coverage.itemsUnresolved} 項我認不出來,家人會幫忙看。`,
    });
  }

  if (verdict.findings.length > 0) {
    segments.push({
      kind: "action",
      text: `有幾項想請藥師幫忙看一下,家人會陪您一起問。`,
    });
  }

  return segments;
}
