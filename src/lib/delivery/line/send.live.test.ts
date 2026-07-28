/**
 * Push real messages to a real LINE account, through the real adapter.
 *
 *   export LINE_CHANNEL_ACCESS_TOKEN=…
 *   export LINE_ELDER_USER_ID=U…      # read it off the webhook log
 *   npm run probe:line-send
 *
 * **Skips itself when those are absent**, so `npm test` on a clean clone stays
 * offline and green — this file is in the normal suite, and a reviewer running
 * the suite will simply see it skipped.
 *
 * It goes through `LineDelivery` rather than curling the API, because the point
 * is to exercise the refusals, not to prove that LINE works. Three of the four
 * sends below are supposed to fail.
 */

import { describe, expect, it } from "vitest";
import { LineDelivery } from "./LineDelivery";
import type { DeliveryTarget } from "../types";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
const to = process.env.LINE_ELDER_USER_ID?.trim();
const live = Boolean(token && to);

const elder: DeliveryTarget = {
  channelUserId: to ?? "",
  role: "elder",
  subject: { id: "subj-father", displayName: "父親" },
};

describe.skipIf(!live)("pushing to a real LINE account", () => {
  const delivery = new LineDelivery({ channelAccessToken: token ?? "" });

  it("delivers an ordinary message", async () => {
    // Deliberately obviously a test. Nothing here composes clinical content.
    const result = await delivery.send(elder, {
      text: "父親,這是 MedBuddy 的測試訊息,收到不用回覆。",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a message with no subject attached", async () => {
    // A carer may hold twelve residents; an unattributed message is the worst
    // error this product can make.
    const result = await delivery.send(
      { ...elder, subject: undefined as unknown as DeliveryTarget["subject"] },
      { text: "父親,測試。" },
    );
    expect(result.ok).toBe(false);
  });

  it("refuses to send an older adult a link", async () => {
    // He taps links without checking. Nothing bound for him may carry one.
    const result = await delivery.send(elder, {
      text: "父親,請點 https://example.com 看說明。",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("link");
  });

  it("refuses speech rather than quietly sending only the text", async () => {
    // Audio hosting is not built. Dropping the spoken half and delivering the
    // written half would look like success.
    const result = await delivery.send(elder, {
      text: "父親,這是語音測試。",
      speech: { audio: new Uint8Array([0]), format: "mp3", durationMs: 3000 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("audio");
  });
});

describe.skipIf(live)("without credentials", () => {
  it("is skipped, and says so", () => {
    // Present so the suite reports something rather than silently omitting a
    // file. A reviewer sees this and knows there is a live path they did not
    // run, instead of assuming there isn't one.
    expect(live).toBe(false);
  });
});
