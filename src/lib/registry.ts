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
import {
  buildKnownMedicineIndex,
  type KnownMedicineIndex,
} from "./narration/validate";
import { InMemoryLogStore } from "./log/memory-store";
import { BlobLogStore } from "./log/blob-store";
import type { LogStore } from "./log/types";
import { BlobRoleStore, InMemoryRoleStore } from "./roles/stores";
import type { RoleStore } from "./roles/types";

function read<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), ...segments), "utf8")) as T;
}

type Registry = {
  resolver: Resolver;
  registers: Registers;
  ruleSets: RuleSet[];
  classes: DrugClasses;
  knownMedicines: KnownMedicineIndex;
  logStore: LogStore;
  roleStore: RoleStore;
};

/**
 * Held on globalThis rather than in a module-level variable.
 *
 * Next bundles route handlers and server components separately, so a
 * module-scoped singleton is instantiated more than once and each copy gets
 * its own store. Found by walking the flow end to end: two checks were
 * recorded through /api/check and the summary page reported no history at all.
 *
 * The registers being loaded twice would only have cost memory. The log being
 * two different logs is the kind of bug that makes a feature look built when
 * it is not.
 */
const GLOBAL_KEY = Symbol.for("medbuddy.registry");
type GlobalWithRegistry = typeof globalThis & { [GLOBAL_KEY]?: Registry };

export function getRegistry(): Registry {
  const g = globalThis as GlobalWithRegistry;
  const cached = g[GLOBAL_KEY];
  if (cached) return cached;

  const registers: Registers = {
    drugs: read("data", "tfda-drugs.json"),
    healthFoods: read("data", "tfda-health-foods.json"),
  };

  const built: Registry = {
    registers,
    resolver: new Resolver(registers),
    ruleSets: [
      read("config", "rules", "stopp-v3.json"),
      read("config", "rules", "tfda-health-food-warnings.json"),
    ],
    classes: read("config", "rules", "drug-classes.json"),
    // The validator is allowed to know what the narrator is not: this is how
    // it catches a medicine named in fluent prose that no rule ever saw.
    knownMedicines: buildKnownMedicineIndex({
      drugs: registers.drugs.drugs,
      healthFoods: registers.healthFoods.healthFoods,
    }),
    // Blob when configured, memory otherwise.
    //
    // The in-memory store is correct locally and wrong on Vercel: each
    // invocation is its own process, so a snapshot written by /api/check was
    // invisible to the summary page that reads it. That was found by walking
    // the deployed URL rather than the laptop, and it made a required
    // behaviour look built while being broken where reviewers would look.
    //
    // The line below is the whole cost of that change, which is what the
    // LogStore interface was for.
    logStore: process.env.BLOB_READ_WRITE_TOKEN
      ? new BlobLogStore()
      : new InMemoryLogStore(),
    // Same reasoning, and a sharper consequence: a binding that evaporates
    // between invocations would re-ask an older adult who he is — the one
    // question spec §1 promises to ask exactly once.
    roleStore: process.env.BLOB_READ_WRITE_TOKEN
      ? new BlobRoleStore()
      : new InMemoryRoleStore(),
  };

  g[GLOBAL_KEY] = built;
  return built;
}
