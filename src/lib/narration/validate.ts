/**
 * Check a narration against the verdict it claims to describe.
 *
 * This is what makes it safe to let a language model write the words. The model
 * is not trusted; its output is verified. Every rule here is a deterministic
 * comparison against the verdict — no model judges another model, and the same
 * checks run whether the text came from a template or from Claude.
 *
 * A narration that fails any of these is not shown. The deterministic narrator
 * is used instead. Silence is recoverable; a wrong medication explanation is
 * not.
 */

import type { Verdict } from "../verdict/types";
import type { Narration } from "./types";

/**
 * Names the registers know, for catching invention.
 *
 * The narrator may not reach the registers. The validator may — and must.
 * Checking only 【】-marked names left the obvious attack open: a fluent
 * paragraph naming a medicine it was never given, with an interaction nobody
 * evaluated, marked as ordinary explanation. Detecting that needs exactly the
 * knowledge the narrator is denied, which is why it lives on this side of the
 * seam.
 *
 * Names shorter than this are excluded: two characters appear inside ordinary
 * prose and would reject valid narration.
 */
export type KnownMedicineIndex = { names: string[] };

const MIN_DETECTABLE_NAME_LENGTH = 3;

export function buildKnownMedicineIndex(sources: {
  drugs: { nameZh: string }[];
  healthFoods: { nameZh: string }[];
}): KnownMedicineIndex {
  const names = new Set<string>();
  for (const d of sources.drugs) {
    if (d.nameZh.length >= MIN_DETECTABLE_NAME_LENGTH) names.add(d.nameZh);
  }
  for (const f of sources.healthFoods) {
    if (f.nameZh.length >= MIN_DETECTABLE_NAME_LENGTH) names.add(f.nameZh);
  }
  return { names: [...names] };
}

export type Violation = {
  code:
    | "unknown_medicine_named"
    | "verified_text_altered"
    | "coverage_not_disclosed"
    | "dose_instruction"
    | "stop_or_change_instruction"
    | "asserts_past_behaviour"
    | "missing_escalation"
    | "subject_not_named";
  detail: string;
};

export type ValidationResult = { ok: true } | { ok: false; violations: Violation[] };

/**
 * Instructions about how much to take. The product records what is present,
 * never how much, so any number-plus-unit reads as a dose it cannot know.
 */
const DOSE_PATTERN =
  /\d+\s*(?:mg|毫克|公絲|ml|毫升|顆|粒|錠|包|次|片)|一天\s*\d|每日\s*\d|每天\s*\d/;

/** Telling someone to stop, halve, or swap a medicine. That is a prescriber's call. */
const CHANGE_PATTERN =
  /停(?:藥|用|掉)|不要(?:再)?(?:吃|服用)|別(?:再)?(?:吃|服用)|改成|換成|減(?:半|量)|加量|自行調整/;

/**
 * Claims about what the person did. Memory for one's own routine is
 * reconstructive, and a system that asserts "you missed it yesterday" writes
 * itself into that memory. The product may report what was logged; it may not
 * narrate the past.
 */
const PAST_BEHAVIOUR_PATTERN =
  /(?:您|你|他|她)(?:昨天|前天|上週|上周|這週|這周|最近)[^。！？]{0,12}(?:沒(?:有)?(?:吃|服用)|忘記|漏(?:吃|服))/;

const ESCALATION_PATTERN = /藥師|醫師|醫生/;

