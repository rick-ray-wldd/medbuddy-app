import { afterEach, describe, expect, it, vi } from "vitest";
import { broadcastImage, demoBroadcastEnabled } from "./broadcast";

afterEach(() => vi.unstubAllEnvs());

describe("the flag", () => {
  it("is off unless set to exactly true", () => {
    for (const v of [undefined, "", "1", "yes", "TRUE", "on"]) {
      expect(demoBroadcastEnabled({ MEDBUDDY_DEMO_BROADCAST: v }), String(v)).toBe(false);
    }
    expect(demoBroadcastEnabled({ MEDBUDDY_DEMO_BROADCAST: "true" })).toBe(true);
  });
});

describe("what may be broadcast", () => {
  it("refuses text carrying a link", async () => {
    // A broadcast may land on an older adult, and §6.1 refuses him a link.
    // Refused rather than stripped: the delivery seam never edits a message.
    let called = false;
    const result = await broadcastImage(
      {
        channelAccessToken: "t",
        text: "回診單在這 https://example.test/summary/abc",
        imageUrl: "https://blob.test/qr.png",
      },
      {
        fetchImpl: (async () => {
          called = true;
          return new Response("{}", { status: 200 });
        }) as unknown as typeof fetch,
      },
    );

    expect(result).toEqual({ ok: false, reason: "broadcast text must not contain a link" });
    expect(called).toBe(false);
  });

  it("sends text plus image when the text is clean", async () => {
    let body: Record<string, unknown> = {};
    const result = await broadcastImage(
      {
        channelAccessToken: "t",
        text: "父親,這是這次回診要給醫師看的單子。",
        imageUrl: "https://blob.test/qr.png",
      },
      {
        fetchImpl: (async (_u: string, init: RequestInit) => {
          body = JSON.parse(String(init.body));
          return new Response("{}", { status: 200 });
        }) as unknown as typeof fetch,
      },
    );

    expect(result).toEqual({ ok: true });
    const messages = body.messages as { type: string }[];
    expect(messages.map((m) => m.type)).toEqual(["text", "image"]);
  });

  it("reports a failed broadcast rather than claiming delivery", async () => {
    const result = await broadcastImage(
      { channelAccessToken: "t", text: "ok", imageUrl: "https://blob.test/q.png" },
      {
        fetchImpl: (async () => new Response("no", { status: 429 })) as unknown as typeof fetch,
      },
    );
    expect(result).toMatchObject({ ok: false });
  });
});
