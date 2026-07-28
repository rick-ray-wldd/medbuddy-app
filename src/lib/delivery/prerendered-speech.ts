import { createHash } from "node:crypto";

/**
 * Pre-rendered narration audio (demo mechanism until a server-side TTS — the
 * cloned caregiver voice — is wired).
 *
 * Audio files are synthesised OFFLINE from exact narration texts and stored
 * at `line-audio/pre-{sha256(text)[0..24]}-{durationMs}.m4a`. At reply time
 * the narration's own hash is looked up: speech is attached ONLY when the
 * hashes match, which guarantees byte-for-byte that the voice says exactly
 * what the text says — an explanation that arrives altered is worse than one
 * that arrives text-only. Any miss or failure degrades to text-only and
 * never blocks the reply.
 */

export const PRERENDERED_PREFIX = "line-audio/pre-";

export function narrationHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 24);
}

export type PrerenderedSpeech = {
  audio: Uint8Array;
  format: "m4a";
  durationMs: number;
};

export async function findPrerenderedSpeech(
  text: string,
): Promise<PrerenderedSpeech | undefined> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return undefined;
  try {
    const { list, get } = await import("@vercel/blob");
    const prefix = `${PRERENDERED_PREFIX}${narrationHash(text)}-`;
    const { blobs } = await list({ prefix, limit: 1 });
    const blob = blobs[0];
    if (!blob) return undefined;
    const match = blob.pathname.match(/-(\d+)\.m4a$/);
    if (!match) return undefined;
    const res = await get(blob.pathname, { access: "private" });
    if (!res || res.statusCode !== 200) return undefined;
    const audio = new Uint8Array(await new Response(res.stream).arrayBuffer());
    return { audio, format: "m4a", durationMs: Number(match[1]) };
  } catch (err) {
    console.error("[medbuddy] prerendered speech lookup failed — text-only", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return undefined;
  }
}
