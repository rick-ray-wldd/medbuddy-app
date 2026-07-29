/**
 * Does a role binding survive a write and come back as itself?
 *
 * A binding that reads back stale is the "wrong person" error class: the same
 * sentence from an elder and from his daughter mean different things, and the
 * store is the only thing that tells them apart. If it can answer differently
 * at two moments, both answers are worthless.
 *
 * Writes to a probe key, never to a real user's.
 *
 * Usage: BLOB_READ_WRITE_TOKEN=… node scripts/probe-role-store.mts
 */

import { BlobRoleStore } from "../src/lib/roles/stores.ts";
import { del, list } from "@vercel/blob";

const store = new BlobRoleStore();
const USER = "Uprobe-role-store-do-not-use";

async function readBack(label: string) {
  const got = await store.get(USER);
  console.log(`    ${label}: ${got ? `${got.role} @ ${got.boundAt}` : "null"}`);
  return got;
}

console.log("  1. 起始狀態");
await readBack("read");

console.log("\n  2. 寫入 caregiver,立刻讀");
await store.put({
  channelUserId: USER,
  role: "caregiver",
  subjectId: "subj-father",
  boundAt: "2026-01-01T00:00:00.000Z",
});
const first = await readBack("read");

console.log("\n  3. 覆寫成 elder,立刻讀");
await store.put({
  channelUserId: USER,
  role: "elder",
  subjectId: "subj-father",
  boundAt: "2026-01-02T00:00:00.000Z",
});
const second = await readBack("read");

console.log("\n  4. 再讀三次(看有沒有飄回舊值)");
const repeats = [];
for (let i = 0; i < 3; i++) repeats.push(await readBack(`read ${i + 1}`));

const stale = repeats.filter((r) => r?.role !== "elder");
console.log(
  `\n  結論: ${
    first?.role === "caregiver" && second?.role === "elder" && stale.length === 0
      ? "✅ 寫入後立刻讀得到,覆寫也立刻生效 — store 沒有陳舊讀取問題"
      : `❌ 讀到陳舊資料 (${stale.length}/3 次不是最新值) — 覆寫沒有立即可見`
  }`,
);

// Clean up the probe key.
const { blobs } = await list({ prefix: `medbuddy-role/${USER}`, limit: 5 });
for (const b of blobs) await del(b.url);
console.log("  (probe key 已清除)");
