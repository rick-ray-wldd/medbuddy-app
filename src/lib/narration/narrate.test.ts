import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Resolver, type Registers } from "../grounding/resolve";
import type { DrugClasses, RuleSet } from "../rules/types";
import { buildVerdict } from "../verdict/build";
import type { Verdict, VerdictSubject } from "../verdict/types";
import { DeterministicNarrator } from "./deterministic";
import { narrate } from "./narrate";
import type { Narration, NarrationAudience, Narrator } from "./types";
import { buildKnownMedicineIndex, validateNarration } from "./validate";

let resolver: Resolver;
let registers: Registers;
let ruleSets: RuleSet[];
let classes: DrugClasses;

const father: VerdictSubject = {
  id: "subj-father",
  displayName: "父親",
  ageYears: 72,
  conditions: ["chronic_liver_disease"],
};

beforeAll(() => {
  const read = (...p: string[]) =>
    JSON.parse(readFileSync(path.join(process.cwd(), ...p), "utf8"));
  registers = {
    drugs: read("data", "tfda-drugs.json"),
    healthFoods: read("data", "tfda-health-foods.json"),
  };
  resolver = new Resolver(registers);
  ruleSets = [
    read("config", "rules", "stopp-v3.json"),
    read("config", "rules", "tfda-health-food-warnings.json"),
  ];
  classes = read("config", "rules", "drug-classes.json");
});

function paracetamolName(): string {
  const hit = registers.drugs.drugs.find(
    (d) => d.ingredients.length === 1 && d.ingredients[0].includes("ACETAMINOPHEN"),
  )!;
  return hit.nameZh;
}

/** The scenario the product came from, plus something no register knows. */
function fatherVerdict(): Verdict {
  return buildVerdict(
    father,
    resolver.resolveAll([
      { text: paracetamolName(), source: "otc" },
      { text: "鄰居給的紅麴膠囊", source: "supplement" },
      { text: "阿姨推薦的魚油", source: "supplement" },
    ]),
    ruleSets,
    classes,
  );
}

/** A narrator that returns whatever it is handed, to exercise the checks. */
function stubNarrator(segments: Narration["segments"]): Narrator {
  return {
    name: "claude",
    async narrate(verdict) {
      return {
        subjectId: verdict.subject.id,
        subjectName: verdict.subject.displayName,
        producedBy: "claude",
        segments,
      };
    },
  };
}

describe("the deterministic narrator", () => {
  const audiences: NarrationAudience[] = ["caregiver", "elder"];

  it.each(audiences)("passes its own checks for %s", async (audience) => {
    const verdict = fatherVerdict();
    const narration = await new DeterministicNarrator().narrate(verdict, audience);
    expect(validateNarration(narration, verdict)).toEqual({ ok: true });
  });

  it("quotes the regulator rather than describing the warning", async () => {
    const verdict = fatherVerdict();
    const narration = await new DeterministicNarrator().narrate(verdict, "caregiver");
    const quoted = narration.segments.filter((s) => s.kind === "verified");
    expect(quoted.length).toBeGreaterThan(0);

    // Every quoted segment must be findable in the verdict character for
    // character, and must carry an attribution saying where it came from.
    const sources = [
      ...verdict.findings.flatMap((f) => [
        f.verbatim,
        ...(f.officialText ?? []).map((q) => q.text),
      ]),
      ...verdict.items.flatMap((i) =>
        i.resolved ? [i.indications ?? "", i.officialWarning ?? ""] : [],
      ),
    ].map((t) => t.replace(/\s/g, ""));

    for (const segment of quoted) {
      expect(segment.attribution).toBeTruthy();
      expect(sources.some((src) => src.includes(segment.text.replace(/\s/g, "")))).toBe(
        true,
      );
    }
  });

  it("tells the elder what a medicine is for, and never that he fell short", async () => {
    const verdict = fatherVerdict();
    const narration = await new DeterministicNarrator().narrate(verdict, "elder");
    const text = narration.segments.map((s) => s.text).join();
    expect(text).not.toMatch(/忘記|漏(吃|服)|沒(有)?吃/);
    expect(text).not.toMatch(/嗎\?|嗎？/); // never asks him to confirm anything
  });

  it("says nothing was checked rather than implying everything is fine", async () => {
    const verdict = buildVerdict(
      father,
      resolver.resolveAll([{ text: "阿姨推薦的魚油", source: "supplement" }]),
      ruleSets,
      classes,
    );
    const narration = await new DeterministicNarrator().narrate(verdict, "caregiver");
    expect(narration.segments.some((s) => s.kind === "coverage")).toBe(true);
  });
});

