/**
 * The verdict is the single object that carries every clinical judgement.
 *
 * Everything upstream of it — resolving names, evaluating rules — decides what
 * is true. Everything downstream — narration, the caregiver screen, the sheet
 * handed to a clinician — only decides how it is said. The model that writes
 * plain language receives this object and nothing else, which is why its
 * output can be asserted against this object in tests.
 *
 * If a fact is not in here, it cannot appear on any surface. That is the point.
 */

import type { GroundedItem } from "../grounding/types";
import type { ConditionCode, Finding } from "../rules/types";

export type VerdictSubject = {
  id: string;
  displayName: string;
  ageYears?: number;
  conditions: ConditionCode[];
};

/**
 * Everything needed to reproduce this check later. Registers are refreshed and
 * rule sets are revised; a summary handed to a clinician last month has to be
 * explainable in terms of what the product knew at the time.
 */
export type VerdictProvenance = {
  registers: { drugs: string; healthFoods: string };
  ruleSets: { id: string; version: string; retrievedAt: string }[];
  skippedRuleSets: { id: string; reason: string }[];
};

/**
 * How much of what was submitted the check actually covered.
 *
 * Reported as part of the verdict rather than derived by each surface,
 * because coverage has to appear everywhere findings appear. A screen showing
 * two findings and not saying that three items were unidentifiable is telling
 * a comfortable lie.
 */
export type VerdictCoverage = {
  itemsSubmitted: number;
  itemsResolved: number;
  itemsUnresolved: number;
  /** True when nothing could be checked at all — a distinct state from "no findings". */
  nothingChecked: boolean;
};

export type Verdict = {
  subject: VerdictSubject;
  /** Every submitted line, resolved or not. Nothing is dropped. */
  items: GroundedItem[];
  findings: Finding[];
  coverage: VerdictCoverage;
  provenance: VerdictProvenance;
};

/**
 * "No findings" and "nothing could be checked" look identical on a screen that
 * only counts findings, and they mean opposite things. This distinguishes them
 * so a surface never renders reassurance it has not earned.
 */
export type VerdictOutcome =
  | "findings_present"
  | "checked_no_findings"
  | "nothing_checkable";

export function outcomeOf(verdict: Verdict): VerdictOutcome {
  if (verdict.findings.length > 0) return "findings_present";
  if (verdict.coverage.nothingChecked) return "nothing_checkable";
  return "checked_no_findings";
}
