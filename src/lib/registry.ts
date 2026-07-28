/**
 * Server-side loading of the committed registers and rule sets.
 *
 * Read once and held for the life of the process. These files are static and
 * version-controlled; re-reading nine megabytes per request would be the
 * easiest performance mistake available here.
 */

import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Resolver, type Registers } from "./grounding/resolve";
import type { DrugClasses, RuleSet } from "./rules/types";

function read<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), ...segments), "utf8")) as T;
}

let cached: {
  resolver: Resolver;
  registers: Registers;
  ruleSets: RuleSet[];
  classes: DrugClasses;
} | null = null;

export function getRegistry() {
  if (cached) return cached;

  const registers: Registers = {
    drugs: read("data", "tfda-drugs.json"),
    healthFoods: read("data", "tfda-health-foods.json"),
  };

  cached = {
    registers,
    resolver: new Resolver(registers),
    ruleSets: [
      read("config", "rules", "stopp-v3.json"),
      read("config", "rules", "tfda-health-food-warnings.json"),
    ],
    classes: read("config", "rules", "drug-classes.json"),
  };

  return cached;
}
