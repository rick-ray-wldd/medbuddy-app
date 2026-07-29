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

export class BlobScheduleStore implements ScheduleStore {
  private pathname(subjectId: string): string {
    return `${BLOB_PREFIX}${subjectId}.json`;
  }

  async get(subjectId: string): Promise<SubjectSchedule | null> {
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
    const { put } = await import("@vercel/blob");
    await put(this.pathname(schedule.subjectId), JSON.stringify(schedule), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
    });
  }

  async remove(subjectId: string): Promise<void> {
    const { del } = await import("@vercel/blob");
    await del(this.pathname(subjectId));
  }

  async list(): Promise<SubjectSchedule[]> {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_PREFIX });
    const schedules: SubjectSchedule[] = [];
    for (const blob of blobs) {
      const subjectId = blob.pathname
        .slice(BLOB_PREFIX.length)
        .replace(/\.json$/, "");
      const schedule = await this.get(subjectId);
      if (schedule) schedules.push(schedule);
    }
    return schedules;
  }
}
