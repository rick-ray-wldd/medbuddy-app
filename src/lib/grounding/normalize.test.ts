import { describe, expect, it } from "vitest";
import {
  classifyDispensing,
  isActivePermit,
  normalizeIngredient,
  normalizeProductName,
  parseIngredients,
} from "./normalize";

describe("normalizeProductName", () => {
  it("matches a bag against a quoted register entry", () => {
    // register: "福元"蘇打錠500毫克   bag: 福元蘇打錠 500mg
    expect(normalizeProductName('"福元"蘇打錠500毫克')).toBe(
      normalizeProductName("福元蘇打錠 500mg"),
    );
  });

  it("folds full-width characters", () => {
    expect(normalizeProductName("達利炎錠５００ｍｇ")).toBe(
      normalizeProductName("達利炎錠500mg"),
    );
  });

  it("treats 公絲 as milligrams, as older register entries do", () => {
    expect(normalizeProductName("普拿疼500公絲")).toBe(
      normalizeProductName("普拿疼500毫克"),
    );
  });

  it("keeps strengths distinct", () => {
    // the dangerous failure: collapsing 5mg and 50mg into one product
    expect(normalizeProductName("脈優錠5mg")).not.toBe(
      normalizeProductName("脈優錠50mg"),
    );
  });

  it("is idempotent", () => {
    const once = normalizeProductName('"瑞士" 痛寧膠囊（待克菲那）');
    expect(normalizeProductName(once)).toBe(once);
  });
});

describe("parseIngredients", () => {
  it("splits a multi-ingredient product on the doubled semicolon", () => {
    expect(parseIngredients("PARACETAMOL;;CAFFEINE ANHYDROUS;;ETHENZAMIDE")).toEqual([
      "PARACETAMOL",
      "CAFFEINE ANHYDROUS",
      "ETHENZAMIDE",
    ]);
  });

  it("drops a trailing salt-equivalence note", () => {
    expect(
      parseIngredients("SODIUM BICARBONATE ( EQ TO SODIUM HYDROGEN CARBONATE)"),
    ).toEqual(["SODIUM BICARBONATE"]);
  });

  it("returns nothing rather than guessing when the field is absent", () => {
    // 154 kept permits carry no ingredient string. They must resolve to
    // an empty list so the caller reports them unresolved, never invents one.
    expect(parseIngredients(null)).toEqual([]);
    expect(parseIngredients("")).toEqual([]);
    expect(parseIngredients(";;")).toEqual([]);
  });
});

describe("normalizeIngredient", () => {
  it("upper-cases and collapses whitespace", () => {
    expect(normalizeIngredient("  ibuprofen   sodium ")).toBe("IBUPROFEN SODIUM");
  });

  it("keeps a parenthetical that is not trailing", () => {
    expect(normalizeIngredient("VITAMIN B12 (CYANOCOBALAMIN) COMPLEX")).toBe(
      "VITAMIN B12 (CYANOCOBALAMIN) COMPLEX",
    );
  });
});

describe("classifyDispensing", () => {
  it("separates what needs a prescription from what does not", () => {
    expect(classifyDispensing("須由醫師處方使用")).toBe("prescription");
    expect(classifyDispensing("限由醫師使用")).toBe("prescription");
    expect(classifyDispensing("醫師藥師藥劑生指示藥品")).toBe("pharmacist_directed");
    expect(classifyDispensing("成藥")).toBe("otc");
    expect(classifyDispensing("乙類成藥")).toBe("otc");
  });

  it("excludes raw materials, which never reach a patient as-is", () => {
    expect(classifyDispensing("製劑原料")).toBe("not_dispensed");
    expect(classifyDispensing("原料藥")).toBe("not_dispensed");
  });

  it("defaults to not_dispensed on an unknown category", () => {
    // Unknown must never be optimistically treated as dispensable.
    expect(classifyDispensing("")).toBe("not_dispensed");
    expect(classifyDispensing(undefined)).toBe("not_dispensed");
  });
});

describe("isActivePermit", () => {
  it("treats only an empty revocation status as live", () => {
    expect(isActivePermit("")).toBe(true);
    expect(isActivePermit(null)).toBe(true);
    expect(isActivePermit("已註銷")).toBe(false);
    expect(isActivePermit("已廢止")).toBe(false);
  });
});
