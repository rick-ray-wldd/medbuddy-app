/**
 * Read-only: what pre-rendered narration audio exists in Blob.
 *
 * Speech attaches to a reply only when the narration's own sha256 matches a
 * stored file, so "why was there no voice" is answered by this list rather
 * than by guessing.
 *
 * Usage: BLOB_READ_WRITE_TOKEN=… node scripts/list-speech.mts
 */

import { list } from "@vercel/blob";
import { PRERENDERED_PREFIX } from "../src/lib/delivery/prerendered-speech.ts";

const { blobs } = await list({ prefix: PRERENDERED_PREFIX, limit: 100 });

if (blobs.length === 0) {
  console.log(`  Blob 裡沒有任何 ${PRERENDERED_PREFIX}* 檔案 — 所有回覆都會是純文字。`);
} else {
  console.log(`  ${blobs.length} 個預先產生的語音檔:`);
  for (const b of blobs) {
    console.log(`    ${b.pathname}  (${(b.size / 1024).toFixed(0)} KB)`);
  }
}
