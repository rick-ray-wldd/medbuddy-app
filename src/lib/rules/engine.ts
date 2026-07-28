/**
 * Deterministic evaluation of a person's medications against versioned rule
 * sets.
 *
 * Pure functions. No I/O, no model calls, no clock, no randomness — the same
 * inputs give the same findings, which is what lets the whole clinical layer
 * be tested by assertion rather than by review.
 *
 * The engine knows nothing about medicine. It matches ingredient tokens and
 * condition codes according to shapes declared in config/rules/*.json. To add a
 * criterion you add JSON; to change how criteria are *expressed* you change
 * this file.
 */

import type {
  ConditionCode,
  DrugClasses,
  EvaluationItem,
  EvaluationSubject,
  Finding,
  Predicate,
  Rule,
  RuleSet,
} from "./types";

export type EvaluationInput = {
  subject: EvaluationSubject;
  items: EvaluationItem[];
};

export type Evaluation = {
  subjectId: string;
  findings: Finding[];
  /** Which rule sets ran, at which version. A past check must be reproducible. */
  ruleSetVersions: { id: string; version: string; retrievedAt: string }[];
  /** Rule sets skipped because the person is below their age scope. */
  skippedRuleSets: { id: string; reason: string }[];
};

/**
 * Does this item contain an ingredient in this class?
 *
 * Substring rather than equality: the register records salts and forms —
 * DICLOFENAC SODIUM, IBUPROFEN LYSINE — and a criterion about diclofenac means
 * all of them. The bias is deliberate and stated in drug-classes.json: a false
 * positive costs a question, a false negative costs a missed harm.
 */
function itemInClass(item: EvaluationItem, tokens: string[]): boolean {
  return item.ingredients.some((ingredient) =>
    tokens.some((token) => ingredient.includes(token)),
  );
}

function classTokens(classes: DrugClasses, names: string[]): string[] {
  return names.flatMap((n) => classes.classes[n]?.tokens ?? []);
}

type Match = { items: EvaluationItem[]; conditions: ConditionCode[] } | null;

/**
 * Evaluate one predicate, returning what satisfied it rather than a boolean.
 *
 * A finding has to name the medicines it is about — a carer may hold twelve
 * residents, and "there is an interaction" without saying between what is not
 * usable. Carrying the matched items out of the predicate is what makes that
 * possible.
 */
function evaluate(
  predicate: Predicate,
  input: EvaluationInput,
  classes: DrugClasses,
): Match {
  if ("classAnyOf" in predicate) {
    const tokens = classTokens(classes, predicate.classAnyOf);
    const items = input.items.filter((i) => itemInClass(i, tokens));
    return items.length > 0 ? { items, conditions: [] } : null;
  }

  if ("conditionAnyOf" in predicate) {
    const conditions = predicate.conditionAnyOf.filter((c) =>
      input.subject.conditions.includes(c),
    );
    return conditions.length > 0 ? { items: [], conditions } : null;
  }

  if ("allOf" in predicate) {
    const parts: Match[] = predicate.allOf.map((p) => evaluate(p, input, classes));
    if (parts.some((p) => p === null)) return null;
    return {
      items: dedupeItems(parts.flatMap((p) => p!.items)),
      conditions: [...new Set(parts.flatMap((p) => p!.conditions))],
    };
  }

  if ("officialWarningMentionsAnyOf" in predicate) {
    // The evidence is the product's own approved warning, so the match is made
    // against that text and the text itself is carried onto the finding.
    const items = input.items.filter((i) =>
      predicate.officialWarningMentionsAnyOf.some((term) =>
        (i.officialWarning ?? "").includes(term),
      ),
    );
    return items.length > 0 ? { items, conditions: [] } : null;
  }

  if ("duplicateClassAmong" in predicate) {
    for (const className of predicate.duplicateClassAmong) {
      const tokens = classTokens(classes, [className]);
      const hits = input.items.filter((i) => itemInClass(i, tokens));
      // Two distinct entries in one class. Two bags of the same medicine are
      // the case this is for, and it is common when leftovers are kept.
      if (hits.length > 1) return { items: hits, conditions: [] };
    }
    return null;
  }

  // A predicate shape the engine does not know must not silently pass.
  throw new Error(`Unknown predicate shape: ${JSON.stringify(predicate)}`);
}

function dedupeItems(items: EvaluationItem[]): EvaluationItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.ref) ? false : (seen.add(i.ref), true)));
}

function toFinding(
  rule: Rule,
  ruleSet: RuleSet,
  match: NonNullable<Match>,
  subjectId: string,
): Finding {
  return {
    id: `${ruleSet.id}:${rule.id}:${subjectId}`,
    subjectId,
    ruleId: rule.id,
    ruleSetId: ruleSet.id,
    severity: rule.severity,
    category: rule.category,
    verbatim: rule.verbatim,
    limits: rule.limits,
    limitsZh: rule.limitsZh,
    citation: ruleSet.citation,
    involves: match.items.map((i) => ({
      ref: i.ref,
      inputText: i.inputText,
      nameZh: i.nameZh,
    })),
    conditions: match.conditions,
    officialText: quotedWarnings(match.items),
  };
}

/**
 * Approved warning text from the matched products, quoted whole.
 *
 * A regulator's warning is evidence, and evidence is quoted rather than
 * summarised — the pharmacist reading this finding should see the wording the
 * regulator approved, not our rendering of it.
 */
function quotedWarnings(items: EvaluationItem[]) {
  const quoted = items
    .filter((i) => i.officialWarning)
    .map((i) => ({
      productName: i.nameZh ?? i.inputText,
      permit: i.permit ?? i.ref,
      text: i.officialWarning!,
    }));
  return quoted.length > 0 ? quoted : undefined;
}

export function evaluateRules(
  input: EvaluationInput,
  ruleSets: RuleSet[],
  classes: DrugClasses,
): Evaluation {
  const findings: Finding[] = [];
  const ruleSetVersions: Evaluation["ruleSetVersions"] = [];
  const skippedRuleSets: Evaluation["skippedRuleSets"] = [];

  for (const ruleSet of ruleSets) {
    // Criteria written for people aged 65 and over say nothing about anyone
    // younger. Applying them anyway would produce findings the source does not
    // support, so the set is skipped and the skip is reported.
    const age = input.subject.ageYears;
    if (age !== undefined && age < ruleSet.appliesFromAge) {
      skippedRuleSets.push({
        id: ruleSet.id,
        reason: `applies from age ${ruleSet.appliesFromAge}; subject is ${age}`,
      });
      continue;
    }

    ruleSetVersions.push({
      id: ruleSet.id,
      version: ruleSet.version,
      retrievedAt: ruleSet.citation.retrievedAt,
    });

    for (const rule of ruleSet.rules) {
      const match = evaluate(rule.when, input, classes);
      if (match) findings.push(toFinding(rule, ruleSet, match, input.subject.id));
    }
  }

  return {
    subjectId: input.subject.id,
    findings: sortBySeverity(findings),
    ruleSetVersions,
    skippedRuleSets,
  };
}

/** Physician before pharmacist, then stable by rule id so output is reproducible. */
function sortBySeverity(findings: Finding[]): Finding[] {
  const rank = { consult_physician: 0, consult_pharmacist: 1 };
  return [...findings].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.ruleId.localeCompare(b.ruleId),
  );
}