export function validateNarration(
  narration: Narration,
  verdict: Verdict,
  known?: KnownMedicineIndex,
): ValidationResult {
  const violations: Violation[] = [];
  const all = narration.segments.map((s) => s.text).join("\n");

  /**
   * The dose and change checks police what we wrote, not what we quoted.
   *
   * STOPP E4 reads "NSAID's if eGFR < 50 ml/min/1.73m2" — a faithful quote
   * contains "50 ml" and would be rejected for being faithful. Quoted segments
   * are already constrained by the stronger check below: they must appear in
   * the verdict character for character.
   */
  const ourOwnWords = narration.segments
    .filter((s) => s.kind !== "verified")
    .map((s) => s.text)
    .join("\n");

  // 1. Whose medications this is about, always. A carer may hold twelve people.
  if (!all.includes(verdict.subject.displayName)) {
    violations.push({
      code: "subject_not_named",
      detail: `narration never names ${verdict.subject.displayName}`,
    });
  }

  // 2. No medicine that is not in the verdict. The clearest form of invention.
  const permitted = knownNames(verdict);
  for (const named of namedMedicines(narration)) {
    if (!permitted.has(named)) {
      violations.push({
        code: "unknown_medicine_named",
        detail: `"${named}" appears in the narration but not in the verdict`,
      });
    }
  }

  // 2b. No medicine the registers know but this verdict does not contain,
  //     marked or not. Without this, unmarked prose was unchecked: a verdict
  //     holding only paracetamol accepted a fluent sentence about aspirin and
  //     a bleeding risk nobody had evaluated.
  if (known) {
    for (const name of known.names) {
      if (!ourOwnWords.includes(name)) continue;
      if (permitted.has(name)) continue;
      // A name inside another name we were given is not an invention.
      if ([...permitted].some((p) => p.includes(name))) continue;
      violations.push({
        code: "unknown_medicine_named",
        detail: `"${name}" is a medicine in the register but not in this verdict`,
      });
    }
  }

  // 3. Quoted text is quoted. A paraphrased criterion is no longer the source.
  const sourceTexts = quotableTexts(verdict);
  for (const segment of narration.segments) {
    if (segment.kind !== "verified") continue;
    const matches = sourceTexts.some((t) => normalise(t).includes(normalise(segment.text)));
    if (!matches) {
      violations.push({
        code: "verified_text_altered",
        detail: `segment marked verified is not present in any source text: "${truncate(segment.text)}"`,
      });
    }
  }

  // 4. Incomplete coverage is stated. Findings without coverage read as a
  //    complete picture, and the items nobody could identify are exactly the
  //    ones that matter.
  if (verdict.coverage.itemsUnresolved > 0) {
    const disclosed = narration.segments.some((s) => s.kind === "coverage");
    if (!disclosed) {
      violations.push({
        code: "coverage_not_disclosed",
        detail: `${verdict.coverage.itemsUnresolved} item(s) unidentified but no coverage segment`,
      });
    }
  }

  // 5–6. No dosing, no stopping or swapping. Both are a prescriber's decisions.
  if (DOSE_PATTERN.test(ourOwnWords)) {
    violations.push({
      code: "dose_instruction",
      detail: firstMatch(ourOwnWords, DOSE_PATTERN),
    });
  }
  if (CHANGE_PATTERN.test(ourOwnWords)) {
    violations.push({
      code: "stop_or_change_instruction",
      detail: firstMatch(ourOwnWords, CHANGE_PATTERN),
    });
  }

  // 7. No claims about what the person did.
  if (PAST_BEHAVIOUR_PATTERN.test(ourOwnWords)) {
    violations.push({
      code: "asserts_past_behaviour",
      detail: firstMatch(ourOwnWords, PAST_BEHAVIOUR_PATTERN),
    });
  }

  // 8. Where there is something to raise, the narration ends at a human.
  if (verdict.findings.length > 0 && !ESCALATION_PATTERN.test(all)) {
    violations.push({
      code: "missing_escalation",
      detail: "findings present but narration never points at a pharmacist or physician",
    });
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/** Every medicine name the verdict legitimately contains. */
function knownNames(verdict: Verdict): Set<string> {
  const names = new Set<string>();
  for (const item of verdict.items) {
    names.add(item.inputText);
    if (item.resolved) {
      names.add(item.nameZh);
      if (item.nameEn) names.add(item.nameEn);
      for (const ingredient of item.ingredients) names.add(ingredient);
    }
  }
  return names;
}

/**
 * Medicine names the narration presents as such.
 *
 * Rather than trying to detect drug names in free prose — which would need the
 * very knowledge this layer is denied — narration marks them. A model that
 * mentions a medicine without marking it produces a segment that fails the
 * quoted-text or coverage checks instead.
 */
function namedMedicines(narration: Narration): string[] {
  const found: string[] = [];
  for (const segment of narration.segments) {
    for (const match of segment.text.matchAll(/【([^】]+)】/g)) {
      found.push(match[1].trim());
    }
  }
  return found;
}

function quotableTexts(verdict: Verdict): string[] {
  const texts: string[] = [];
  for (const finding of verdict.findings) {
    texts.push(finding.verbatim);
    if (finding.limits) texts.push(finding.limits);
    for (const quoted of finding.officialText ?? []) texts.push(quoted.text);
  }
  for (const item of verdict.items) {
    if (!item.resolved) continue;
    if (item.indications) texts.push(item.indications);
    if (item.officialWarning) texts.push(item.officialWarning);
    if (item.officialPrecautions) texts.push(item.officialPrecautions);
  }
  return texts;
}

/** Whitespace and line breaks differ between the register and a rendered page. */
function normalise(text: string): string {
  return text.replace(/[\s　]+/g, "");
}

function firstMatch(text: string, pattern: RegExp): string {
  return truncate(text.match(pattern)?.[0] ?? "");
}

function truncate(text: string): string {
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}