describe("the fallback must survive every shape of verdict", () => {
  // The review found this: a test named for both audiences only ever ran one
  // verdict shape, so the elder branch that skipped coverage disclosure was
  // never reached. These enumerate the shapes instead of assuming them.
  const shapes: [string, () => Verdict][] = [
    ["findings and an unidentified item", () => fatherVerdict()],
    [
      "nothing identifiable at all",
      () =>
        buildVerdict(
          father,
          resolver.resolveAll([
            { text: "阿姨推薦的魚油", source: "supplement" },
            { text: "巷口買的維他命", source: "supplement" },
          ]),
          ruleSets,
          classes,
        ),
    ],
    ["an empty submission", () => buildVerdict(father, resolver.resolveAll([]), ruleSets, classes)],
    [
      "everything identified and nothing to raise",
      () =>
        buildVerdict(
          { ...father, conditions: [] },
          resolver.resolveAll([{ text: paracetamolName(), source: "otc" }]),
          ruleSets,
          classes,
        ),
    ],
  ];

  for (const [label, make] of shapes) {
    for (const audience of ["caregiver", "elder"] as NarrationAudience[]) {
      it(`passes its own checks: ${label}, ${audience}`, async () => {
        const verdict = make();
        const outcome = await narrate(verdict, audience, null);
        // narrate() validates the fallback too, and reports rather than hides
        // a failure. Nothing here should ever produce one.
        expect(outcome.fallbackViolations).toBeUndefined();
        expect(validateNarration(outcome.narration, verdict)).toEqual({ ok: true });
      });
    }
  }
});

describe("quoting a source that looks like an instruction", () => {
  it("does not reject a criterion for containing a measurement", async () => {
    // STOPP E4 reads "NSAID's if eGFR < 50 ml/min/1.73m2". A faithful quote
    // contains "50 ml"; rejecting it would punish the narration for being
    // faithful. The dose check polices what we wrote, not what we quoted.
    const kidneys: VerdictSubject = {
      id: "subj-kidneys",
      displayName: "陳女士",
      ageYears: 84,
      conditions: ["ckd_egfr_under_50"],
    };
    const nsaid = registers.drugs.drugs.find(
      (d) => d.ingredients.length === 1 && d.ingredients[0].includes("IBUPROFEN"),
    )!;
    const verdict = buildVerdict(
      kidneys,
      resolver.resolveAll([{ text: nsaid.nameZh, source: "otc" }]),
      ruleSets,
      classes,
    );

    expect(verdict.findings.some((f) => f.ruleId === "STOPP-E4")).toBe(true);
    const outcome = await narrate(verdict, "caregiver", null);
    expect(outcome.fallbackViolations).toBeUndefined();
    expect(validateNarration(outcome.narration, verdict)).toEqual({ ok: true });
  });
});

describe("invention in fluent prose", () => {
  // A review found this open: only 【】-marked names and quoted segments were
  // checked, so ordinary explanation text was unchecked entirely. The fix is
  // to let the validator see the registers — knowledge the narrator is denied.
  it("rejects a medicine the registers know but this verdict does not contain", async () => {
    const known = buildKnownMedicineIndex({
      drugs: registers.drugs.drugs,
      healthFoods: registers.healthFoods.healthFoods,
    });
    // A real product name from the register, absent from this verdict, and
    // free of digits — a name carrying its own strength would trip the dose
    // check and obscure what this test is about.
    const absent = registers.drugs.drugs.find(
      (d) =>
        d.nameZh.length >= 4 &&
        !/[0-9０-９]/.test(d.nameZh) &&
        d.ingredients.some((i) => i.includes("ASPIRIN")),
    )!;

    const verdict = buildVerdict(
      { ...father, conditions: [] },
      resolver.resolveAll([{ text: paracetamolName(), source: "otc" }]),
      ruleSets,
      classes,
    );
    expect(verdict.findings).toHaveLength(0);

    const invented = {
      subjectId: verdict.subject.id,
      subjectName: "父親",
      producedBy: "claude" as const,
      segments: [
        {
          kind: "explained" as const,
          text: `父親好。您的${absent.nameZh}跟其他藥一起吃可能會造成出血,請先問藥師。`,
        },
      ],
    };

    // Without the index this passed — nothing looked at unmarked prose.
    expect(validateNarration(invented, verdict).ok).toBe(true);

    const guarded = validateNarration(invented, verdict, known);
    expect(guarded.ok).toBe(false);
    if (guarded.ok) return;
    expect(guarded.violations.map((v) => v.code)).toContain("unknown_medicine_named");
  });

  it("still accepts a narration naming only what it was given", async () => {
    const known = buildKnownMedicineIndex({
      drugs: registers.drugs.drugs,
      healthFoods: registers.healthFoods.healthFoods,
    });
    const verdict = fatherVerdict();
    const outcome = await narrate(verdict, "caregiver", null, known);
    expect(outcome.fallbackViolations).toBeUndefined();
    expect(validateNarration(outcome.narration, verdict, known)).toEqual({ ok: true });
  });
});

