/**
 * §5 idempotency — LINE retries on non-2xx. A duplicate `providerMessageId`
 * must not produce a duplicate downstream call.
 *
 * ⚠️ TODO(production): this is per-process memory. On serverless (Vercel) each
 * instance keeps its own set, so dedupe is best-effort across instances.
 * Acceptable for the hackathon — say so in the README — but before real launch
 * move to shared storage (KV / DB).
 */
export class ProviderMessageDedupe {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];

  constructor(private readonly maxEntries = 2000) {}

  /** Returns true exactly once per id (the first sighting). */
  markIfNew(providerMessageId: string): boolean {
    if (this.seen.has(providerMessageId)) return false;
    this.seen.add(providerMessageId);
    this.order.push(providerMessageId);
    if (this.order.length > this.maxEntries) {
      const evicted = this.order.shift();
      if (evicted !== undefined) this.seen.delete(evicted);
    }
    return true;
  }
}
