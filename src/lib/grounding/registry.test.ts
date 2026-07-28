/**
 * Resolution against the real committed registers.
 *
 * resolve.test.ts pins the rules using a hand-built register small enough to
 * read. This file checks those rules survive contact with 23,000 real permits,
 * where names collide, strengths repeat, and a third of the file is products
 * nobody has heard of.
 *
 * It runs offline on a clean clone because the derived tables are committed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Resolver, type Registers } from "./resolve";

let resolver: Resolver;
let registers: Registers;

beforeAll(() => {
  const read = (f: string) =>
    JSON.parse(readFileSync(path.join(process.cwd(), "data", f), "utf8"));
  registers = { drugs: read("tfda-drugs.json"), healthFoods: read("tfda-health-foods.json") };
  resolver = new Resolver(registers);
});

describe("the committed registers", () => {
  it("carries provenance so a check can be traced to a source and a date", () => {
    const d = registers.drugs as unknown as Record<string, string>;
    expect(d.source).toContain("data.gov.tw");
    expect(d.licence).toContain("政府資料開放授權條款");
    expect(d.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("holds enough of the register to be worth calling grounded", () => {
    expect(registers.drugs.drugs.length).toBeGreaterThan(20_000);
    expect(registers.healthFoods.healthFoods.length).toBeGreaterThan(400);
  });

  it("excludes revoked permits and raw materials", () => {
    // Nothing that cannot reach a patient should be matchable.
    expect(registers.drugs.drugs.some((d) => d.dispensing === "not_dispensed")).toBe(false);
  });

  it("gives every kept medicine a name and a match key", () => {
    for (const d of registers.drugs.drugs) {
      expect(d.nameZh.length).toBeGreaterThan(0);
      expect(d.key.length).toBeGreaterThan(0);
    }
  });
});

describe("resolving against real data", () => {
  it("resolves a full product name to its ingredients", () => {
    const hits = registers.drugs.drugs.filter((d) => d.ingredients.includes("AMLODIPINE"));
    expect(hits.length).toBeGreaterThan(0);

    const r = resolver.resolveOne({ text: hits[0].nameZh, source: "prescription" });
    expect(r.resolved).toBe(true);
    if (!r.resolved) return;
    expect(r.ingredients).toContain("AMLODIPINE");
    expect(r.permit).toBe(hits[0].permit);
  });

  it("covers the ingredients the demo case depends on", () => {
    // The scenario this product was designed around: an older adult with
    // impaired liver function taking an NSAID out of the cupboard.
    const has = (ing: string) =>
      registers.drugs.drugs.some((d) => d.ingredients.some((i) => i.includes(ing)));
    expect(has("IBUPROFEN")).toBe(true);
    expect(has("DICLOFENAC")).toBe(true);
    expect(has("ACETAMINOPHEN")).toBe(true);
  });

  it("does not turn a longer medicine name into a shorter one", () => {
    // A review found these live: the reverse direction of substring matching
    // let a name that merely ends with a registered product become that
    // product. 理眠錠 is NITRAZEPAM, so 新理眠錠 fabricated a benzodiazepine
    // with a real permit and a verbatim STOPP criterion attached.
    const shortDrugs = registers.drugs.drugs.filter(
      (d) => d.nameZh.length >= 3 && d.nameZh.length <= 4 && d.ingredients.length > 0,
    );
    expect(shortDrugs.length).toBeGreaterThan(100);

    for (const d of shortDrugs.slice(0, 60)) {
      const invented = `新${d.nameZh}`;
      // Only meaningful when the invented name is not itself registered.
      if (registers.drugs.drugs.some((x) => x.nameZh === invented)) continue;
      const r = resolver.resolveOne({ text: invented, source: "prescription" });
      if (r.resolved) {
        expect(r.nameZh).not.toBe(d.nameZh);
      }
    }
  });

  it("still recognises a supplement described in the words a family uses", () => {
    // Reverse matching survives where it earns its keep: a supplement is
    // described from memory, the register is 464 products, and none of them
    // is a prescription medicine.
    const r = resolver.resolveOne({ text: "鄰居給的紅麴膠囊", source: "supplement" });
    expect(r.resolved).toBe(true);
    if (!r.resolved) return;
    expect(r.register).toBe("tfda_health_food");
  });

  it("refuses to name something that is in no register", () => {
    const r = resolver.resolveOne({ text: "鄰居送的不知名膠囊", source: "supplement" });
    expect(r.resolved).toBe(false);
    if (r.resolved) return;
    expect(r.reason).toBe("no_match");
  });

  it("never invents an ingredient for an unresolved item", () => {
    // The failure that matters: a plausible-looking match filled in for
    // something the register does not actually contain.
    const nonsense = ["完全不存在的東西", "abcdefgh", "阿姨推薦的那個"];
    for (const text of nonsense) {
      const r = resolver.resolveOne({ text });
      if (r.resolved) {
        // If it did resolve, it must be a real permit — not a fabrication.
        expect(registers.drugs.drugs.some((d) => d.permit === r.permit)).toBe(true);
      }
    }
  });

  it("returns one item per input for a realistic cupboard", () => {
    const cupboard = [
      { text: registers.drugs.drugs[0].nameZh, source: "prescription" as const },
      { text: "鄰居給的紅麴", source: "supplement" as const },
      { text: "阿姨推薦的魚油", source: "supplement" as const },
      { text: "", source: "unknown" as const },
    ];
    const result = resolver.resolveAll(cupboard);
    expect(result.items).toHaveLength(cupboard.length);
    expect(result.unresolvedCount).toBeGreaterThanOrEqual(3);
    expect(result.registryVersions.drugs).toBe(registers.drugs.retrievedAt);
  });

  it("resolves a whole list in a time a request can afford", () => {
    const inputs = registers.drugs.drugs
      .slice(0, 20)
      .map((d) => ({ text: d.nameZh, source: "prescription" as const }));
    const started = performance.now();
    resolver.resolveAll(inputs);
    // Exact-key hits are map lookups; this guards against a change that turns
    // the common path into a scan of 23,000 records.
    expect(performance.now() - started).toBeLessThan(500);
  });
});
