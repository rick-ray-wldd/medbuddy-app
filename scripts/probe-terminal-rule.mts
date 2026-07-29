/**
 * Does "an elder binding is terminal" actually hold against the real store?
 *
 * The unit tests assert it against InMemoryRoleStore and pass. Production runs
 * BlobRoleStore, and the runtime logs show an elder→caregiver transition that
 * succeeded. One of those two is lying.
 *
 * Writes to a probe key, never a real user's.
 *
 * Usage: BLOB_READ_WRITE_TOKEN=… node scripts/probe-terminal-rule.mts
 */

import { bindRole } from "../src/lib/roles/bind.ts";
import { BlobRoleStore, InMemoryRoleStore } from "../src/lib/roles/stores.ts";
import type { RoleStore } from "../src/lib/roles/types.ts";
import { del, list } from "@vercel/blob";

const USER = "Uprobe-terminal-rule-do-not-use";

async function run(label: string, store: RoleStore) {
  console.log(`\n  ── ${label} ──`);

  await bindRole(store, USER, "elder", "subj-father", "2026-01-01T00:00:00.000Z");
  const afterElder = await store.get(USER);
  console.log(`    綁成 elder  → store 說 ${afterElder?.role ?? "null"}`);

  const outcome = await bindRole(
    store,
    USER,
    "caregiver",
    "subj-father",
    "2026-01-02T00:00:00.000Z",
  );
  const after = await store.get(USER);

  console.log(`    嘗試綁成 caregiver`);
  console.log(`      bindRole 回傳 ok=${outcome.ok}`);
  console.log(`      store 現在說 ${after?.role ?? "null"}`);
  console.log(
    outcome.ok === false && after?.role === "elder"
      ? "      ✅ 規則生效 — 拒絕了"
      : "      ❌ 規則沒生效 — 長輩可以走進照顧者介面",
  );
}

await run("InMemoryRoleStore (單元測試用的)", new InMemoryRoleStore());
await run("BlobRoleStore (production 用的)", new BlobRoleStore());

const { blobs } = await list({ prefix: `medbuddy-role/${USER}`, limit: 5 });
for (const b of blobs) await del(b.url);
console.log("\n  (probe key 已清除)");
