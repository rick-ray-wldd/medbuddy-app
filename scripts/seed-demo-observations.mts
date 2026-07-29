/**
 * Write the demo subject's observation log to an exact set.
 *
 * Not read-modify-write. Every attempt to curate this log by reading it,
 * filtering, and writing it back lost the race against Blob's stale reads —
 * twice in a row, in opposite directions. A demo sheet needs a known state,
 * and the only reliable way to reach one here is to state it.
 *
 * The notes are the ones Ray typed while testing, kept verbatim: the sheet is
 * meant to show what a family actually writes, and the four categories are the
 * four things his father's appointment turned on.
 *
 * DESTRUCTIVE. `subj-father` is a seeded fictional person; do not point this
 * at anything else.
 *
 * Usage: BLOB_READ_WRITE_TOKEN=… node scripts/seed-demo-observations.mts --apply
 */

import type { Observation, SubjectLog } from "../src/lib/log/types.ts";

const SUBJECT = "subj-father";
const AT = "2026-07-28T14:20:00.000Z";

const OBSERVATIONS: Observation[] = [
  ["symptom", "他這兩週晚上腰痛睡不著"],
  ["self_medication", "自己拿櫃子裡的止痛藥吃,大概三四次"],
  ["alcohol", "最近也比較常喝酒"],
  ["missed_dose", "上禮拜有一天早上的血壓藥忘記吃"],
].map(([kind, note], i) => ({
  id: `${SUBJECT}:${AT}:${i}`,
  subjectId: SUBJECT,
  observedAt: AT,
  kind: kind as Observation["kind"],
  note,
  reportedByCarerId: "carer-demo",
}));

if (!process.argv.includes("--apply")) {
  console.log("  會寫入:");
  for (const o of OBSERVATIONS) console.log(`    [${o.kind}] ${o.note}`);
  console.log("\n  加 --apply 才會執行(會覆蓋現有觀察紀錄)。");
  process.exit(0);
}

const { list, get, put } = await import("@vercel/blob");
const pathname = `medbuddy-log/${encodeURIComponent(SUBJECT)}.json`;

// Snapshots are kept — they are what 我的藥 reads, and they were produced by
// the real pipeline rather than typed.
const { blobs } = await list({ prefix: pathname, limit: 1 });
let snapshots: SubjectLog["snapshots"] = [];
if (blobs[0]) {
  const res = await get(blobs[0].url, { access: "private" }).catch(() => null);
  if (res && res.statusCode === 200) {
    snapshots = (JSON.parse(await new Response(res.stream).text()) as SubjectLog).snapshots;
  }
}

await put(
  pathname,
  JSON.stringify({ subjectId: SUBJECT, snapshots, observations: OBSERVATIONS }),
  {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
    allowOverwrite: true,
  },
);

console.log(`  ✅ 觀察紀錄已設為 ${OBSERVATIONS.length} 筆,保留 ${snapshots.length} 筆用藥快照。`);
