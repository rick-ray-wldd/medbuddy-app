/**
 * Narration turns a verdict into language a family can read.
 *
 * It is the only place a language model appears in this product, and it is
 * deliberately the least powerful thing in the pipeline: it receives the
 * verdict and nothing else, so it cannot reach the drug data, cannot evaluate a
 * criterion, and cannot invent a finding. What it produces is checked against
 * the verdict before anyone sees it.
 */

export type SegmentKind =
  /** Quoted from a source — a criterion or a regulator's warning. Never edited. */
  | "verified"
  /** Plain-language explanation, written for this reader. */
  | "explained"
  /** What to do next. Always ends at a pharmacist or a physician. */
  | "action"
  /** What the check did not cover. Never omitted when coverage is incomplete. */
  | "coverage";

export type Segment = {
  kind: SegmentKind;
  text: string;
  /** For "verified", where the quoted text came from. */
  attribution?: string;
  /** Which finding this belongs to, when it belongs to one. */
  findingId?: string;
};

export type Narration = {
  subjectId: string;
  subjectName: string;
  segments: Segment[];
  /** Which narrator produced this, so a reviewer can tell. */
  producedBy: "deterministic" | "claude";
};

export type NarrationAudience = "caregiver" | "elder";

export interface Narrator {
  readonly name: Narration["producedBy"];
  narrate(
    verdict: import("../verdict/types").Verdict,
    audience: NarrationAudience,
  ): Promise<Narration>;
}
