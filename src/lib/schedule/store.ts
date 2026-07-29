import type { SubjectSchedule } from "./types";

/**
 * Schedule persistence. Interface first so tests inject memory; production
 * uses the Blob store already in the stack (private, one JSON per subject —
 * no new dependency, same durability story as the rest of the demo).
 */
export interface ScheduleStore {
  get(subjectId: string): Promise<SubjectSchedule | null>;
  put(schedule: SubjectSchedule): Promise<void>;
  remove(subjectId: string): Promise<void>;
  list(): Promise<SubjectSchedule[]>;
}

export class InMemoryScheduleStore implements ScheduleStore {
  private readonly bySubject = new Map<string, SubjectSchedule>();

  async get(subjectId: string): Promise<SubjectSchedule | null> {
    return this.bySubject.get(subjectId) ?? null;
  }
  async put(schedule: SubjectSchedule): Promise<void> {
    this.bySubject.set(schedule.subjectId, schedule);
  }
  async remove(subjectId: string): Promise<void> {
    this.bySubject.delete(subjectId);
  }
  async list(): Promise<SubjectSchedule[]> {
    return [...this.bySubject.values()];
  }
}

const BLOB_PREFIX = "schedules/";
const RECENT_KEY = Symbol.for("medbuddy.schedule.recent");

export class BlobScheduleStore implements ScheduleStore {
  /**
   * ⚠️ Blob does not give read-your-writes — the same failure BlobRoleStore
   * documents (roles/stores.ts): overwrite a path, read it back seconds
   * later, get the old value. Observed here as: caregiver adds a slot, the
   * refreshed card says 「目前沒有設定提醒時段」 while the write is in fact
   * durable. Same mitigation: the most recent in-process write wins over
   * whatever Blob reports. Same honest limit: two instances can still
   * disagree; the real fix is a store with actual consistency, one file away
   * behind the ScheduleStore interface.
   */
  private static recent(): Map<string, SubjectSchedule | null> {
    const g = globalThis as typeof globalThis & {
      [RECENT_KEY]?: Map<string, SubjectSchedule | null>;
    };
    g[RECENT_KEY] ??= new Map();
    return g[RECENT_KEY];
  }

  private pathname(subjectId: string): string {
    return `${BLOB_PREFIX}${subjectId}.json`;
  }

  async get(subjectId: string): Promise<SubjectSchedule | null> {
    const recent = BlobScheduleStore.recent();
    if (recent.has(subjectId)) return recent.get(subjectId) ?? null;

    const { get } = await import("@vercel/blob");
    const res = await get(this.pathname(subjectId), { access: "private" });
    if (!res || res.statusCode !== 200) return null;
    try {
      const body = await new Response(res.stream).text();
      return JSON.parse(body) as SubjectSchedule;
    } catch {
      return null;
    }
  }

  async put(schedule: SubjectSchedule): Promise<void> {
    // In-process copy first: read-your-writes within a warm instance.
    BlobScheduleStore.recent().set(schedule.subjectId, schedule);
    const { put } = await import("@vercel/blob");
    await put(this.pathname(schedule.subjectId), JSON.stringify(schedule), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
    });
  }

  async remove(subjectId: string): Promise<void> {
    BlobScheduleStore.recent().set(subjectId, null);
    const { del } = await import("@vercel/blob");
    await del(this.pathname(subjectId));
  }

  async list(): Promise<SubjectSchedule[]> {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_PREFIX });
    const recent = BlobScheduleStore.recent();
    const bySubject = new Map<string, SubjectSchedule>();
    for (const blob of blobs) {
      const subjectId = blob.pathname
        .slice(BLOB_PREFIX.length)
        .replace(/\.json$/, "");
      // recent-write overlay applies inside get()
      const schedule = await this.get(subjectId);
      if (schedule) bySubject.set(subjectId, schedule);
    }
    // A schedule written moments ago may not appear in list yet at all.
    for (const [subjectId, schedule] of recent) {
      if (schedule) bySubject.set(subjectId, schedule);
      else bySubject.delete(subjectId);
    }
    return [...bySubject.values()];
  }
}
