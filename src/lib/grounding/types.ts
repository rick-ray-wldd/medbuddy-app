/**
 * What comes out of grounding: one line of what a person actually takes,
 * either resolved against a register or explicitly not.
 */

import type { DispensingClass } from "./normalize";

/** Where a line came from, as reported by the person entering it. */
export type ItemSource =
  | "prescription" // off a pharmacy bag
  | "otc" // bought over the counter
  | "supplement" // a bottle in the cupboard
  | "leftover" // left from an earlier prescription
  | "unknown";

export type ResolvedItem = {
  resolved: true;
  /** Verbatim, as typed or spoken. Never overwritten by what we matched. */
  inputText: string;
  source: ItemSource;
  register: "tfda_drug" | "tfda_health_food";
  permit: string;
  nameZh: string;
  nameEn?: string;
  /** Uppercased ingredient names. Rules are written against these. */
  ingredients: string[];
  /** The register's own words for what it treats. Quoted, never paraphrased. */
  indications?: string;
  form?: string;
  dispensing?: DispensingClass;
  /** Regulator-approved warning text, for health foods. Quoted verbatim. */
  officialWarning?: string;
  officialPrecautions?: string;
  /** How the match was made, so a reviewer can see why we believe it. */
  matchedBy: "exact_key" | "contains";
};

export type UnresolvedItem = {
  resolved: false;
  inputText: string;
  source: ItemSource;
  /**
   * Why it did not resolve. Surfaced to the user — "we could not identify
   * this" is information, not an error to swallow.
   */
  reason: "no_match" | "ambiguous" | "matched_without_ingredients";
  /** For "ambiguous": what it could have been, so a human can disambiguate. */
  candidates?: { permit: string; nameZh: string }[];
};

export type GroundedItem = ResolvedItem | UnresolvedItem;

/**
 * The result of grounding a whole list. `unresolvedCount` is reported
 * alongside the items rather than derived at the call site, because coverage
 * has to be stated everywhere the findings are, and something stated in one
 * place gets forgotten in the other.
 */
export type GroundingResult = {
  items: GroundedItem[];
  unresolvedCount: number;
  registryVersions: { drugs: string; healthFoods: string };
};
