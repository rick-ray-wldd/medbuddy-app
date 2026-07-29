/**
 * Seed a medication snapshot that carries intake instructions.
 *
 * Bag OCR reads 「飯後」 and 「1 粒」 off a photograph, but the confirmed write
 * into a snapshot is not built yet — the contract makes human review
 * unconditional and there is no confirmation screen. So the demo needs a
 * snapshot in the shape OCR will produce, and this writes one.
 *
 * The two products are real TFDA-registered names taken from actual bags, and
 * the intake lines are what those bags print. Nothing here is invented beyond
 * putting them in the record a confirmation step would have.
 *
 * DESTRUCTIVE for `subj-father`'s snapshots. Seeded fictional person.
 *
 * Usage: BLOB_READ_WRITE_TOKEN=… node scripts/seed-demo-snapshot.mts --apply
 */

import type { SubjectLog } from "../src/lib/log/types.ts";

const SUBJECT = "subj-father";
const AT = "2026-07-28T14:10:00.000Z";
const BASE = process.env.MEDBUDDY_BASE_URL ?? "https://medbuddy-app.vercel.app";

const ITEMS = [
  { text: "克他服寧25公絲糖衣錠", source: "prescription" as const },
  { text: "克流感膠囊75毫克", source: "prescription" as const },
  { text: "紅麴膠囊", source: "supplement" as const },
];

const INTAKE = [
  { name: "克他服寧25公絲糖衣錠", mealRelation: "飯後", dose: "1 粒", printedOrder: 1 },
  { name: "克流感膠囊75毫克", mealRelation: "飯後", dose: "1 粒", printedOrder: 2 },
];

if (!process.argv.includes("--apply")) {
  console.log("  會建立一筆快照:");
  for (const i of ITEMS) console.log(`    ${i.text} (${i.source})`);
  console.log("  服用方式(藥袋原文):");
  for (const i of INTAKE) console.log(`    ${i.name} — ${i.mealRelation} ${i.dose}`);
  console.log("\n  加 --apply 才會執行。");
  process.exit(0);
}

// The verdict comes from the real pipeline rather than being written here: a
// hand-made verdict would be exactly the fabrication this repository refuses.
const res = await fetch(`${BASE}/api/check`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ subjectId: SUBJECT, audience: "caregiver", items: ITEMS }),
});
if (!res.ok) throw new Error(`/api/check responded ${res.status}`);
const { verdict } = (await res.json()) as { verdict: unknown };

const { list, get, put } = await import("@vercel/blob");
const pathname = `medbuddy-log/${encodeURIComponent(SUBJECT)}.json`;
const { blobs } = await list({ prefix: pathname, limit: 1 });

let observations: SubjectLog["observations"] = [];
if (blobs[0]) {
  const r = await get(blobs[0].pathname, { access: "private" }).catch(() => null);
  if (r && r.statusCode === 200) {
    observations = (JSON.parse(await new Response(r.stream).text()) as SubjectLog)
      .observations;
  }
}

await put(
  pathname,
  JSON.stringify({
    subjectId: SUBJECT,
    observations,
    snapshots: [
      {
        id: `${SUBJECT}:${AT}`,
        subjectId: SUBJECT,
        capturedAt: AT,
        capturedByCarerId: "carer-demo",
        items: (verdict as { items: unknown[] }).items,
        verdict,
        intake: INTAKE,
      },
    ],
  }),
  {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
    allowOverwrite: true,
  },
);

console.log(`  ✅ 已寫入 1 筆快照(含服用方式),保留 ${observations.length} 筆觀察。`);
