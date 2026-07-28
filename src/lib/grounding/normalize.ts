/**
 * Text normalisation for matching what is printed on a Taiwanese pharmacy bag
 * against the TFDA permit register.
 *
 * Pure functions, no I/O. Everything here is exercised by normalize.test.ts —
 * matching is where a medication grounding system quietly goes wrong, so it is
 * the part that gets tests first.
 */

/**
 * Product names in the register carry decoration that the printed bag may not,
 * and vice versa:
 *
 *   register: 「"福元"蘇打錠500毫克」
 *   bag:       「福元蘇打錠 500mg」
 *
 * Both must reduce to the same key. We strip manufacturer quoting, unify
 * full-width characters, drop whitespace, and lower-case.
 *
 * We deliberately keep digits: 5mg and 50mg are different products, and a
 * normaliser that erased that distinction would be actively dangerous.
 */
export function normalizeProductName(raw: string): string {
  return (
    raw
      .normalize("NFKC") // full-width → half-width, e.g. １１號 → 11號
      // manufacturer branding is quoted in the register but rarely on the bag
      .replace(/["'"'「」『』]/g, "")
      // spacing is inconsistent on both sides
      .replace(/[\s　]+/g, "")
      // unify the dosage unit spellings that appear in both sources
      .replace(/毫克/g, "mg")
      .replace(/毫升/g, "ml")
      .replace(/公絲/g, "mg") // older register entries use this for milligram
      .toLowerCase()
  );
}

/**
 * 主成分略述 packs the active ingredients of one product into a single string,
 * separated by a doubled semicolon:
 *
 *   "SODIUM BICARBONATE ( EQ TO SODIUM HYDROGEN CARBONATE)"
 *   "PARACETAMOL;;CAFFEINE ANHYDROUS;;ETHENZAMIDE"
 *
 * Rules are written against ingredients, not products, so this split is the
 * join between the register and the rule sets.
 */
export function parseIngredients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(";;")
    .map((part) => normalizeIngredient(part))
    .filter((part) => part.length > 0);
}

/**
 * One ingredient name, reduced to a comparison key.
 *
 * The parenthetical in "SODIUM BICARBONATE ( EQ TO SODIUM HYDROGEN CARBONATE)"
 * is a salt-equivalence note, not a second ingredient. We match on the head
 * term and drop the note — but only the trailing one, because a few entries
 * carry a parenthetical that is part of the name.
 */
export function normalizeIngredient(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\([^()]*\)\s*$/, "") // trailing equivalence note
    .replace(/[\s　]+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * 藥品類別 in the register is a regulatory classification. The product cares
 * about a coarser question: could this have reached the cupboard without a
 * prescription?
 *
 * That distinction matters because the medications a family self-administers
 * are exactly the ones absent from the prescription record.
 */
export type DispensingClass =
  | "prescription" // 須由醫師處方使用 / 限由醫師使用 / 由醫師或檢驗師使用
  | "pharmacist_directed" // 醫師藥師藥劑生指示藥品 — no prescription needed
  | "otc" // 成藥 / 乙類成藥 — off the shelf
  | "not_dispensed"; // 製劑原料 / 原料藥 — never reaches a patient as-is

export function classifyDispensing(category: string | null | undefined): DispensingClass {
  const c = (category ?? "").replace(/[\s　]/g, "");
  if (c.includes("原料")) return "not_dispensed";
  if (c.includes("指示藥品")) return "pharmacist_directed";
  if (c.includes("成藥")) return "otc";
  if (c.includes("醫師")) return "prescription";
  return "not_dispensed";
}

/**
 * A permit is usable only while it is live. The register keeps every permit
 * ever issued — roughly two-thirds of the file is revoked — and an empty
 * 註銷狀態 is what marks the live ones.
 */
export function isActivePermit(revocationStatus: string | null | undefined): boolean {
  return (revocationStatus ?? "").trim() === "";
}
