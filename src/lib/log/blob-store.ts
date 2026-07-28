/**
 * The log, persisted to Vercel Blob.
 *
 * The in-memory store is correct locally and wrong in production, and the way
 * it is wrong is the dangerous kind: each serverless invocation gets its own
 * process, so a check written by one request is invisible to the page that
 * reads it. The clinician summary — the output the whole product points at —
 * reported no history at all on the deployed URL while working perfectly on a
 * laptop.
 *
 * Blob rather than Postgres for two reasons. It is already configured here for
 * audio, so this adds no service and no credential. And the alternative to
 * hand was a production database belonging to a different product, holding
 * hundreds of real users — a submission repository must not carry a key that
 * reaches those.
 *
 * ## What this is not
 *
 * It is not a database. Two concurrent writers will clobber each other,
 * because a write is read-modify-write on a whole document. For one family
 * acting sequentially that is fine; for a facility carer it would not be, and
 * the honest fix there is Postgres. `LogStore` is the seam that makes that a
 * one-file change, which is the whole reason it exists.
 */

import type {
  LogStore,
  Observation,
  RegimenSnapshot,
  SubjectLog,
} from "./types";

const PREFIX = "medbuddy-log/";

function pathFor(subjectId: string): string {
  return `${PREFIX}${encodeURIComponent(subjectId)}.json`;
}

function empty(subjectId: string): SubjectLog {
  return { subjectId, snapshots: [], observations: [] };
}

export class BlobLogStore implements LogStore {
  async read(subjectId: string): Promise<SubjectLog> {
    try {
      const { head, get } = await import("@vercel/blob");
      const pathname = pathFor(subjectId);
      // head() first: a missing log is the normal state for a new person, not
      // an error, and get() on a missing key is noisier than asking.
      const exists = await head(pathname).catch(() => null);
      if (!exists) return empty(subjectId);

      const res = await get(pathname, { access: "private" });
      if (!res || res.statusCode !== 200) return empty(subjectId);
      const text = await new Response(res.stream).text();
      const parsed = JSON.parse(text) as SubjectLog;

      return {
        subjectId,
        // Ordered here rather than trusting how it was stored, matching the
        // in-memory store's contract.
        snapshots: [...(parsed.snapshots ?? [])].sort((a, b) =>
          a.capturedAt.localeCompare(b.capturedAt),
        ),
        observations: [...(parsed.observations ?? [])].sort((a, b) =>
          a.observedAt.localeCompare(b.observedAt),
        ),
      };
    } catch (err) {
      // A history we cannot read is not a history that is empty, and the
      // difference matters: the summary would render "first visit" and tell a
      // clinician something untrue. Fail loudly.
      console.error("[medbuddy] log read failed", {
        subjectId,
        reason: err instanceof Error ? err.message : "unknown",
      });
      throw err;
    }
  }

  async appendSnapshot(snapshot: RegimenSnapshot): Promise<void> {
    const log = await this.read(snapshot.subjectId);
    log.snapshots.push(snapshot);
    await this.write(log);
  }

  async appendObservation(observation: Observation): Promise<void> {
    const log = await this.read(observation.subjectId);
    log.observations.push(observation);
    await this.write(log);
  }

  private async write(log: SubjectLog): Promise<void> {
    const { put } = await import("@vercel/blob");
    await put(pathFor(log.subjectId), JSON.stringify(log), {
      // Private: this is medication and symptom history about a named person.
      access: "private",
      addRandomSuffix: false,
      contentType: "application/json",
      // Each write replaces the document, so caching a previous version would
      // hand a stale history to the next reader.
      cacheControlMaxAge: 0,
      allowOverwrite: true,
    });
  }
}
