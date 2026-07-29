/**
 * Push the role card to someone on demand.
 *
 * The product sends this automatically on `follow` — that is the real path and
 * it is what a new user gets. This exists for the two cases where waiting for
 * a follow event is not available:
 *
 *   - **A demo.** Asking someone to block and re-add an account mid-demo is a
 *     worse first impression than the card itself.
 *   - **Recovery.** After `unbind-role.mts`, the person is unbound but nothing
 *     prompts them until they happen to send a message.
 *
 * It sends exactly the same card the follow handler sends — imported, not
 * copied, so a demo can never show a card the product does not.
 *
 * Usage:
 *   LINE_CHANNEL_ACCESS_TOKEN=… node scripts/send-role-card.mts <channelUserId>
 */

import { LineSetupClient } from "../src/lib/delivery/line/setup-client.ts";
import { roleSelectionCard } from "../src/lib/delivery/line/role-card.ts";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("LINE_CHANNEL_ACCESS_TOKEN is not set.");
  process.exit(1);
}

const userId = process.argv[2];
if (!userId) {
  console.error("需要 channelUserId。用 npm run roles:ls 找,或看 Vercel log。");
  process.exit(1);
}

const result = await new LineSetupClient({ channelAccessToken: token }).pushFlex(
  userId,
  roleSelectionCard(),
);

if (result.ok) {
  console.log(`  ✅ 角色卡已送給 ${userId}`);
} else {
  console.error(`  ❌ ${result.reason}`);
  process.exit(1);
}
