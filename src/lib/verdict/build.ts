/**
 * Join grounding and rule evaluation into one verdict.
 *
 * Deliberately thin. The interesting decisions already happened: what could be
 * identified (grounding) and what the criteria say about it (rules). This file
 * only makes sure nothing is lost between them, and that coverage travels
 * with the findings.
 */

import { evaluateRules } from "../rules/engine";
import type { DrugClasses, EvaluationItem, RuleSet } from "../rules/types";
import type { GroundedItem, GroundingResult } from "../grounding/types";
import type { Verdict, VerdictSubject } from "./types";

/**
 * Only resolved items reach the rule engine — an item whose composition is
 * unknown cannot be evaluated against a criterion about ingredients. It stays
 * in the verdict and is counted as uncovered, which is the honest report.
 */
function toEvaluationItems(items: GroundedItem[]): EvaluationItem[] {
  return items.flatMap((item, index) =>
    item.resolved && item.ingredients.length > 0
      ? [
          {
            ref: `item-${index}`,
            inputText: item.inputText,
            nameZh: item.nameZh,
            ingredients: item.ingredients,
            // Carried so a rule drawing on regulator text can quote the exact
            // warning approved for this product, attributed to its licence.
            officialWarning: item.officialWarning,
            register: item.register,
            permit: item.permit,
          },
        ]
      : [],
  );
}

export function buildVerdict(
  subject: VerdictSubject,
  grounding: GroundingResult,
  ruleSets: RuleSet[],
  classes: DrugClasses,
): Verdict {
  const evaluationItems = toEvaluationItems(grounding.items);

  const evaluation = evaluateRules(
    {
      subject: {
        id: subject.id,
        displayName: subject.displayName,
        ageYears: subject.ageYears,
        conditions: subject.conditions,
      },
      items: evaluationItems,
    },
    ruleSets,
    classes,
  );

  const itemsSubmitted = grounding.items.length;
  const itemsResolved = evaluationItems.length;

  return {
    subject,
    items: grounding.items,
    findings: evaluation.findings,
    coverage: {
      itemsSubmitted,
      itemsResolved,
      itemsUnresolved: itemsSubmitted - itemsResolved,
      // Nothing was checkable: either nothing was submitted, or none of what
      // was submitted could be identified well enough to evaluate. Either way
      // the absence of findings means nothing, and a surface must say so.
      nothingChecked: itemsResolved === 0,
    },
    provenance: {
      registers: grounding.registryVersions,
      ruleSets: evaluation.ruleSetVersions,
      skippedRuleSets: evaluation.skippedRuleSets,
    },
  };
}
