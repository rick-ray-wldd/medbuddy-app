/**
 * Choose a narrator, then verify what it produced.
 *
 * The language model writes better Chinese than a template does, and it is
 * used when it is available. It is not trusted: its output is validated
 * against the verdict, and a narration that fails is discarded in favour of
 * the deterministic one. Nobody is shown text that failed a check.
 *
 * The fallback is not an error path. It is the guarantee that makes using a
 * model here defensible at all.
 */

import type { Verdict } from "../verdict/types";
import { DeterministicNarrator } from "./deterministic";
import type { Narration, NarrationAudience, Narrator } from "./types";
import {
  validateNarration,
  type KnownMedicineIndex,
  type Violation,
} from "./validate";

export type NarrationOutcome = {
  narration: Narration;
  /** What the preferred narrator produced that the checks rejected, if anything. */
  rejected?: { producedBy: Narration["producedBy"]; violations: Violation[] };
  /** True when we fell back. Surfaced rather than hidden. */
  usedFallback: boolean;
  /**
   * Violations in the fallback itself.
   *
   * The template narrator failing its own checks is a defect in this
   * repository, not a runtime condition — there is a test asserting it never
   * happens. If it reaches production anyway, the caller has to know rather
   * than render text nothing vouched for. Carried out rather than swallowed.
   */
  fallbackViolations?: Violation[];
};

/**
 * Produce the fallback and check it too.
 *
 * The docstring in validate.ts promises the same checks run whichever narrator
 * wrote the text. Running them only on the model's output would have made that
 * a claim rather than a guarantee.
 */
async function verifiedFallback(
  verdict: Verdict,
  audience: NarrationAudience,
  known?: KnownMedicineIndex,
): Promise<{ narration: Narration; violations?: Violation[] }> {
  const narration = await new DeterministicNarrator().narrate(verdict, audience);
  const result = validateNarration(narration, verdict, known);
  return result.ok ? { narration } : { narration, violations: result.violations };
}

/**
 * How long we wait for a model.
 *
 * The documented behaviour was "unreachable, slow, or unparseable — fall
 * back", and a review pointed out that `await` on a model that never resolves
 * is not slow, it is forever. A caregiver waiting on a page is a worse failure
 * than a plainer sentence.
 */
const MODEL_TIMEOUT_MS = 8_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`narrator exceeded ${ms}ms`)), ms),
    ),
  ]);
}

export async function narrate(
  verdict: Verdict,
  audience: NarrationAudience,
  preferred: Narrator | null,
  known?: KnownMedicineIndex,
): Promise<NarrationOutcome> {
  if (preferred) {
    try {
      const candidate = await withTimeout(
        preferred.narrate(verdict, audience),
        MODEL_TIMEOUT_MS,
      );
      const result = validateNarration(candidate, verdict, known);
      if (result.ok) return { narration: candidate, usedFallback: false };

      const fallback = await verifiedFallback(verdict, audience, known);
      return {
        narration: fallback.narration,
        rejected: { producedBy: candidate.producedBy, violations: result.violations },
        usedFallback: true,
        fallbackViolations: fallback.violations,
      };
    } catch {
      // A model that is unreachable, slow, or returns something unparseable is
      // the same situation as one that failed validation: use the text we can
      // vouch for.
      const fallback = await verifiedFallback(verdict, audience, known);
      return {
        narration: fallback.narration,
        usedFallback: true,
        fallbackViolations: fallback.violations,
      };
    }
  }

  const fallback = await verifiedFallback(verdict, audience, known);
  return {
    narration: fallback.narration,
    usedFallback: false,
    fallbackViolations: fallback.violations,
  };
}
