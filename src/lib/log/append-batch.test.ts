import { describe, expect, it } from "vitest";
import { InMemoryLogStore } from "./memory-store";
import type { LogStore, Observation, SubjectLog } from "./types";

function obs(i: number, note: string): Observation {
  return {
    id: `subj-father:2026-07-29T09:33:14.455Z:${i}`,
    subjectId: "subj-father",
    observedAt: "2026-07-29T09:33:14.455Z",
    kind: "other",
    note,
    reportedByCarerId: "carer-demo",
  };
}

/**
 * A store whose reads do not see the writes before them.
 *
 * This is not a hypothetical: Vercel Blob behaves this way, and it is how a
 * caregiver's paragraph of four observations came back as one. The log
 * reported `count: 4` and stored the last, because each append read a copy
 * from before the previous append and wrote it back.
 */
class StaleReadingStore implements LogStore {
  private committed: SubjectLog = {
    subjectId: "subj-father",
    snapshots: [],
    observations: [],
  };

  /**
   * What a read returns for the whole burst: the state as it was before any
   * of it. Modelled from the real failure rather than from the docs — four
   * observations went in and one came out, which means no read in that
   * request saw any write from the same request.
   */
  private readonly frozen: SubjectLog = {
    subjectId: "subj-father",
    snapshots: [],
    observations: [],
  };

  async read(): Promise<SubjectLog> {
    return { ...this.frozen, observations: [...this.frozen.observations] };
  }
  async appendSnapshot(): Promise<void> {}

  async appendObservation(observation: Observation): Promise<void> {
    await this.appendObservations([observation]);
  }

  async appendObservations(observations: Observation[]): Promise<void> {
    const log = await this.read();
    log.observations.push(...observations);
    this.committed = log;
  }

  /** What actually ended up stored. */
  stored(): Observation[] {
    return this.committed.observations;
  }
}

describe("one paragraph, several observations", () => {
  it("keeps every observation when the store reads its own writes", async () => {
    const store = new InMemoryLogStore();
    await store.appendObservations([obs(0, "腰痛"), obs(1, "喝酒"), obs(2, "忘記吃")]);

    const log = await store.read("subj-father");
    expect(log.observations.map((o) => o.note)).toEqual(["腰痛", "喝酒", "忘記吃"]);
  });

  it("keeps every observation even when reads are stale", async () => {
    // The regression this file exists for. Appending one at a time against
    // this store loses all but the last; one batched write cannot.
    const store = new StaleReadingStore();
    await store.appendObservations([obs(0, "腰痛"), obs(1, "喝酒"), obs(2, "忘記吃")]);

    expect(store.stored().map((o) => o.note)).toEqual(["腰痛", "喝酒", "忘記吃"]);
  });

  it("demonstrates what the per-observation loop did", async () => {
    // Kept as a test rather than a comment: this is the shape callers must
    // not use, and it is only wrong on a store that reads stale.
    const store = new StaleReadingStore();
    for (const o of [obs(0, "腰痛"), obs(1, "喝酒"), obs(2, "忘記吃")]) {
      await store.appendObservation(o);
    }

    expect(store.stored()).toHaveLength(1);
    expect(store.stored()[0].note).toBe("忘記吃");
  });

  it("writes nothing for an empty list", async () => {
    const store = new InMemoryLogStore();
    await store.appendObservations([]);
    expect((await store.read("subj-father")).observations).toEqual([]);
  });
});
