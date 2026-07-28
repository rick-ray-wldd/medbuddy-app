import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleInbound, type InboundMessage } from "../inbound";
import type { Delivery, DeliveryMessage, DeliveryTarget } from "../types";

/**
 * The inbound flow (elder texts a medicine name → pipeline → narration
 * pushed back). Offline: delivery is injected; the registry reads committed
 * data files only.
 */

const ELDER = "U-elder-demo";

function textMsg(text: string, from = ELDER): InboundMessage {
  return {
    channelUserId: from,
    receivedAt: new Date(1753600000000).toISOString(),
    providerMessageId: `m-${Math.random().toString(36).slice(2)}`,
    body: { kind: "text", text },
  };
}

function fakeDelivery() {
  const calls: { target: DeliveryTarget; message: DeliveryMessage }[] = [];
  const delivery: Delivery = {
    send: async (target, message) => {
      calls.push({ target, message });
      return { ok: true };
    },
  };
  return { delivery, calls };
}

describe("handleInbound (elder question → narration reply)", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_ELDER_USER_ID", ELDER);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("elder texts a medicine name → exactly one reply, elder role, subject named, rule-produced text", async () => {
    const { delivery, calls } = fakeDelivery();
    await handleInbound(textMsg("普拿疼膜衣錠500毫克"), { delivery });

    expect(calls).toHaveLength(1);
    const { target, message } = calls[0]!;
    expect(target.role).toBe("elder");
    expect(target.channelUserId).toBe(ELDER);
    expect(target.subject.displayName).toBe("父親");
    // §6.5 — the narration names whose medicines it is about:
    expect(message.text).toContain("父親");
    expect(message.text.length).toBeGreaterThan(0);
  });

  it("unmapped sender → NO reply, no guessing a subject (§6.5)", async () => {
    const { delivery, calls } = fakeDelivery();
    await handleInbound(textMsg("普拿疼", "U-stranger"), { delivery });
    expect(calls).toHaveLength(0);
  });

  it("audio inbound → recorded, NOT answered (no STT wired; §6.6 over wrong answers)", async () => {
    const { delivery, calls } = fakeDelivery();
    await handleInbound(
      {
        channelUserId: ELDER,
        receivedAt: new Date(1753600000000).toISOString(),
        providerMessageId: "m-audio",
        body: { kind: "audio", audio: Uint8Array.from([1]), format: "m4a" },
      },
      { delivery },
    );
    expect(calls).toHaveLength(0);
  });

  it("delivery failure → handled, never throws (§6.6)", async () => {
    const delivery: Delivery = {
      send: async () => ({ ok: false, reason: "rate-limited", retryable: true }),
    };
    await expect(
      handleInbound(textMsg("普拿疼膜衣錠500毫克"), { delivery }),
    ).resolves.toBeUndefined();
  });
});