describe("what the checks reject", () => {
  it("a medicine that is not in the verdict", async () => {
    const verdict = fatherVerdict();
    const result = validateNarration(
      {
        subjectId: verdict.subject.id,
        subjectName: "父親",
        producedBy: "claude",
        segments: [{ kind: "explained", text: "父親的【阿斯匹靈】需要注意。" }],
      },
      verdict,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.code)).toContain("unknown_medicine_named");
  });

  it("a dose instruction", () => {
    const verdict = fatherVerdict();
    const result = validateNarration(
      {
        subjectId: verdict.subject.id,
        subjectName: "父親",
        producedBy: "claude",
        segments: [{ kind: "explained", text: "父親每天吃 2 顆就好。" }],
      },
      verdict,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.code)).toContain("dose_instruction");
  });

  it("telling someone to stop a medicine", () => {
    const verdict = fatherVerdict();
    const result = validateNarration(
      {
        subjectId: verdict.subject.id,
        subjectName: "父親",
        producedBy: "claude",
        segments: [{ kind: "explained", text: "父親應該先停藥,等回診再說。" }],
      },
      verdict,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.code)).toContain("stop_or_change_instruction");
  });

  it("asserting what the person did", () => {
    // Memory for one's own routine is reconstructive. A system that states
    // "you missed it yesterday" writes itself into that memory.
    const verdict = fatherVerdict();
    const result = validateNarration(
      {
        subjectId: verdict.subject.id,
        subjectName: "父親",
        producedBy: "claude",
        segments: [{ kind: "explained", text: "父親您昨天沒有吃降血壓的藥。" }],
      },
      verdict,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.code)).toContain("asserts_past_behaviour");
  });

  it("a quoted segment that has been reworded", () => {
    const verdict = fatherVerdict();
    const result = validateNarration(
      {
        subjectId: verdict.subject.id,
        subjectName: "父親",
        producedBy: "claude",
        segments: [
          { kind: "verified", text: "這個藥對肝不好,最好不要吃。", attribution: "警語" },
        ],
      },
      verdict,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.code)).toContain("verified_text_altered");
  });

  it("hiding that some items could not be identified", () => {
    const verdict = fatherVerdict();
    expect(verdict.coverage.itemsUnresolved).toBeGreaterThan(0);
    const result = validateNarration(
      {
        subjectId: verdict.subject.id,
        subjectName: "父親",
        producedBy: "claude",
        segments: [{ kind: "explained", text: "父親的用藥都核對過了,請找藥師確認。" }],
      },
      verdict,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.code)).toContain("coverage_not_disclosed");
  });

  it("findings raised with nowhere to take them", () => {
    const verdict = fatherVerdict();
    const result = validateNarration(
      {
        subjectId: verdict.subject.id,
        subjectName: "父親",
        producedBy: "claude",
        segments: [
          { kind: "explained", text: "父親的用藥有一些需要注意的地方。" },
          { kind: "coverage", text: "有 1 項無法辨識。" },
        ],
      },
      verdict,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.code)).toContain("missing_escalation");
  });

  it("not saying whose medicines these are", () => {
    const verdict = fatherVerdict();
    const result = validateNarration(
      {
        subjectId: verdict.subject.id,
        subjectName: "父親",
        producedBy: "claude",
        segments: [{ kind: "explained", text: "有一項需要請藥師確認。" }],
      },
      verdict,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.code)).toContain("subject_not_named");
  });
});

describe("falling back", () => {
  it("discards a failing narration and shows the one we can vouch for", async () => {
    const verdict = fatherVerdict();
    const bad = stubNarrator([{ kind: "explained", text: "父親每天吃 3 顆普拿疼就好。" }]);

    const outcome = await narrate(verdict, "caregiver", bad);

    expect(outcome.usedFallback).toBe(true);
    expect(outcome.narration.producedBy).toBe("deterministic");
    expect(outcome.rejected?.producedBy).toBe("claude");
    expect(outcome.rejected?.violations.length).toBeGreaterThan(0);
    // And what is shown passes the checks.
    expect(validateNarration(outcome.narration, verdict)).toEqual({ ok: true });
  });

  it("falls back when the narrator throws", async () => {
    const verdict = fatherVerdict();
    const broken: Narrator = {
      name: "claude",
      async narrate() {
        throw new Error("network");
      },
    };
    const outcome = await narrate(verdict, "caregiver", broken);
    expect(outcome.usedFallback).toBe(true);
    expect(validateNarration(outcome.narration, verdict)).toEqual({ ok: true });
  });

  it("keeps a narration that passes", async () => {
    const verdict = fatherVerdict();
    const good = await new DeterministicNarrator().narrate(verdict, "caregiver");
    const outcome = await narrate(verdict, "caregiver", stubNarrator(good.segments));
    expect(outcome.usedFallback).toBe(false);
    expect(outcome.narration.producedBy).toBe("claude");
  });

  it("works with no model configured at all", async () => {
    const verdict = fatherVerdict();
    const outcome = await narrate(verdict, "caregiver", null);
    expect(outcome.usedFallback).toBe(false);
    expect(outcome.narration.producedBy).toBe("deterministic");
  });
});
