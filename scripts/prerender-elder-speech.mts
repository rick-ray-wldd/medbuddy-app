/**
 * Pre-render the elder's LINE replies in the demo voice.
 *
 *   npm run dev                                  # in one terminal
 *   npm run prerender:speech -- --dry-run        # see what would be rendered
 *   FISH_AUDIO_API_KEY=… BLOB_READ_WRITE_TOKEN=… npm run prerender:speech
 *
 * When an older adult texts a medicine name, the reply is narration produced
 * by the rules, and speech is attached only when a pre-rendered file matches
 * that narration's hash. That match is the guarantee: the voice can only say
 * what the text says, because the file is keyed by the text.
 *
 * So this does not "generate audio for the bot". It asks the running app for
 * the exact narration an elder would receive — through /api/check, the same
 * path the bot walks — and renders those strings. If the narrator's wording
 * changes, the hashes stop matching and the bot falls back to text. That is
 * the correct failure, and re-running this is the fix.
 *
 * Nothing here composes clinical content.
 */

import { createHash } from "node:crypto";

const DRY_RUN = process.argv.includes("--dry-run");
const BASE = process.env.PRERENDER_BASE_URL ?? "http://localhost:3000";

const FISH_KEY = process.env.FISH_AUDIO_API_KEY?.trim();
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN?.trim();
const VOICE_ID =
  process.env.MEDBUDDY_DEMO_VOICE_ID?.trim() ?? "b340fd7c23504a1c9917bcb5284a968e";

/** Must stay in step with src/lib/delivery/prerendered-speech.ts. */
const PREFIX = "line-audio/pre-";
const MP3_BYTES_PER_MS = 16;

/**
 * What an older adult plausibly texts: real product names, and the colloquial
 * descriptions a family actually uses. The second kind is the point —
 * 「鄰居給的紅麴膠囊」 is how a supplement gets named out loud.
 */
const QUERIES = [
  "鄰居給的紅麴膠囊",
  "普拿疼膜衣錠500毫克",
  "使蒂諾斯膜衣錠10毫克",
  "阿姨推薦的魚油",
];

const SUBJECT_IDS = ["subj-father", "subj-mother", "subj-resident-a"];

function hash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 24);
}

async function elderNarration(subjectId: string, query: string): Promise<string> {
  const res = await fetch(`${BASE}/api/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subjectId,
      items: [{ text: query, source: "unknown" }],
      audience: "elder",
    }),
  });
  if (!res.ok) throw new Error(`/api/check responded ${res.status}`);
  const data = (await res.json()) as {
    narration: { segments: { text: string }[] };
  };
  // The bot joins with a newline; match it exactly or the hash will not.
  return data.narration.segments.map((s) => s.text).join("\n");
}

async function synthesise(text: string): Promise<Uint8Array> {
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FISH_KEY}`,
      "Content-Type": "application/json",
      model: "s2-pro",
    },
    body: JSON.stringify({
      text,
      format: "mp3",
      mp3_bitrate: 128,
      latency: "balanced",
      chunk_length: 200,
      reference_id: VOICE_ID,
      language: "zh",
    }),
  });
  if (!res.ok) throw new Error(`fish responded ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main() {
  console.log(`voice ${VOICE_ID}\nsource ${BASE}\n`);

  if (!DRY_RUN && (!FISH_KEY || !BLOB_TOKEN)) {
    console.error("FISH_AUDIO_API_KEY and BLOB_READ_WRITE_TOKEN are required");
    process.exit(1);
  }

  const seen = new Set<string>();

  for (const subjectId of SUBJECT_IDS) {
    for (const query of QUERIES) {
      const text = await elderNarration(subjectId, query);
      const key = hash(text);

      // Different people asking about the same medicine can produce the same
      // narration. Render it once.
      if (seen.has(key)) continue;
      seen.add(key);

      if (DRY_RUN) {
        console.log(`  ${key}  ${text.replace(/\n/g, " / ").slice(0, 76)}`);
        continue;
      }

      const audio = await synthesise(text);
      const durationMs = Math.round(audio.byteLength / MP3_BYTES_PER_MS);
      const pathname = `${PREFIX}${key}-${durationMs}.mp3`;

      const { put } = await import("@vercel/blob");
      await put(pathname, audio as unknown as Blob, {
        // Private: this is a medication explanation about a named person, and
        // the adapter serves it through a signed short-lived URL.
        access: "private",
        addRandomSuffix: false,
        contentType: "audio/mpeg",
      });
      console.log(`  ${(audio.byteLength / 1024).toFixed(0)}KB  ${pathname}`);
    }
  }

  console.log(
    DRY_RUN
      ? `\ndry run — ${seen.size} distinct narrations, nothing synthesised`
      : `\ndone — ${seen.size} rendered. A reply hashing to one of these now speaks.`,
  );
}

main().catch((e) => {
  console.error(`\n${e}\n\nIs \`npm run dev\` running?`);
  process.exit(1);
});
