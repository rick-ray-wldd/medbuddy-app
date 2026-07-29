/**
 * The operator surface `bind.ts` said did not exist.
 *
 * An elder binding is terminal *from LINE*, and that rule is not weakened
 * here. It cannot be: postback data is client input, so a message-driven
 * unbind would hand the older adult the escape hatch the rule exists to
 * remove.
 *
 * What this needs instead is the Blob credential — server access, held by
 * whoever runs the deployment. That is the correct shape for the recovery: the
 * person who set the phones up can fix a mistake, and the person holding the
 * phone cannot.
 *
 * Deleting the binding does not delete anything about the person. Their log
 * lives under `medbuddy-log/` and is untouched; this removes only the answer
 * to "which of the two people is holding this phone", so the card is asked
 * again.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=… node scripts/unbind-role.mts <channelUserId>
 *   BLOB_READ_WRITE_TOKEN=… node scripts/unbind-role.mts --all   # demo reset
 */

import { del, list, get } from "@vercel/blob";

const arg = process.argv[2];
if (!arg) {
  console.error("需要 channelUserId,或 --all");
  console.error("先用 scripts/list-roles.mts 看有哪些綁定。");
  process.exit(1);
}

const { blobs } = await list({ prefix: "medbuddy-role/", limit: 100 });
if (blobs.length === 0) {
  console.log("  沒有任何綁定可以移除。");
  process.exit(0);
}

const targets =
  arg === "--all"
    ? blobs
    : blobs.filter((b) => b.pathname === `medbuddy-role/${encodeURIComponent(arg)}.json`);

if (targets.length === 0) {
  console.error(`  找不到 ${arg} 的綁定。`);
  process.exit(1);
}

for (const b of targets) {
  // Report what is being removed rather than deleting silently: this is the
  // one action in the product that undoes a safety decision.
  const res = await get(b.pathname, { access: "private" }).catch(() => null);
  let described = b.pathname;
  if (res && res.statusCode === 200) {
    const binding = JSON.parse(await new Response(res.stream).text()) as {
      channelUserId: string;
      role: string;
      subjectId: string;
    };
    described = `${binding.channelUserId}  (${binding.role} → ${binding.subjectId})`;
  }
  await del(b.url);
  console.log(`  已移除綁定  ${described}`);
}

console.log(`
下一次這些帳號傳訊息給 bot,會重新收到角色卡。
用藥與觀察紀錄沒有被動到 — 只移除了「這支手機是誰在拿」這個答案。
`);
