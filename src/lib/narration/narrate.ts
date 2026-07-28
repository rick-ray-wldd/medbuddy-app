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
import { validateNarration, type Violation } from "./validate";

export type NarrationOutcome = {
  narration: Narration;
  /** What the preferred narrator produced that the checks rejected, if anything. */
  rejected?: { producedBy: Narration["producedBy"]; violations: Violation[] };
  /** True when we fell back. Surfaced rather than hidden. */
  usedFallback: boolean;
};

export async function narrate(
  verdict: Verdict,
  audience: NarrationAudience,
  preferred: Narrator | null,
): Promise<NarrationOutcome> {
  const fallback = new DeterministicNarrator();

  if (preferred) {
    try {
      const candidate = await preferred.narrate(verdict, audience);
      const result = validateNarration(candidate, verdict);
      if (result.ok) return { narration: candidate, usedFallback: false };

      return {
        narration: await fallback.narrate(verdict, audience),
        rejected: { producedBy: candidate.producedBy, violations: result.violations },
        usedFallback: true,
      };
    } catch {
      // A model that is unreachable, slow, or returns something unparseable is
      // the same situation as one that failed validation: use the text we can
      // vouch for.
      return {
        narration: await fallback.narrate(verdict, audience),
        usedFallback: true,
      };
    }
  }

  return { narration: await fallback.narrate(verdict, audience), usedFallback: false };
}
