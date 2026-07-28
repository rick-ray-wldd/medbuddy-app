import { describe, expect, it } from "vitest";
import type { GroundedItem } from "../grounding/types";
import { changeSinceLast, diffSnapshots } from "./diff";
import { InMemoryLogStore } from "./memory-store";
import type { RegimenSnapshot } from "./types";
import type { Verdict } from "../verdict/types";

const emptyVerdict = {
  subject: { id: "s1", displayName: "父親", conditions: [] },
  items: [],
  findings: [],
  coverage: { itemsSubmitted: 0, itemsResolved: 0, itemsUnresolved: 0, nothingChecked: true },
  provenance: {
    registers: { drugs: "2026-07-27", healthFoods: "2026-07-27" },
    ruleSets: [],
    skippedRuleSets: [],
  },
} satisfies Verdict;

function resolved(permit: string, nameZh: string, inputText = nameZh): GroundedItem {
  return {
    resolved: true,
    inputText,
    source: "prescription",
    register: "tfda_drug",
    permit,
    nameZh,
    ingredients: ["X"],
    matchedBy: "exact_key",
  };
}

function unresolved(inputText: string): GroundedItem {
  return { resolved: false, inputText, source: "supplement", reason: "no_match" };
}

function snapshot(at: string, items: GroundedItem[]): RegimenSnapshot {
  return {
    id: `snap-${at}`,
    subjectId: "s1",
    capturedAt: at,
    capturedByCarerId: "carer-1",
    items,
    verdict: { ...emptyVerdict, items },
  };
}

describe("what changed between two captures", () => {
  it("reports what a department added", () => {
    const change = diffSnapshots(
      snapshot("2026-06-01", [resolved("p1", "甲錠")]),
      snapshot("2026-07-01", [resolved("p1", "甲錠"), resolved("p2", "乙錠")]),
    );
    expect(change.added.map((i) => i.nameZh)).toEqual(["乙錠"]);
    expect(change.removed).toEqual([]);
    expect(change.unchanged).toBe(1);
  });

  it("reports what quietly stopped", () => {
    // The one nobody records: it is not in the new bag and no note says why.
    const change = diffSnapshots(
      snapshot("2026-06-01", [resolved("p1", "甲錠"), resolved("p2", "乙錠")]),
      snapshot("2026-07-01", [resolved("p1", "甲錠")]),
    );
    expect(change.removed.map((i) => i.nameZh)).toEqual(["乙錠"]);
  });

  it("identifies a medicine by its permit, so a different spelling is not a change", () => {
    const change = diffSnapshots(
      snapshot("2026-06-01", [resolved("p1", "甲錠", "甲錠 5mg")]),
      snapshot("2026-07-01", [resolved("p1", "甲錠", "甲錠５毫克")]),
    );
    expect(change.added).toEqual([]);
    expect(change.removed).toEqual([]);
    expect(change.unchanged).toBe(1);
  });

  it("tracks an unidentified item by what the person wrote", () => {
    // We cannot say two unidentified things are the same, so we do not.
    const change = diffSnapshots(
      snapshot("2026-06-01", [unresolved("鄰居給的膠囊")]),
      snapshot("2026-07-01", [unresolved("鄰居給的膠囊"), unresolved("阿姨推薦的魚油")]),
    );
    expect(change.added.map((i) => i.inputText)).toEqual(["阿姨推薦的魚油"]);
    expect(change.unchanged).toBe(1);
  });
});

describe("the first time we looked", () => {
  it("returns null rather than an empty change", () => {
    // "Nothing changed" and "there is nothing to compare against" are
    // different statements, and rendering the second as the first would tell a
    // clinician something untrue.
    expect(changeSinceLast([])).toBeNull();
    expect(changeSinceLast([snapshot("2026-06-01", [resolved("p1", "甲錠")])])).toBeNull();
  });

  it("compares the two most recent, whatever order they arrived in", () => {
    const change = changeSinceLast([
      snapshot("2026-07-01", [resolved("p1", "甲錠"), resolved("p2", "乙錠")]),
      snapshot("2026-05-01", [resolved("p9", "舊錠")]),
      snapshot("2026-06-01", [resolved("p1", "甲錠")]),
    ]);
    expect(change).not.toBeNull();
    expect(change!.since).toBe("2026-06-01");
    expect(change!.until).toBe("2026-07-01");
    expect(change!.added.map((i) => i.nameZh)).toEqual(["乙錠"]);
  });
});

describe("the store", () => {
  it("keeps each person's record separate", async () => {
    // A carer may hold twelve residents; one person's snapshot must never
    // appear in another's log.
    const store = new InMemoryLogStore();
    await store.appendSnapshot(snapshot("2026-06-01", [resolved("p1", "甲錠")]));
    await store.appendSnapshot({
      ...snapshot("2026-06-01", [resolved("p2", "乙錠")]),
      id: "other",
      subjectId: "s2",
    });

    expect((await store.read("s1")).snapshots).toHaveLength(1);
    expect((await store.read("s2")).snapshots).toHaveLength(1);
    expect((await store.read("s2")).snapshots[0].items[0]).toMatchObject({ nameZh: "乙錠" });
  });

  it("returns snapshots in time order regardless of how they were appended", async () => {
    const store = new InMemoryLogStore();
    await store.appendSnapshot(snapshot("2026-07-01", []));
    await store.appendSnapshot(snapshot("2026-05-01", []));
    const log = await store.read("s1");
    expect(log.snapshots.map((s) => s.capturedAt)).toEqual(["2026-05-01", "2026-07-01"]);
  });

  it("records who reported an observation, and offers no way to attribute it to the subject", async () => {
    const store = new InMemoryLogStore();
    await store.appendObservation({
      id: "o1",
      subjectId: "s1",
      observedAt: "2026-07-02T21:00:00+08:00",
      kind: "self_medication",
      note: "晚上腰痛,自己拿了櫃子裡的止痛藥",
      reportedByCarerId: "carer-1",
    });
    const log = await store.read("s1");
    expect(log.observations[0].reportedByCarerId).toBe("carer-1");
    // The type has no field for a subject-reported observation. This asserts
    // the shape rather than a value: the product never asks him to admit
    // anything, so there is nowhere to put such an answer.
    expect(Object.keys(log.observations[0])).not.toContain("reportedBySubject");
  });

  it("returns an empty log for someone with no history, rather than failing", async () => {
    const log = await new InMemoryLogStore().read("nobody");
    expect(log).toEqual({ subjectId: "nobody", snapshots: [], observations: [] });
  });
});
