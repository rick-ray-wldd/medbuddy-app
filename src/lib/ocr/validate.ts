/**
 * Check what the model returned, rather than believing it.
 *
 * The extraction prompt asks for verbatim transcription and nothing else. A
 * prompt is a request; this file is the guarantee — the same discipline as
 * `observations/parse.ts`, where every note must appear in the caregiver's own
 * words, and `narration/validate.ts`, where every claim must be in the verdict.
 *
 * ## The check that matters most
 *
 * A field claiming `status: "observed"` must carry `evidence`, and its `value`
 * must appear inside that evidence. That is what stops the failure this whole
 * module is built around: the model reading 「降血壓」 on the bag and returning
 * a drug name it inferred from the indication. An inferred name has no quote
 * containing it, so it does not survive.
 *
 * It cannot catch a model that fabricates the quote too. Nothing at this layer
 * can. What it does catch is every ordinary drift — helpfully filling a blank,
 * normalising 「５００毫克」 to `500mg`, carrying a value down from the row
 * above — which is what actually happens.
 */

import type {
  ExtractedField,
  ExtractedMedicationRow,
  MedicationBagExtraction,
} from "./types";
import { CRITICAL_FIELDS } from "./types";

export type FieldRejection = {
  rowIndex: number;
  field: string;
  reason:
    | "observed_without_evidence"
    | "value_not_in_evidence"
    | "value_without_status"
    | "absent_status_with_value";
};

/**
 * Whitespace and full/half-width digits differ between what is printed and
 * what a model echoes. Rejecting over that would push good rows into review
 * for nothing, so both sides are folded before comparison — and folding never
 * changes what is *stored*, only what is compared.
 */
function fold(text: string): string {
  return text
    .replace(/[\s　]+/g, "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

function checkField(
  rowIndex: number,
  name: string,
  field: ExtractedField,
): FieldRejection | null {
  const hasValue = field.value !== null && field.value.trim() !== "";

  // A field that says it saw something must say where.
  if (field.status === "observed" || field.status === "partially_legible") {
    if (!hasValue) return null; // nothing claimed, nothing to check
    if (!field.evidence || !field.evidence.trim()) {
      return { rowIndex, field: name, reason: "observed_without_evidence" };
    }
    if (!fold(field.evidence).includes(fold(field.value!))) {
      // The value is not in the quote it claims to come from. This is the
      // inference case: a name derived from an indication, a dose carried
      // over from a neighbouring row.
      return { rowIndex, field: name, reason: "value_not_in_evidence" };
    }
    return null;
  }

  // not_visible / conflicting must not smuggle a value through.
  if (hasValue) {
    return { rowIndex, field: name, reason: "absent_status_with_value" };
  }
  return null;
}

export type ValidationOutcome = {
  rows: ExtractedMedicationRow[];
  rejections: FieldRejection[];
  reviewReasons: string[];
};

/**
 * Rejected fields are blanked to `not_visible`, not dropped.
 *
 * Dropping the row would throw away the fields that were fine; keeping the bad
 * value would be the thing this file exists to prevent. Blanking says "the bag
 * may well have this, we do not have it" — which is true, and is what a
 * caregiver needs to see in order to type it in.
 */
export function validateExtraction(
  extraction: MedicationBagExtraction,
): ValidationOutcome {
  const rejections: FieldRejection[] = [];
  const reviewReasons: string[] = [];

  const rows = extraction.rows.map((row) => {
    const cleaned = { ...row };

    for (const [name, field] of Object.entries(row)) {
      if (name === "rowIndex") continue;
      const rejection = checkField(row.rowIndex, name, field as ExtractedField);
      if (!rejection) continue;

      rejections.push(rejection);
      (cleaned as unknown as Record<string, ExtractedField>)[name] = {
        value: null,
        status: "not_visible",
        evidence: null,
        locationHint: (field as ExtractedField).locationHint,
      };
    }

    // A critical field that is missing or contested is stated as a reason, so
    // the caregiver is told which row to look at rather than being handed a
    // wall of text and a shrug.
    for (const critical of CRITICAL_FIELDS) {
      const field = (cleaned as unknown as Record<string, ExtractedField>)[critical];
      if (!field) continue;
      if (field.status === "observed") continue;
      reviewReasons.push(`第 ${row.rowIndex + 1} 列的「${critical}」${
        field.status === "conflicting" ? "有兩個不一致的寫法" : "看不清楚或沒有印出來"
      }`);
    }

    return cleaned;
  });

  return { rows, rejections, reviewReasons };
}
