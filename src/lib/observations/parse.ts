/**
 * Turn what a caregiver says into structured observations, without changing
 * what they said.
 *
 * A caregiver arrives with one paragraph:
 *
 *   「他這兩週晚上腰痛睡不著,自己拿櫃子裡的止痛藥吃,大概三四次。
 *     最近也比較常喝酒。上禮拜有一天早上的血壓藥忘記吃。」
 *
 * That is four things a clinician would want separately, and asking a tired
 * person to file them into four form fields is how the detail gets lost —
 * "他最近比較不舒服" is what survives a form, and it is useless in a
 * three-minute consultation.
 *
 * ## The rule that makes this safe
 *
 * > The model may segment and classify. It may not write.
 *
 * Every note must appear **verbatim** in what the caregiver typed, and that is
 * checked rather than trusted: an observation whose text is not a substring of
 * the input is discarded. So the model cannot smooth, summarise, add a symptom
 * that was not mentioned, or turn 「比較常喝酒」 into a quantity.
 *
 * This is the same discipline as the narration validator, in the other
 * direction — there we check what the model wrote against a verdict, here we
 * check it against the person's own words.
 */

import type { ObservationKind } from "../log/types";

export type ParsedObservation = {
  kind: ObservationKind;
  /** A verbatim span of the caregiver's input. Never rewritten. */
  note: string;
};

export type ParseResult = {
  observations: ParsedObservation[];
  /** True when we fell back to keeping the whole paragraph as one note. */
  usedFallback: boolean;
  /** Spans the model returned that were not in the input, and were dropped. */
  rejected: { kind: string; note: string; reason: "not_verbatim" | "unknown_kind" }[];
};

const KINDS: ObservationKind[] = [
  "symptom",
  "self_medication",
  "alcohol",
  "missed_dose",
  "other",
];

/**
 * The model boundary.
 *
 * Injectable so the tests run offline with no key, and so the only thing that
 * has to be trusted about the model is a shape this file then re-checks.
 */
export interface ObservationExtractor {
  extract(text: string): Promise<{ kind: string; note: string }[]>;
}

/**
 * Whitespace differs between what someone types and what a model echoes, and
 * a note rejected over a space would push us to the fallback for no reason.
 */
function normalise(text: string): string {
  return text.replace(/[\s　]+/g, "");
}

function wholeThing(text: string): ParsedObservation[] {
  return [{ kind: "other", note: text.trim() }];
}

export async function parseObservations(
  text: string,
  extractor: ObservationExtractor | null,
): Promise<ParseResult> {
  const input = text.trim();
  if (!input) return { observations: [], usedFallback: false, rejected: [] };

  if (!extractor) {
    // No model configured. The paragraph is kept whole, which is exactly what
    // the product did before this file existed — a worse structure, never a
    // wrong one.
    return { observations: wholeThing(input), usedFallback: true, rejected: [] };
  }

  let raw: { kind: string; note: string }[];
  try {
    raw = await extractor.extract(input);
  } catch {
    return { observations: wholeThing(input), usedFallback: true, rejected: [] };
  }

  const haystack = normalise(input);
  const observations: ParsedObservation[] = [];
  const rejected: ParseResult["rejected"] = [];

  for (const candidate of raw) {
    const note = (candidate.note ?? "").trim();
    if (!note) continue;

    if (!KINDS.includes(candidate.kind as ObservationKind)) {
      rejected.push({ kind: candidate.kind, note, reason: "unknown_kind" });
      continue;
    }
    // The check this file exists for.
    if (!haystack.includes(normalise(note))) {
      rejected.push({ kind: candidate.kind, note, reason: "not_verbatim" });
      continue;
    }
    observations.push({ kind: candidate.kind as ObservationKind, note });
  }

  // Everything the model produced was invented or malformed. Keeping the
  // paragraph whole is better than keeping nothing, and better than keeping
  // the parts that happen to have survived a broken response.
  if (observations.length === 0) {
    return { observations: wholeThing(input), usedFallback: true, rejected };
  }

  return { observations, usedFallback: false, rejected };
}
