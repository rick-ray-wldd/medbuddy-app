import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assertRuleSetIsSafe, evaluateRules, type EvaluationInput } from "./engine";
import type { DrugClasses, EvaluationItem, RuleSet } from "./types";

let stopp: RuleSet;
let classes: DrugClasses;

beforeAll(() => {
  const read = (f: string) =>
    JSON.parse(readFileSync(path.join(process.cwd(), "config", "rules", f), "utf8"));
  stopp = read("stopp-v3.json");
  classes = read("drug-classes.json");
});

function item(ref: string, inputText: string, ingredients: string[]): EvaluationItem {
  return { ref, inputText, ingredients };
}

function father(items: EvaluationItem[], conditions: EvaluationInput["subject"]["conditions"] = []) {
  return {
    subject: { id: "subj-1", displayName: "父親", ageYears: 72, conditions },
    items,
  };
}

describe("the rule set as committed", () => {
  it("carries a citation, a licence and a retrieval date", () => {
    expect(stopp.citation.doi).toBe("10.1007/s41999-023-00777-y");
    expect(stopp.citation.licence).toBe("CC BY 4.0");
    expect(stopp.citation.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("quotes every criterion verbatim rather than paraphrasing it", () => {
    for (const rule of stopp.rules) {
      expect(rule.verbatim.length).toBeGreaterThan(40);
      expect(rule.id).toMatch(/^STOPP-[A-Z]\d+$/);
    }
  });

  it("states its own coverage instead of implying completeness", () => {
    expect(stopp.coverage.criteriaEncodedHere).toBe(stopp.rules.length);
    expect(stopp.coverage.criteriaEncodedHere).toBeLessThan(stopp.coverage.criteriaInSource);
  });
});

describe("the case this product was built around", () => {
  // Impaired liver function; reaches into the cupboard for a painkiller at
  // night. Neither the painkiller nor the drinking is in any medical record.
  it("raises hepatotoxicity for paracetamol with chronic liver disease", () => {
    const result = evaluateRules(
      father([item("i1", "普拿疼", ["ACETAMINOPHEN"])], ["chronic_liver_disease"]),
      [stopp],
      classes,
    );

    const finding = result.findings.find((f) => f.ruleId === "STOPP-L6");
    expect(finding).toBeDefined();
    expect(finding!.verbatim).toContain("chronic liver disease");
    expect(finding!.involves.map((i) => i.inputText)).toEqual(["普拿疼"]);
    expect(finding!.conditions).toEqual(["chronic_liver_disease"]);
  });

  it("states the limit of that finding rather than asserting the dose", () => {
    // The criterion is conditional on ≥3 g/24h. We cannot see dose, and the
    // finding has to say so — otherwise it reads as a determination.
    const result = evaluateRules(
      father([item("i1", "普拿疼", ["ACETAMINOPHEN"])], ["chronic_liver_disease"]),
      [stopp],
      classes,
    );
    const finding = result.findings.find((f) => f.ruleId === "STOPP-L6")!;
    expect(finding.limits).toBeTruthy();
    expect(finding.limits).toMatch(/dose/i);
  });

  it("does not raise it without the recorded condition", () => {
    const result = evaluateRules(father([item("i1", "普拿疼", ["ACETAMINOPHEN"])]), [stopp], classes);
    expect(result.findings.find((f) => f.ruleId === "STOPP-L6")).toBeUndefined();
  });
});

describe("matching ingredients as the register writes them", () => {
  it("matches a salt form against the base ingredient in a criterion", () => {
    // The register says DICLOFENAC SODIUM; the criterion says NSAIDs.
    const result = evaluateRules(
      father(
        [
          item("i1", "待克菲那", ["DICLOFENAC SODIUM"]),
          item("i2", "可邁丁", ["WARFARIN SODIUM"]),
        ],
        [],
      ),
      [stopp],
      classes,
    );
    const finding = result.findings.find((f) => f.ruleId === "STOPP-C10");
    expect(finding).toBeDefined();
    expect(finding!.involves).toHaveLength(2);
  });

  it("names both medicines in a combination finding", () => {
    // "There is an interaction" without saying between what is unusable to a
    // carer holding several people's medicines.
    const result = evaluateRules(
      father([
        item("i1", "待克菲那", ["DICLOFENAC SODIUM"]),
        item("i2", "可邁丁", ["WARFARIN SODIUM"]),
      ]),
      [stopp],
      classes,
    );
    const involved = result.findings
      .find((f) => f.ruleId === "STOPP-C10")!
      .involves.map((i) => i.inputText);
    expect(involved).toContain("待克菲那");
    expect(involved).toContain("可邁丁");
  });

  it("ignores items with no ingredients", () => {
    // Unresolved items carry no ingredients and must not trigger anything.
    const result = evaluateRules(
      father([item("i1", "鄰居給的紅麴", [])], ["chronic_liver_disease"]),
      [stopp],
      classes,
    );
    expect(result.findings).toHaveLength(0);
  });
});

describe("duplication", () => {
  it("catches two medicines from the same class", () => {
    // Common when leftovers are kept: an old bag and a new one.
    const result = evaluateRules(
      father([
        item("i1", "達利炎錠", ["IBUPROFEN"]),
        item("i2", "上次剩的止痛藥", ["NAPROXEN SODIUM"]),
      ]),
      [stopp],
      classes,
    );
    const finding = result.findings.find((f) => f.ruleId === "STOPP-A3");
    expect(finding).toBeDefined();
    expect(finding!.involves).toHaveLength(2);
  });

  it("does not fire on a single medicine of that class", () => {
    const result = evaluateRules(father([item("i1", "達利炎錠", ["IBUPROFEN"])]), [stopp], classes);
    expect(result.findings.find((f) => f.ruleId === "STOPP-A3")).toBeUndefined();
  });
});

describe("boundaries the engine must not cross", () => {
  it("only ever advises consulting a pharmacist or a physician", () => {
    const result = evaluateRules(
      father(
        [
          item("i1", "普拿疼", ["ACETAMINOPHEN"]),
          item("i2", "待克菲那", ["DICLOFENAC SODIUM"]),
          item("i3", "可邁丁", ["WARFARIN SODIUM"]),
          item("i4", "使蒂諾斯", ["ZOLPIDEM TARTRATE"]),
        ],
        ["chronic_liver_disease", "recurrent_falls", "peptic_ulcer_or_gi_bleed"],
      ),
      [stopp],
      classes,
    );
    expect(result.findings.length).toBeGreaterThan(0);
    for (const f of result.findings) {
      expect(["consult_pharmacist", "consult_physician"]).toContain(f.severity);
    }
  });

  it("attaches every finding to a subject", () => {
    const result = evaluateRules(
      father([item("i1", "普拿疼", ["ACETAMINOPHEN"])], ["chronic_liver_disease"]),
      [stopp],
      classes,
    );
    for (const f of result.findings) expect(f.subjectId).toBe("subj-1");
  });

  it("skips a rule set whose age scope does not cover the person", () => {
    // Criteria written for people 65 and over say nothing about a 40-year-old.
    const result = evaluateRules(
      {
        subject: { id: "s2", displayName: "測試", ageYears: 40, conditions: ["chronic_liver_disease"] },
        items: [item("i1", "普拿疼", ["ACETAMINOPHEN"])],
      },
      [stopp],
      classes,
    );
    expect(result.findings).toHaveLength(0);
    expect(result.skippedRuleSets[0].reason).toContain("applies from age 65");
  });

  it("reports which rule set version produced the findings", () => {
    const result = evaluateRules(
      father([item("i1", "普拿疼", ["ACETAMINOPHEN"])], ["chronic_liver_disease"]),
      [stopp],
      classes,
    );
    expect(result.ruleSetVersions[0].id).toBe("stopp-v3");
    expect(result.ruleSetVersions[0].version).toContain("3");
  });

  it("is deterministic", () => {
    const input = father(
      [item("i1", "普拿疼", ["ACETAMINOPHEN"]), item("i2", "達利炎錠", ["IBUPROFEN"])],
      ["chronic_liver_disease", "recurrent_falls"],
    );
    const a = evaluateRules(input, [stopp], classes);
    const b = evaluateRules(input, [stopp], classes);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("refuses a rule set declaring a severity that is not an escalation", () => {
    // A review showed this: the two-value guarantee was a type and a test over
    // one fixture. A rule file saying "stop_now" was copied onto a finding and
    // out to the surface. Rule sets are data, and data from a file is where a
    // type stops helping.
    const rogue = {
      ...stopp,
      rules: [{ ...stopp.rules[0], severity: "stop_now" as never }],
    };
    expect(() => assertRuleSetIsSafe(rogue)).toThrow(/stop_now/);
    expect(() =>
      evaluateRules(father([item("i1", "普拿疼", ["ACETAMINOPHEN"])]), [rogue], classes),
    ).toThrow(/only consult_pharmacist and consult_physician/);
  });

  it("refuses a rule with no source text to quote", () => {
    const empty = { ...stopp, rules: [{ ...stopp.rules[0], verbatim: "  " }] };
    expect(() => assertRuleSetIsSafe(empty)).toThrow(/no source text/);
  });

  it("accepts the rule sets this repository ships", () => {
    expect(() => assertRuleSetIsSafe(stopp)).not.toThrow();
  });

  it("throws rather than silently passing an unknown predicate", () => {
    const broken = {
      ...stopp,
      rules: [{ ...stopp.rules[0], when: { somethingElse: [] } as never }],
    };
    expect(() =>
      evaluateRules(father([item("i1", "x", ["ACETAMINOPHEN"])]), [broken], classes),
    ).toThrow(/Unknown predicate/);
  });
});
