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
  async get(channelUserId: string): Promise<RoleBinding | null> {
    try {
      const { head, get } = await import("@vercel/blob");
      const pathname = pathFor(channelUserId);
      const exists = await head(pathname).catch(() => null);
      if (!exists) return null;

      const res = await get(pathname, { access: "private" });
      if (!res || res.statusCode !== 200) return null;
      const text = await new Response(res.stream).text();
      return JSON.parse(text) as RoleBinding;
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
