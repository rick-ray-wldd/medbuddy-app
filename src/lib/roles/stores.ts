/**
 * Where a role binding lives.
 *
 * Same two implementations, and the same reason, as the log store: in-memory is
 * correct on a laptop and silently wrong on Vercel, where each invocation is
 * its own process. A binding that evaporates between requests would re-ask an
 * older adult who he is — the one question spec §1 promises to ask exactly once.
 *
 * One document per user rather than one map for everybody: a shared document is
 * read-modify-write, and two phones being set up in the same minute is the
 * normal case here, not an edge one. Per-user keys make that collision
 * impossible instead of unlikely.
 */

import type { RoleBinding, RoleStore } from "./types";

const PREFIX = "medbuddy-role/";

/** Held on globalThis so every bundle of this module shares one copy. */
const RECENT_KEY = Symbol.for("medbuddy.roleStore.recent");

function pathFor(channelUserId: string): string {
  return `${PREFIX}${encodeURIComponent(channelUserId)}.json`;
}

export class InMemoryRoleStore implements RoleStore {
  private readonly bindings = new Map<string, RoleBinding>();

  async get(channelUserId: string): Promise<RoleBinding | null> {
    return this.bindings.get(channelUserId) ?? null;
  }

  async put(binding: RoleBinding): Promise<void> {
    this.bindings.set(binding.channelUserId, binding);
  }
}

export class BlobRoleStore implements RoleStore {
  /**
   * ⚠️ Blob does not give read-your-writes, and this record needs it.
   *
   * Observed in production, 2026-07-29: a user bound `elder` at 05:36:40
   * pressed 「我是照顧者」 four seconds later. `bindRole` did not refuse — it
   * linked the caregiver menu, which it can only do if this read returned
   * something other than `elder`. No write happened on that path (the record's
   * `uploadedAt` never moved past 05:36:42), so the read had answered
   * `caregiver`: the value from *before* the elder write. That is precisely
   * the failure the terminal rule exists to prevent, and it leaves no trace in
   * the data it corrupts.
   *
   * Reproduced locally by `scripts/probe-role-store.mts` — but only when
   * **overwriting a path that already exists**. The first run of that probe
   * creates the blob and round-trips perfectly, which is why an earlier
   * attempt at this diagnosis cleared it wrongly. Overwrite is the whole
   * failure mode, and overwrite is what every rebind does.
   *
   * Reading through `list` instead was tried and is strictly worse: a freshly
   * written blob is not in `list` immediately either, so the read returns
   * `null` — failing **open**, which is the wrong direction.
   *
   * ## What the cache below does, and what it does not
   *
   * `put` records the binding in-process before returning; `get` trusts that
   * copy over Blob. Within one warm instance this makes read-your-writes
   * exact, which covers the case that actually broke: a person tapping twice
   * within seconds lands on the same instance.
   *
   * It does **not** make this correct. Two instances can still disagree, and
   * across a cold start the stale read returns. This narrows a window; it does
   * not close one.
   *
   * The real fix is that a consistency-critical record does not belong in
   * Blob — `blob-store.ts` says the same thing about the log, and the
   * `RoleStore` interface exists so that swapping in Postgres is one file.
   * That is the change to make, and it is not a change to make at 22:30 the
   * night before a deadline.
   */
  private static recent(): Map<string, RoleBinding> {
    const g = globalThis as typeof globalThis & {
      [RECENT_KEY]?: Map<string, RoleBinding>;
    };
    g[RECENT_KEY] ??= new Map();
    return g[RECENT_KEY];
  }

  async get(channelUserId: string): Promise<RoleBinding | null> {
    // Our own most recent write wins over anything Blob reports: it is the
    // one value we know is current.
    const remembered = BlobRoleStore.recent().get(channelUserId);
    if (remembered) return remembered;

    try {
      const { head, get } = await import("@vercel/blob");
      const pathname = pathFor(channelUserId);
      const exists = await head(pathname).catch(() => null);
      if (!exists) return null;

      const res = await get(pathname, { access: "private" });
      if (!res || res.statusCode !== 200) return null;
      const text = await new Response(res.stream).text();
      const binding = JSON.parse(text) as RoleBinding;

      // Instrumentation: ids and role only — never a note, never medication.
      console.log("[medbuddy] role read", {
        channelUserId,
        role: binding.role,
        boundAt: binding.boundAt,
        blobUploadedAt: exists.uploadedAt,
      });
      return binding;
    } catch (err) {
      // Unreadable is not unbound. Returning null here would show the role card
      // to someone already bound — and, worse, would let a later bind escape
      // the elder-is-terminal rule by finding no existing binding to refuse
      // against. Fail loudly instead.
      console.error("[medbuddy] role read failed", {
        channelUserId,
        reason: err instanceof Error ? err.message : "unknown",
      });
      throw err;
    }
  }

  async put(binding: RoleBinding): Promise<void> {
    // Remembered BEFORE the write returns: a caller that writes and
    // immediately reads must not be able to observe the older value.
    BlobRoleStore.recent().set(binding.channelUserId, binding);

    const { put } = await import("@vercel/blob");
    await put(pathFor(binding.channelUserId), JSON.stringify(binding), {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: 0,
      allowOverwrite: true,
    });
  }
}
