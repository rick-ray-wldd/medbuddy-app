/**
 * Medication-bag extraction — the seam.
 *
 * Implements the contract in `docs/MEDICATION-BAG-OCR-MIGRATION.md`. The one
 * sentence everything below serves:
 *
 * > The vision model transcribes visible evidence. It never identifies a drug
 * > from appearance, supplies missing instructions, interprets a prescription,
 * > or makes a clinical decision.
 *
 * ## Why a field is not a string
 *
 * A plain `printedName: string` cannot distinguish "the bag says 普拿疼" from
 * "the bag is creased there and I am guessing". Those must not look alike to
 * anything downstream, so every field carries its own state and the quote it
 * came from. `null` with a status is an answer; a filled-in guess is not.
 *
 * ## Why there is no confidence number
 *
 * `confidence: 0.93` from a language model is not calibrated, and its only
 * real use is inviting a threshold — `> 0.9 ? accept : review` — which is a
 * clinical decision made by a number nobody validated. Status is a small set
 * of things a person can reason about instead.
 */

export type FieldStatus =
  | "observed"
  | "partially_legible"
  | "not_visible"
  | "conflicting";

export type ExtractedField = {
  /** Exact visible transcription, or null. Never normalised, never inferred. */
  value: string | null;
  status: FieldStatus;
  /** The smallest exact quote from the bag supporting `value`. */
  evidence: string | null;
  /** Coarse and truthful — "medication table, row 2" — never a fabricated box. */
  locationHint: string | null;
};

export type ExtractedMedicationRow = {
  /** Row order as printed. Used to talk about a row, never as an identifier. */
  rowIndex: number;
  /** The name cell, copied whole — including 「(自費)」 and any English. */
  printedName: ExtractedField;
  /**
   * The Chinese product name alone, with its strength, taken from inside
   * `printedName`.
   *
   * Not a rewrite: a Taiwanese medication bag prints the English trade name,
   * the Chinese name and the strength in one cell, and the TFDA register lists
   * the Chinese name. 「TAMIFLU 75MG 克流感膠囊75MG」 resolves to nothing;
   * 「克流感膠囊75MG」 resolves exactly. Both strings are on the bag — this
   * field is which part of the cell to hand the resolver.
   *
   * The strength stays attached on purpose. 「克流感膠囊」 alone comes back
   * ambiguous across several permits, and picking one would be the guess this
   * whole module refuses to make.
   */
  printedNameZh: ExtractedField;
  strength: ExtractedField;
  dosePerAdministration: ExtractedField;
  frequency: ExtractedField;
  route: ExtractedField;
  timing: ExtractedField;
  durationDays: ExtractedField;
  quantity: ExtractedField;
};

/** Provenance that helps a handoff. Never patient-identifying. */
export type BagProvenance = {
  institution: ExtractedField;
  department: ExtractedField;
  dispensedOn: ExtractedField;
};

export type ExtractionFailure =
  | "image_too_small"
  | "image_unreadable"
  | "not_a_medication_bag"
  | "no_rows_found"
  | "model_unavailable"
  | "model_returned_unusable_output";

export type MedicationBagExtraction = {
  requestId: string;
  rows: ExtractedMedicationRow[];
  provenance: BagProvenance;
  /**
   * Reported as a boolean and never returned as text. The product has no use
   * for a patient's name and every reason not to hold one.
   */
  patientIdentifyingTextDetected: boolean;
  /**
   * Always true in v1 — see the contract. Not a threshold that can be crossed:
   * a caregiver confirms every row before it becomes a record, including the
   * ones where every field was crisp.
   */
  needsHumanReview: true;
  /** Why review is needed beyond the standing v1 rule. */
  reviewReasons: string[];
};

export type ExtractionResult =
  | { ok: true; extraction: MedicationBagExtraction }
  | { ok: false; failure: ExtractionFailure; detail?: string };

export type MedicationBagImage = {
  imageId: string;
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

export type ExtractionRequest = {
  requestId: string;
  /** Resolved by the caller from the role binding. OCR never chooses a subject. */
  subjectId: string;
  submittedByCarerId: string;
  images: MedicationBagImage[];
};

export interface MedicationBagExtractor {
  extract(request: ExtractionRequest): Promise<ExtractionResult>;
}

/** The six fields whose absence or conflict forces a stated review reason. */
export const CRITICAL_FIELDS = [
  "printedName",
  "strength",
  "dosePerAdministration",
  "frequency",
  "route",
  "timing",
] as const;

export type CriticalField = (typeof CRITICAL_FIELDS)[number];
