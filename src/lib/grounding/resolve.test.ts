import { describe, expect, it } from "vitest";
import { Resolver, type Registers } from "./resolve";
import { normalizeProductName } from "./normalize";

/**
 * A small hand-built register. Real data is exercised separately in
 * registry.test.ts; here the shapes are fixed so the resolution rules are
 * readable.
 */
function drug(nameZh: string, permit: string, ingredients: string[], extra = {}) {
  return {
    permit,
    nameZh,
    key: normalizeProductName(nameZh),
    ingredients,
    dispensing: "prescription" as const,
    ...extra,
  };
}

const registers: Registers = {
  drugs: {
    retrievedAt: "2026-07-27",
    drugs: [
      drug("脈優錠5毫克", "衛署藥製字第001號", ["AMLODIPINE"], {
        indications: "高血壓",
        form: "錠劑",
      }),
      drug("脈優錠50毫克", "衛署藥製字第002號", ["AMLODIPINE"]),
      drug("達利炎錠", "衛署藥製字第003號", ["IBUPROFEN"], {
        dispensing: "pharmacist_directed" as const,
        indications: "解熱、鎮痛、消炎",
      }),
      drug("無成分測試錠", "衛署藥製字第004號", []),
    ],
  },
  healthFoods: {
    retrievedAt: "2026-07-27",
    healthFoods: [
      {
        permit: "衛部健食字第A00235號",
        nameZh: "桂格100%喝的燕麥",
        key: normalizeProductName("桂格100%喝的燕麥"),
        functionalIngredients: "β-聚葡萄醣 (β-glucan)",
        claim: "調節血脂",
        warning: "攝取本產品應取代等量之日常穀類飲食。",
        precautions: "請洽詢醫師或營養師有關於使用本產品之意見。",
      },
    ],
  },
};

const resolver = new Resolver(registers);

describe("resolving what is printed on a bag", () => {
  it("matches an exact name", () => {
    const r = resolver.resolveOne({ text: "脈優錠5毫克", source: "prescription" });
    expect(r.resolved).toBe(true);
    if (!r.resolved) return;
    expect(r.ingredients).toEqual(["AMLODIPINE"]);
    expect(r.matchedBy).toBe("exact_key");
    expect(r.indications).toBe("高血壓");
  });

  it("matches across the spelling differences between bag and register", () => {
    const r = resolver.resolveOne({ text: "脈優錠 5mg" });
    expect(r.resolved).toBe(true);
    if (!r.resolved) return;
    expect(r.permit).toBe("衛署藥製字第001號");
  });

  it("keeps the input text verbatim, whatever it matched", () => {
    const r = resolver.resolveOne({ text: "  脈優錠 5mg  " });
    expect(r.inputText).toBe("脈優錠 5mg");
  });

  it("carries the register's own indications rather than composing them", () => {
    const r = resolver.resolveOne({ text: "達利炎錠" });
    expect(r.resolved).toBe(true);
    if (!r.resolved) return;
    expect(r.indications).toBe("解熱、鎮痛、消炎");
  });
});

describe("refusing to guess", () => {
  it("reports no match rather than returning nothing", () => {
    // The cupboard holds things no register knows. They stay in the record.
    const r = resolver.resolveOne({ text: "鄰居給的紅麴膠囊", source: "supplement" });
    expect(r.resolved).toBe(false);
    if (r.resolved) return;
    expect(r.reason).toBe("no_match");
    expect(r.inputText).toBe("鄰居給的紅麴膠囊");
    expect(r.source).toBe("supplement");
  });

  it("refuses to choose between two strengths of the same medicine", () => {
    // "脈優錠" alone is a substring of both 5mg and 50mg. Picking one would be
    // a confident wrong answer about a dose.
    const r = resolver.resolveOne({ text: "脈優錠" });
    expect(r.resolved).toBe(false);
    if (r.resolved) return;
    expect(r.reason).toBe("ambiguous");
    expect(r.candidates?.length).toBeGreaterThan(1);
  });

  it("treats a product with no stated ingredients as unresolved", () => {
    // We can name it; we cannot say what is in it; no rule can run against it.
    const r = resolver.resolveOne({ text: "無成分測試錠" });
    expect(r.resolved).toBe(false);
    if (r.resolved) return;
    expect(r.reason).toBe("matched_without_ingredients");
    expect(r.candidates?.[0].nameZh).toBe("無成分測試錠");
  });

  it("does not match on a fragment too short to mean anything", () => {
    expect(resolver.resolveOne({ text: "錠" }).resolved).toBe(false);
  });

  it("handles empty input without throwing", () => {
    expect(resolver.resolveOne({ text: "   " }).resolved).toBe(false);
  });
});

describe("health foods", () => {
  it("carries the regulator's warning text verbatim", () => {
    const r = resolver.resolveOne({ text: "桂格100%喝的燕麥", source: "supplement" });
    expect(r.resolved).toBe(true);
    if (!r.resolved) return;
    expect(r.register).toBe("tfda_health_food");
    expect(r.officialWarning).toBe("攝取本產品應取代等量之日常穀類飲食。");
    expect(r.officialPrecautions).toContain("請洽詢醫師或營養師");
  });
});

describe("resolving a whole list", () => {
  it("returns one item per input and counts what it could not identify", () => {
    const result = resolver.resolveAll([
      { text: "脈優錠5毫克", source: "prescription" },
      { text: "達利炎錠", source: "leftover" },
      { text: "鄰居給的紅麴膠囊", source: "supplement" },
      { text: "阿姨推薦的魚油", source: "supplement" },
    ]);

    expect(result.items).toHaveLength(4);
    expect(result.unresolvedCount).toBe(2);
    expect(result.registryVersions.drugs).toBe("2026-07-27");
  });

  it("never silently drops an input", () => {
    // The failure this guards against: a list that looks complete because the
    // items nobody could identify quietly disappeared from it.
    const inputs = ["脈優錠5毫克", "不存在的藥", "", "另一個不存在的"].map((text) => ({
      text,
    }));
    expect(resolver.resolveAll(inputs).items).toHaveLength(inputs.length);
  });
});
