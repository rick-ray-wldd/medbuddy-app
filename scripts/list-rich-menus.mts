/**
 * Read-only: what rich menus already exist on the channel.
 *
 * Separate from the registration script because registration deletes, and
 * looking before deleting on a channel someone else also works on should not
 * require running the thing that deletes.
 *
 * Usage: LINE_CHANNEL_ACCESS_TOKEN=… node scripts/list-rich-menus.mts
 */

import { LineSetupClient } from "../src/lib/delivery/line/setup-client.ts";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("LINE_CHANNEL_ACCESS_TOKEN is not set.");
  process.exit(1);
}

const menus = await new LineSetupClient({ channelAccessToken: token }).listRichMenus();

if (menus.length === 0) {
  console.log("  頻道上沒有任何 rich menu。");
} else {
  for (const m of menus) {
    const mine = m.name.startsWith("medbuddy-");
    console.log(`  ${mine ? "[我們的]" : "[別人的]"} ${m.name}  ${m.richMenuId}`);
  }
}
