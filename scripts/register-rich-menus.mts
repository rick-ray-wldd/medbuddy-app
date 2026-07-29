/**
 * Register both rich menus with LINE, once.
 *
 * Registration is a deploy-time act, not a request-time one: creating a menu
 * on every cold start would leave a trail of orphaned menus on the channel and
 * eventually hit LINE's per-channel limit. So this runs by hand, prints two
 * ids, and those ids go into the environment.
 *
 * It deletes any previously registered `medbuddy-*` menu first. That is the
 * whole reason the definitions carry a `name`: without it, re-running this
 * script is how a channel accumulates fourteen identical menus and nobody can
 * tell which one is live.
 *
 * Usage:
 *   node scripts/render-rich-menu.mts          # draw the images first
 *   LINE_CHANNEL_ACCESS_TOKEN=… node scripts/register-rich-menus.mts
 *
 * Then set, in Vercel and .env.local:
 *   LINE_RICH_MENU_ELDER_ID=…
 *   LINE_RICH_MENU_CAREGIVER_ID=…
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { LineSetupClient } from "../src/lib/delivery/line/setup-client.ts";
import {
  assertNoLinksForElder,
  caregiverRichMenu,
  elderRichMenu,
} from "../src/lib/delivery/line/rich-menu.ts";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("LINE_CHANNEL_ACCESS_TOKEN is not set — nothing to register.");
  process.exit(1);
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
if (!baseUrl) {
  console.error("NEXT_PUBLIC_BASE_URL is not set — the caregiver menu's dashboard cell needs it.");
  process.exit(1);
}

const client = new LineSetupClient({ channelAccessToken: token });
const root = process.cwd();

const elder = elderRichMenu();
const caregiver = caregiverRichMenu(baseUrl);

// Belt and braces: the rule that an elder is never sent a link is enforced in
// code rather than trusted to the definition above staying correct.
assertNoLinksForElder(elder);

console.log("清掉舊的 medbuddy 選單…");
for (const existing of await client.listRichMenus()) {
  if (!existing.name.startsWith("medbuddy-")) continue;
  await client.deleteRichMenu(existing.richMenuId);
  console.log(`  刪除 ${existing.name} (${existing.richMenuId})`);
}

async function register(
  definition: ReturnType<typeof elderRichMenu>,
  image: string,
): Promise<string> {
  const png = await readFile(path.join(root, "public", image));
  const id = await client.createRichMenu(definition);
  await client.uploadRichMenuImage(id, png);
  console.log(`  ✅ ${definition.name}  ${id}`);
  return id;
}

console.log("\n註冊…");
const elderId = await register(elder, "rich-menu-elder.png");
const caregiverId = await register(caregiver, "rich-menu-caregiver.png");

console.log(`
把這兩行加到 Vercel production env 和 .env.local:

  LINE_RICH_MENU_ELDER_ID=${elderId}
  LINE_RICH_MENU_CAREGIVER_ID=${caregiverId}

沒有預設選單是刻意的:在有人回答角色卡之前,我們不知道他是哪一個人,
而先掛上其中一張就是替他猜。
`);
