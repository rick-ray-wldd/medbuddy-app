/**
 * Read-only: who is bound to what.
 *
 * There is no operator surface in this build, which is a real gap — the
 * binding rule deliberately makes an elder binding terminal, and "terminal
 * with no way to look at it" is worse than terminal. This at least makes the
 * state visible.
 *
 * Usage: BLOB_READ_WRITE_TOKEN=… node scripts/list-roles.mts
 */

import { list, get } from "@vercel/blob";

const { blobs } = await list({ prefix: "medbuddy-role/", limit: 100 });

if (blobs.length === 0) {
  console.log("  還沒有任何角色綁定 — 每個傳訊息進來的人都會拿到角色卡。");
} else {
  console.log(`  ${blobs.length} 筆綁定:\n`);
  for (const b of blobs) {
    const res = await get(b.pathname, { access: "private" });
    if (!res || res.statusCode !== 200) {
      console.log(`    ${b.pathname}  (讀不到)`);
      continue;
    }
    const binding = JSON.parse(await new Response(res.stream).text()) as {
      channelUserId: string;
      role: string;
      subjectId: string;
      boundAt: string;
    };
    const terminal = binding.role === "elder" ? "  ⚠️ 終局,無法改成 caregiver" : "";
    console.log(`    ${binding.channelUserId}`);
    console.log(`      role      ${binding.role}${terminal}`);
    console.log(`      subject   ${binding.subjectId}`);
    console.log(`      boundAt   ${binding.boundAt}\n`);
  }
}
