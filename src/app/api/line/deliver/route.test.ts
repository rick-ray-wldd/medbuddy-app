import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  narrate: vi.fn(async () => ({
    narration: { segments: [{ text: "長者版說明" }] },
    usedFallback: false,
  })),
  send: vi.fn(async () => ({ ok: true as const })),
  findDemoVoice: vi.fn(() => null),
}));

vi.mock("@/lib/registry", () => ({
  getRegistry: () => ({
    resolver: { resolveAll: (items: unknown) => items },
    ruleSets: [],
    classes: {},
    knownMedicines: {},
  }),
}));
vi.mock("@/lib/verdict/build", () => ({ buildVerdict: () => ({}) }));
vi.mock("@/lib/narration/narrate", () => ({ narrate: mocks.narrate }));
vi.mock("@/lib/voice/fish", () => ({ FishVoiceProvider: class {} }));
vi.mock("@/lib/voice/profiles", () => ({
  defaultVoice: () => null,
  findDemoVoice: mocks.findDemoVoice,
}));
vi.mock("@/lib/delivery/line/config", () => ({
  getLineConfig: () => ({ channelAccessToken: "test-token" }),
}));
vi.mock("@/lib/delivery/line/LineDelivery", () => ({
  LineDelivery: class {
    send = mocks.send;
  },
}));

import { POST } from "./route";

describe("POST /api/line/deliver", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_DEMO_ELDER_USER_ID", "U-father");
    vi.stubEnv("LINE_DEMO_CAREGIVER_USER_ID", "U-daughter");
    mocks.narrate.mockClear();
    mocks.send.mockClear();
    mocks.findDemoVoice.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores a crafted caregiver audience and sends only the elder projection to the elder", async () => {
    const response = await POST(
      new Request("http://localhost/api/line/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: "subj-father",
          audience: "caregiver",
          items: [{ text: "普拿疼膜衣錠500毫克", source: "otc" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.narrate).toHaveBeenCalledWith(
      expect.anything(),
      "elder",
      null,
      expect.anything(),
    );
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ channelUserId: "U-father", role: "elder" }),
      { text: "長者版說明" },
    );
  });

  it("rejects an unregistered per-request voice instead of inventing consent", async () => {
    const response = await POST(
      new Request("http://localhost/api/line/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: "subj-father",
          items: [{ text: "普拿疼膜衣錠500毫克", source: "otc" }],
          voiceId: "unregistered-voice",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "unknown or unconsented voice profile" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
