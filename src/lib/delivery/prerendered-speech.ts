import { createHash } from "node:crypto";

/**
 * Pre-rendered narration audio (demo mechanism until a server-side TTS — the
 * cloned caregiver voice — is wired).
 *
 * Audio files are synthesised OFFLINE from exact narration texts and stored
 * at `line-audio/pre-{sha256(text)[0..24]}-{durationMs}.{m4a|mp3}`. At reply time
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
  /**
   * Both are accepted because the two renderers differ: an offline m4a batch,
   * and Fish, which returns 128 kbps mp3. LineDelivery accepts either and
   * refuses wav, so the format travels rather than being assumed.
   */
  format: "m4a" | "mp3";
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
    const match = blob.pathname.match(/-(\d+)\.(m4a|mp3)$/);
    if (!match) return undefined;
    const res = await get(blob.pathname, { access: "private" });
    if (!res || res.statusCode !== 200) return undefined;
    const audio = new Uint8Array(await new Response(res.stream).arrayBuffer());
    return {
      audio,
      format: match[2] as "m4a" | "mp3",
      durationMs: Number(match[1]),
    };
  } catch (err) {
    console.error("[medbuddy] prerendered speech lookup failed — text-only", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return undefined;
  }
}

/**
 * Find it, or make it and keep it.
 *
 * ## Why this exists
 *
 * Pre-rendering covers a fixed list of narrations produced offline by
 * `scripts/prerender-elder-speech.mts`. Anything outside that list arrived as
 * text — so a reply about a medicine nobody thought to pre-render was silent,
 * and the older adult who most needs it read nothing.
 *
 * The hash is what makes filling the gap safe. The file is keyed by the text
 * it speaks, so a cached clip can only ever say the sentence that produced it.
 * Synthesising on a miss and storing under the same key preserves that
 * exactly: the guarantee was never "somebody checked this clip", it was
 * "the key IS the text".
 *
 * ## The cost, stated
 *
 * The first request for a given sentence waits on Fish — measured at
 * 2.7–4.8 s for a reply-length paragraph. Every later request for the same
 * sentence is a Blob read. LINE retries a slow webhook, and the dedupe marks
 * an event id before the handler runs, so a retry is dropped rather than
 * delivered twice.
 *
 * Returns undefined rather than throwing on every failure path: speech is an
 * addition to a message that is already correct as text, and a reply that
 * arrives without audio beats one that does not arrive.
 */
export async function speechFor(
  text: string,
  deps: {
    synthesise?: (text: string) => Promise<Uint8Array | null>;
  } = {},
): Promise<PrerenderedSpeech | undefined> {
  const existing = await findPrerenderedSpeech(text);
  if (existing) return existing;

  if (!process.env.BLOB_READ_WRITE_TOKEN) return undefined;

  try {
    const audio = await (deps.synthesise ?? synthesiseWithDemoVoice)(text);
    if (!audio || audio.byteLength === 0) return undefined;

    // Same 128 kbps CBR assumption the offline renderer uses, so a clip
    // rendered either way carries the same duration in its name.
    const durationMs = Math.round(audio.byteLength / 16);
    const pathname = `${PRERENDERED_PREFIX}${narrationHash(text)}-${durationMs}.mp3`;

    const { put } = await import("@vercel/blob");
    await put(pathname, audio as unknown as Blob, {
      access: "private",
      addRandomSuffix: false,
      contentType: "audio/mpeg",
      // Two requests for the same new sentence race here; the bytes are the
      // same sentence either way, so overwriting makes the race harmless.
      allowOverwrite: true,
    });

    return { audio, format: "mp3", durationMs };
  } catch (err) {
    console.error("[medbuddy] speech synthesis failed — text only", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return undefined;
  }
}

async function synthesiseWithDemoVoice(text: string): Promise<Uint8Array | null> {
  const { defaultVoice } = await import("../voice/profiles");
  const profile = defaultVoice();
  if (!profile) return null;

  const { FishVoiceProvider } = await import("../voice/fish");
  const result = await new FishVoiceProvider().synthesise({
    text,
    language: "zh",
    profile,
  });
  return result.ok ? result.audio : null;
}
