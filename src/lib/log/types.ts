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
import type { IntakeDetail } from "../delivery/reminder-framing";

/** Recorded at the moment a cupboard was captured. */
export type RegimenSnapshot = {
  id: string;
  subjectId: string;
  capturedAt: string;
  capturedByCarerId: string;
  items: GroundedItem[];
  /** The verdict produced from these items, kept so a past check is explainable. */
  verdict: Verdict;
  /**
   * How the bag said to take each item, when a bag was read.
   *
   * Optional because most snapshots come from a typed list, which carries no
   * instructions. Written by medication-bag OCR after a caregiver confirms —
   * never derived, never defaulted. The field being absent and the field being
   * empty mean the same thing here: the bag did not say.
   */
  intake?: IntakeDetail[];
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
  /**
   * Append several observations as ONE write.
   *
   * Not a convenience wrapper. One paragraph from a caregiver segments into
   * several observations, and appending them one at a time is a sequence of
   * read-modify-writes over the whole document — which silently loses all but
   * the last when the store has no read-your-writes guarantee. It did:
   * 「有吃止痛藥」 arrived as four observations, the log recorded
   * `count: 4`, and one survived.
   *
   * Every caller that has more than one observation in hand must use this.
   */
  appendObservations(observations: Observation[]): Promise<void>;
  read(subjectId: string): Promise<SubjectLog>;
}
