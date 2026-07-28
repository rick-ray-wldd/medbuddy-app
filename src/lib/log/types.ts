/**
 * The longitudinal record.
 *
 * A single check answers "what is he taking". This answers "what happened" —
 * and that is the question a three-minute appointment actually needs, because
 * what a department added, what quietly stopped, and what nobody restarted
 * after discharge are invisible in any one snapshot.
 *
 * It is also what makes the web view and a LINE conversation the same product
 * rather than two: both read this.
 */

import type { GroundedItem } from "../grounding/types";
import type { Verdict } from "../verdict/types";

/** Recorded at the moment a cupboard was captured. */
export type RegimenSnapshot = {
  id: string;
  subjectId: string;
  capturedAt: string;
  capturedByCarerId: string;
  items: GroundedItem[];
  /** The verdict produced from these items, kept so a past check is explainable. */
  verdict: Verdict;
};

/**
 * What the family knows and the record does not.
 *
 * `reportedByCarerId` is required and there is deliberately no way to record an
 * observation as coming from the subject. The product never asks him to confirm
 * or deny anything, so a channel built on his admissions would collect silence.
 */
export type ObservationKind =
  | "symptom"
  | "self_medication"
  | "alcohol"
  | "missed_dose"
  | "other";

export type Observation = {
  id: string;
  subjectId: string;
  observedAt: string;
  kind: ObservationKind;
  /** As reported, in the carer's own words. Never rewritten. */
  note: string;
  reportedByCarerId: string;
};

/**
 * What changed between two snapshots.
 *
 * Computed rather than stored: it is a function of two snapshots, and storing
 * it would let it drift from them.
 */
export type RegimenChange = {
  since: string;
  until: string;
  added: { inputText: string; nameZh?: string }[];
  removed: { inputText: string; nameZh?: string }[];
  unchanged: number;
};

export type SubjectLog = {
  subjectId: string;
  snapshots: RegimenSnapshot[];
  observations: Observation[];
};

/**
 * Storage.
 *
 * An interface because the 48-hour build keeps everything in memory, and
 * because whatever replaces it — Postgres, a LINE-backed store — must not
 * change anything above it. Nothing here knows about medicine.
 */
export interface LogStore {
  appendSnapshot(snapshot: RegimenSnapshot): Promise<void>;
  appendObservation(observation: Observation): Promise<void>;
  read(subjectId: string): Promise<SubjectLog>;
}
