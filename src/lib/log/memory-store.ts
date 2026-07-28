/**
 * In-memory implementation of the log.
 *
 * Deliberate for a 48-hour build, and honest about what it is: a process
 * restart loses everything, and a serverless deployment may not even share a
 * process between requests. What matters is that everything above it is written
 * against `LogStore`, so replacing this with Postgres changes one file.
 *
 * Nothing here knows about medicine.
 */

import type {
  LogStore,
  Observation,
  RegimenSnapshot,
  SubjectLog,
} from "./types";

export class InMemoryLogStore implements LogStore {
  private readonly snapshots = new Map<string, RegimenSnapshot[]>();
  private readonly observations = new Map<string, Observation[]>();

  async appendSnapshot(snapshot: RegimenSnapshot): Promise<void> {
    append(this.snapshots, snapshot.subjectId, snapshot);
  }

  async appendObservation(observation: Observation): Promise<void> {
    append(this.observations, observation.subjectId, observation);
  }

  async read(subjectId: string): Promise<SubjectLog> {
    return {
      subjectId,
      // Copied out, and ordered here rather than relying on insertion order:
      // a caller sorting by time should not depend on how this stored them.
      snapshots: [...(this.snapshots.get(subjectId) ?? [])].sort(byTime("capturedAt")),
      observations: [...(this.observations.get(subjectId) ?? [])].sort(byTime("observedAt")),
    };
  }
}

function append<T>(map: Map<string, T[]>, key: string, value: T) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

function byTime<T, K extends keyof T>(field: K) {
  return (a: T, b: T) => String(a[field]).localeCompare(String(b[field]));
}
