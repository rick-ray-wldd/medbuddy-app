/**
 * Match what a family typed or photographed against the TFDA registers.
 *
 * The design constraint that shapes this file: **not matching is a result, not
 * a failure.** A cupboard in a Taiwanese home holds prescriptions, things
 * bought over the counter, leftovers from earlier courses, and supplements
 * that are in no register at all. A resolver that quietly drops what it cannot
 * name would report a clean list and hide exactly the items that matter.
 *
 * So every input produces an item, and unresolved ones are counted and carried
 * forward.
 */

import {
  normalizeProductName,
  type DispensingClass,
} from "./normalize";
import type {
  GroundedItem,
  GroundingResult,
  ItemSource,
  ResolvedItem,
  UnresolvedItem,
} from "./types";

export type DrugRecord = {
  permit: string;
  nameZh: string;
  nameEn?: string;
  key: string;
  ingredients: string[];
  indications?: string;
  form?: string;
  dispensing: DispensingClass;
};

export type HealthFoodRecord = {
  permit: string;
  nameZh: string;
  key: string;
  functionalIngredients?: string;
  claim?: string;
  warning?: string;
  precautions?: string;
};

export type Registers = {
  drugs: { retrievedAt: string; drugs: DrugRecord[] };
  healthFoods: { retrievedAt: string; healthFoods: HealthFoodRecord[] };
};

export type RawInput = { text: string; source?: ItemSource };

/**
 * How many candidates we are willing to call a match.
 *
 * A pharmacy bag prints one product; if a fragment matches several distinct
 * permits we do not pick one. Guessing between 「普拿疼」 and 「普拿疼伏冒」 is
 * how a grounding layer produces a confident wrong answer, which is worse than
 * an admitted unknown.
 */
const MAX_CANDIDATES = 1;

/** Below this length a "contains" match means almost nothing. */
const MIN_SUBSTRING_LENGTH = 3;

export class Resolver {
  private readonly drugByKey = new Map<string, DrugRecord[]>();
  private readonly foodByKey = new Map<string, HealthFoodRecord[]>();
  // Declared and assigned rather than written as a constructor parameter
  // property: Node's strip-only TypeScript mode does not support those, and
  // scripts here run under plain `node`.
  private readonly registers: Registers;

  constructor(registers: Registers) {
    this.registers = registers;
    for (const d of registers.drugs.drugs) push(this.drugByKey, d.key, d);
    for (const f of registers.healthFoods.healthFoods) push(this.foodByKey, f.key, f);
  }

  resolveAll(inputs: RawInput[]): GroundingResult {
    const items = inputs.map((i) => this.resolveOne(i));
    return {
      items,
      unresolvedCount: items.filter((i) => !i.resolved).length,
      registryVersions: {
        drugs: this.registers.drugs.retrievedAt,
        healthFoods: this.registers.healthFoods.retrievedAt,
      },
    };
  }

  resolveOne(input: RawInput): GroundedItem {
    const inputText = input.text.trim();
    const source: ItemSource = input.source ?? "unknown";
    const key = normalizeProductName(inputText);

    if (key.length === 0) {
      return unresolved(inputText, source, "no_match");
    }

    // 1. Exact key. A bag reproduced faithfully lands here.
    const exactDrug = this.drugByKey.get(key);
    if (exactDrug) return this.fromDrugs(exactDrug, inputText, source, "exact_key");

    const exactFood = this.foodByKey.get(key);
    if (exactFood) return this.fromFoods(exactFood, inputText, source, "exact_key");

    // 2. Substring, only when the fragment is long enough to mean something.
    //    Handles a bag transcribed without its strength, or a bottle described
    //    by the part of the name someone remembers.
    if (key.length >= MIN_SUBSTRING_LENGTH) {
      const drugHits = this.searchContains(this.drugByKey, key);
      if (drugHits.length > 0) {
        return this.fromDrugs(drugHits, inputText, source, "contains");
      }
      const foodHits = this.searchContains(this.foodByKey, key);
      if (foodHits.length > 0) {
        return this.fromFoods(foodHits, inputText, source, "contains");
      }
    }

    return unresolved(inputText, source, "no_match");
  }

  private searchContains<T extends { key: string }>(
    index: Map<string, T[]>,
    key: string,
  ): T[] {
    const hits: T[] = [];
    for (const [candidateKey, records] of index) {
      if (candidateKey.includes(key) || key.includes(candidateKey)) {
        hits.push(...records);
        // Stop early: past the threshold the answer is "ambiguous" regardless
        // of how many more there are, and the registers are large.
        if (distinctPermits(hits) > MAX_CANDIDATES) break;
      }
    }
    return hits;
  }

  private fromDrugs(
    hits: DrugRecord[],
    inputText: string,
    source: ItemSource,
    matchedBy: ResolvedItem["matchedBy"],
  ): GroundedItem {
    if (distinctPermits(hits) > MAX_CANDIDATES) {
      return {
        resolved: false,
        inputText,
        source,
        reason: "ambiguous",
        candidates: hits.slice(0, 5).map((h) => ({ permit: h.permit, nameZh: h.nameZh })),
      };
    }
    const d = hits[0];
    // Named but not composed. We know what it is called and cannot say what is
    // in it, so no rule can be evaluated against it — that is unresolved, and
    // saying so is the honest report.
    if (d.ingredients.length === 0) {
      return {
        resolved: false,
        inputText,
        source,
        reason: "matched_without_ingredients",
        candidates: [{ permit: d.permit, nameZh: d.nameZh }],
      };
    }
    return {
      resolved: true,
      inputText,
      source,
      register: "tfda_drug",
      permit: d.permit,
      nameZh: d.nameZh,
      nameEn: d.nameEn,
      ingredients: d.ingredients,
      indications: d.indications,
      form: d.form,
      dispensing: d.dispensing,
      matchedBy,
    };
  }

  private fromFoods(
    hits: HealthFoodRecord[],
    inputText: string,
    source: ItemSource,
    matchedBy: ResolvedItem["matchedBy"],
  ): GroundedItem {
    if (distinctPermits(hits) > MAX_CANDIDATES) {
      return {
        resolved: false,
        inputText,
        source,
        reason: "ambiguous",
        candidates: hits.slice(0, 5).map((h) => ({ permit: h.permit, nameZh: h.nameZh })),
      };
    }
    const f = hits[0];
    return {
      resolved: true,
      inputText,
      source,
      register: "tfda_health_food",
      permit: f.permit,
      nameZh: f.nameZh,
      // A health food's 保健功效相關成分 is prose, not a parsed ingredient
      // list, so it is offered as one string rather than pretending to a
      // precision the register does not provide.
      ingredients: f.functionalIngredients ? [f.functionalIngredients] : [],
      indications: f.claim,
      officialWarning: f.warning,
      officialPrecautions: f.precautions,
      matchedBy,
    };
  }
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

function distinctPermits(records: { permit: string }[]): number {
  return new Set(records.map((r) => r.permit)).size;
}

function unresolved(
  inputText: string,
  source: ItemSource,
  reason: UnresolvedItem["reason"],
): UnresolvedItem {
  return { resolved: false, inputText, source, reason };
}
