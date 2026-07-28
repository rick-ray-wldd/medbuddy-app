import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Resolver, type Registers } from "../grounding/resolve";
import type { DrugClasses, RuleSet } from "../rules/types";
import { buildVerdict } from "./build";
import { outcomeOf, type VerdictSubject } from "./types";

let resolver: Resolver;
let stopp: RuleSet;
let hfWarnings: RuleSet;
let classes: DrugClasses;
let registers: Registers;

beforeAll(() => {
  const read = (...p: string[]) =>
    JSON.parse(readFileSync(path.join(process.cwd(), ...p), "utf8"));
  registers = {
    drugs: read("data", "tfda-drugs.json"),
    healthFoods: read("data", "tfda-health-foods.json"),
  };
  resolver = new Resolver(registers);
  stopp = read("config", "rules", "stopp-v3.json");
  hfWarnings = read("config", "rules", "tfda-health-food-warnings.json");
  classes = read("config", "rules", "drug-classes.json");
});

const father: VerdictSubject = {
  id: "subj-father",
  displayName: "父親",
  ageYears: 72,
  conditions: ["chronic_liver_disease"],
};

/** A real product name from the register carrying the given ingredient. */
function nameCarrying(ingredient: string): string {
  const hit = registers.drugs.drugs.find(
    (d) => d.ingredients.some((i) => i.includes(ingredient)) && d.ingredients.length === 1,
  );
  if (!hit) throw new Error(`no single-ingredient product for ${ingredient}`);
  return hit.nameZh;
}

describe("the cupboard, end to end", () => {
  it("checks what it can identify and says what it could not", () => {
    const grounding = resolver.resolveAll([
      { text: nameCarrying("ACETAMINOPHEN"), source: "otc" },
      { text: "鄰居給的紅麴膠囊", source: "supplement" },
      { text: "阿姨推薦的魚油", source: "supplement" },
    ]);

    const verdict = buildVerdict(father, grounding, [stopp], classes);

    // Every submitted line survives into the verdict, identified or not.
    expect(verdict.items).toHaveLength(3);
    expect(verdict.coverage.itemsSubmitted).toBe(3);
    // The red yeast rice is a licensed product and does resolve; the fish oil
    // is ordinary food and is in no register at all. Both stay in the record.
    expect(verdict.coverage.itemsResolved).toBe(2);
    expect(verdict.coverage.itemsUnresolved).toBe(1);

    // And the criterion that this product exists for fires.
    const hepatic = verdict.findings.find((f) => f.ruleId === "STOPP-L6");
    expect(hepatic).toBeDefined();
    expect(hepatic!.verbatim).toContain("chronic liver disease");
    expect(hepatic!.limits).toMatch(/dose/i);
  });

  it("binds every finding to the person it is about", () => {
    const grounding = resolver.resolveAll([{ text: nameCarrying("ACETAMINOPHEN") }]);
    const verdict = buildVerdict(father, grounding, [stopp], classes);
    for (const f of verdict.findings) expect(f.subjectId).toBe("subj-father");
    expect(verdict.subject.displayName).toBe("父親");
  });

  it("carries provenance for both the registers and the rule sets", () => {
    const grounding = resolver.resolveAll([{ text: nameCarrying("ACETAMINOPHEN") }]);
    const verdict = buildVerdict(father, grounding, [stopp], classes);
    expect(verdict.provenance.registers.drugs).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(verdict.provenance.ruleSets[0].id).toBe("stopp-v3");
  });
});

