/**
 * The page a family hands to a clinician.
 *
 * Written for a three-minute appointment, which is the constraint that decides
 * everything about it. A hospital outpatient doctor in Taiwan sees forty to
 * sixty patients in a session; anything that needs reading rather than scanning
 * will not be read.
 *
 * It carries **information, never a recommendation**. The product does not tell
 * a physician what to prescribe, for the same reason it does not tell a family
 * to stop a medicine. What it does is put in one place the things the record
 * cannot show: what was bought over the counter, what came back out of the
 * cupboard, what the family noticed, and what changed since last time.
 *
 * There is a second reason it is a sheet rather than a conversation. When the
 * son says out loud, in front of his father, that doses get missed and the
 * drinking has increased, the father goes quiet and looks embarrassed. Handing
 * over a page delivers the same information without staging that moment.
 */

import type { GroundedItem } from "../grounding/types";
import type { Finding } from "../rules/types";
import type { RegimenChange } from "../log/types";
import { changeSinceLast } from "../log/diff";
import type { SubjectLog } from "../log/types";
import type { Verdict } from "../verdict/types";

export type ClinicianSummary = {
  subject: { id: string; displayName: string; ageYears?: number };
  generatedAt: string;
  /** Everything the person takes, prescription or not, grouped by where it came from. */
  medications: {
    source: GroundedItem["source"];
    items: {
      inputText: string;
      nameZh?: string;
      ingredients?: string[];
      identified: boolean;
    }[];
  }[];
  /** What is not in the prescription record, called out because that is the point. */
  notInPrescriptionRecord: number;
  /** What the check could not identify. Stated, never omitted. */
  unidentified: { inputText: string; reason: string }[];
  /** Null when there is nothing to compare against — not an empty change. */
  changeSinceLastVisit: RegimenChange | null;
  /** What the family observed, in their words. */
  observations: { observedAt: string; kind: string; note: string }[];
  /** Questions to ask, derived from findings. Not answers. */
  questions: {
    ruleId: string;
    about: string[];
    quoted: string;
    attribution: string;
    limits: string | null;
    escalateTo: "pharmacist" | "physician";
  }[];
  provenance: Verdict["provenance"];
};

const SOURCE_ORDER: GroundedItem["source"][] = [
  "prescription",
  "otc",
  "leftover",
  "supplement",
  "unknown",
];

const UNRESOLVED_REASONS: Record<string, string> = {
  no_match: "任何登記都查不到",
  ambiguous: "名稱不夠明確,無法確定品項",
  matched_without_ingredients: "查得到品名,但登記未記載成分",
};

function questionFrom(finding: Finding): ClinicianSummary["questions"][number] {
  // A finding drawing on a product's approved warning quotes that warning; one
  // drawing on a published criterion quotes the criterion. Either way the
  // clinician reads the source, not our rendering of it.
  const official = finding.officialText?.[0];
  return {
    ruleId: finding.ruleId,
    about: finding.involves.map((i) => i.nameZh ?? i.inputText),
    quoted: official?.text ?? finding.verbatim,
    attribution: official
      ? `${official.productName} 核可警語(${official.permit})`
      : `${finding.ruleId} · ${finding.citation.reference}`,
    limits: finding.limitsZh ?? finding.limits,
    escalateTo: finding.severity === "consult_physician" ? "physician" : "pharmacist",
  };
}

export function buildClinicianSummary(
  verdict: Verdict,
  log: SubjectLog,
  generatedAt: string,
): ClinicianSummary {
  const bySource = SOURCE_ORDER.map((source) => ({
    source,
    items: verdict.items
      .filter((i) => i.source === source)
      .map((i) => ({
        inputText: i.inputText,
        nameZh: i.resolved ? i.nameZh : undefined,
        ingredients: i.resolved ? i.ingredients : undefined,
        identified: i.resolved,
      })),
  })).filter((group) => group.items.length > 0);

  return {
    subject: {
      id: verdict.subject.id,
      displayName: verdict.subject.displayName,
      ageYears: verdict.subject.ageYears,
    },
    generatedAt,
    medications: bySource,
    // The count that makes the case: everything here is invisible to the
    // prescription record, and it is why the sheet exists.
    notInPrescriptionRecord: verdict.items.filter((i) => i.source !== "prescription").length,
    unidentified: verdict.items
      .filter((i) => !i.resolved)
      .map((i) => ({
        inputText: i.inputText,
        reason: i.resolved ? "" : (UNRESOLVED_REASONS[i.reason] ?? i.reason),
      })),
    changeSinceLastVisit: changeSinceLast(log.snapshots),
    observations: log.observations.map((o) => ({
      observedAt: o.observedAt,
      kind: o.kind,
      note: o.note,
    })),
    questions: verdict.findings.map(questionFrom),
    provenance: verdict.provenance,
  };
}
