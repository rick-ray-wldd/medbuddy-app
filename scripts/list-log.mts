/**
 * Read-only: the longitudinal record for one person.
 *
 * "Did that button actually record anything?" is a question the log answers
 * and guessing does not. Reads the same store the app reads.
 *
 * Usage: BLOB_READ_WRITE_TOKEN=… node scripts/list-log.mts [subjectId]
 */

import { list, get } from "@vercel/blob";

const subjectId = process.argv[2] ?? "subj-father";
const pathname = `medbuddy-log/${encodeURIComponent(subjectId)}.json`;

const { blobs } = await list({ prefix: "medbuddy-log/", limit: 100 });
if (blobs.length === 0) {
  console.log("  Blob 裡沒有任何 medbuddy-log/* — 還沒有任何紀錄。");
  process.exit(0);
}

console.log(`  現有紀錄檔: ${blobs.map((b) => b.pathname).join(", ")}\n`);

const found = blobs.find((b) => b.pathname === pathname);
if (!found) {
  console.log(`  ${subjectId} 沒有紀錄。`);
  process.exit(0);
}

const res = await get(pathname, { access: "private" });
if (!res || res.statusCode !== 200) {
  console.error("  讀不到。");
  process.exit(1);
}

const log = JSON.parse(await new Response(res.stream).text()) as {
  snapshots: { capturedAt: string; capturedByCarerId: string; items: unknown[] }[];
  observations: {
    observedAt: string;
    kind: string;
    note: string;
    reportedByCarerId: string;
  }[];
};

console.log(`  ── ${subjectId} ──\n`);
console.log(`  用藥快照 ${log.snapshots?.length ?? 0} 筆`);
for (const s of log.snapshots ?? []) {
  console.log(`    ${s.capturedAt}  ${s.items.length} 項  by ${s.capturedByCarerId}`);
}

console.log(`\n  觀察 ${log.observations?.length ?? 0} 筆`);
for (const o of log.observations ?? []) {
  // reportedByCarerId distinguishes what the family reported from what he
  // asked — they are different objects and only one is his to share.
  const who = o.reportedByCarerId === "elder-asked" ? "長輩提問" : o.reportedByCarerId;
  console.log(`    ${o.observedAt}  [${o.kind}]  ${o.note}`);
  console.log(`      來源: ${who}`);
}