describe("telling apart the two ways of having no findings", () => {
  it("reports nothing_checkable when nothing could be identified", () => {
    // The dangerous case: a screen counting findings shows zero and reads as
    // reassurance, when in fact not one item was recognised.
    //
    // Both of these are things a family actually buys and neither is licensed,
    // so neither is in any register.
    const grounding = resolver.resolveAll([
      { text: "阿姨推薦的魚油", source: "supplement" },
      { text: "巷口藥局買的維他命", source: "supplement" },
    ]);
    const verdict = buildVerdict(father, grounding, [stopp], classes);

    expect(verdict.findings).toHaveLength(0);
    expect(verdict.coverage.nothingChecked).toBe(true);
    expect(outcomeOf(verdict)).toBe("nothing_checkable");
  });

  it("reports checked_no_findings when something was checked and came back clear", () => {
    const grounding = resolver.resolveAll([{ text: nameCarrying("ACETAMINOPHEN") }]);
    const verdict = buildVerdict(
      { ...father, conditions: [] }, // without the condition, L6 does not apply
      grounding,
      [stopp],
      classes,
    );
    expect(verdict.findings).toHaveLength(0);
    expect(verdict.coverage.nothingChecked).toBe(false);
    expect(outcomeOf(verdict)).toBe("checked_no_findings");
  });

  it("treats an empty submission as nothing_checkable, not as clear", () => {
    const verdict = buildVerdict(father, resolver.resolveAll([]), [stopp], classes);
    expect(outcomeOf(verdict)).toBe("nothing_checkable");
  });
});

describe("the supplement nobody told the doctor about", () => {
  // A neighbour recommends red yeast rice. 54 such products are licensed in
  // Taiwan, and the warning the regulator approved for them says people with
  // liver disease should not take them. That never reaches a three-minute
  // consultation unless somebody says it out loud.
  it("raises the regulator's own warning against a recorded liver condition", () => {
    const grounding = resolver.resolveAll([
      { text: "鄰居給的紅麴膠囊", source: "supplement" },
    ]);
    const verdict = buildVerdict(father, grounding, [stopp, hfWarnings], classes);

    const finding = verdict.findings.find((f) => f.ruleId === "TFDA-HF-LIVER");
    expect(finding).toBeDefined();
    expect(finding!.ruleSetId).toBe("tfda-health-food-warnings");
    expect(finding!.severity).toBe("consult_physician");
  });

  it("quotes the approved warning rather than describing it", () => {
    const grounding = resolver.resolveAll([
      { text: "鄰居給的紅麴膠囊", source: "supplement" },
    ]);
    const verdict = buildVerdict(father, grounding, [stopp, hfWarnings], classes);
    const finding = verdict.findings.find((f) => f.ruleId === "TFDA-HF-LIVER")!;

    // The pharmacist should read the wording the regulator approved, not ours.
    expect(finding.officialText).toBeDefined();
    expect(finding.officialText![0].text).toContain("肝");
    // Licences are issued as 健食字 or 健食規字 depending on the review route.
    expect(finding.officialText![0].permit).toMatch(/健食/);
  });

  it("does not raise it for someone without the recorded condition", () => {
    const grounding = resolver.resolveAll([
      { text: "鄰居給的紅麴膠囊", source: "supplement" },
    ]);
    const verdict = buildVerdict(
      { ...father, conditions: [] },
      grounding,
      [stopp, hfWarnings],
      classes,
    );
    expect(verdict.findings.find((f) => f.ruleId === "TFDA-HF-LIVER")).toBeUndefined();
  });
});

describe("what must never reach a surface", () => {
  it("evaluates nothing against an item whose composition is unknown", () => {
    const grounding = resolver.resolveAll([{ text: "完全不存在的東西", source: "unknown" }]);
    const verdict = buildVerdict(father, grounding, [stopp], classes);
    expect(verdict.findings).toHaveLength(0);
    expect(verdict.coverage.itemsResolved).toBe(0);
  });

  it("keeps the person's own words next to whatever was matched", () => {
    const realName = nameCarrying("ACETAMINOPHEN");
    const grounding = resolver.resolveAll([{ text: `  ${realName}  `, source: "otc" }]);
    const verdict = buildVerdict(father, grounding, [stopp], classes);
    expect(verdict.items[0].inputText).toBe(realName);
  });

  it("is deterministic", () => {
    const run = () =>
      JSON.stringify(
        buildVerdict(
          father,
          resolver.resolveAll([
            { text: nameCarrying("ACETAMINOPHEN"), source: "otc" },
            { text: "鄰居給的紅麴膠囊", source: "supplement" },
          ]),
          [stopp],
          classes,
        ),
      );
    expect(run()).toBe(run());
  });
});
