/**
 * The rule engine interprets shape; it holds no medication knowledge of its
 * own. Everything clinical lives in config/rules/*.json, in version control,
 * so a change to what the product considers risky arrives as a reviewable diff
 * rather than as a deploy.
 */

/** Codes the care team can record about a person. Fixed vocabulary, not prose. */
export type ConditionCode =
  | "chronic_liver_disease"
  | "low_bmi"
  | "recurrent_falls"
  | "peptic_ulcer_or_gi_bleed"
  | "heart_failure"
  | "severe_hypertension"
  | "ckd_egfr_under_50";

/**
 * What the product is allowed to tell someone to do. An enumeration, not free
 * text, because this is the boundary the product must not cross: it raises
 * questions for a clinician or pharmacist and never decides.
 */
export type Severity = "consult_pharmacist" | "consult_physician";

export type DrugClass = {
  label: string;
  labelEn: string;
  tokens: string[];
};

export type DrugClasses = {
  classes: Record<string, DrugClass>;
};

export type Predicate =
  | { classAnyOf: string[] }
  | { conditionAnyOf: ConditionCode[] }
  | { allOf: Predicate[] }
  | { duplicateClassAmong: string[] };

export type Rule = {
  id: string;
  section: string;
  sectionTitle: string;
  number: number;
  /** The source criterion, word for word. Never paraphrased, never generated. */
  verbatim: string;
  when: Predicate;
  severity: Severity;
  category: string;
  /**
   * What this encoding cannot know. The brief asks for grounded reference data
   * *and clear limits*; this field is where the limit is stated, and it travels
   * with every finding the rule produces.
   */
  limits: string | null;
};

export type Citation = {
  reference: string;
  doi: string;
  correctionDoi?: string;
  licence: string;
  licenceUrl: string;
  criteriaSource: string;
  retrievedAt: string;
};

export type RuleSet = {
  id: string;
  version: string;
  title: string;
  appliesFromAge: number;
  citation: Citation;
  coverage: { criteriaInSource: number; criteriaEncodedHere: number; note: string };
  rules: Rule[];
  notEncoded?: Record<string, string>;
};

/** What the engine is asked about. */
export type EvaluationSubject = {
  id: string;
  displayName: string;
  ageYears?: number;
  conditions: ConditionCode[];
};

/** One line of what the person takes, as produced by grounding. */
export type EvaluationItem = {
  /** Stable handle so a finding can point back at what triggered it. */
  ref: string;
  inputText: string;
  nameZh?: string;
  /** Uppercased ingredient strings from the register. Empty means unresolved. */
  ingredients: string[];
};

export type Finding = {
  id: string;
  subjectId: string;
  ruleId: string;
  ruleSetId: string;
  severity: Severity;
  category: string;
  /** Source wording, carried through untouched. */
  verbatim: string;
  /** Stated on every finding, never only in documentation. */
  limits: string | null;
  citation: Citation;
  /** Which items triggered it, so the person can see what this is about. */
  involves: { ref: string; inputText: string; nameZh?: string }[];
  /** Which recorded conditions took part, if any. */
  conditions: ConditionCode[];
};
