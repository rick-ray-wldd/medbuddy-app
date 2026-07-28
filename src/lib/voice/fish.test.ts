import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FishVoiceProvider } from "./fish";
import type { VoiceProfile } from "./types";

const provider = new FishVoiceProvider();

function sample(bytes = 1000) {
  return {
    filename: "sample.m4a",
    bytes: new Uint8Array(bytes),
    mimeType: "audio/m4a",
  };
}

const profile: VoiceProfile = {
  id: "fish:abc",
  subjectId: "subj-father",
  displayName: "小明的聲音",
  provider: "fish",
  externalVoiceId: "abc",
  createdAt: "2026-07-28T00:00:00Z",
  consent: { statement: "這是我自己的聲音", givenAt: "2026-07-28T00:00:00Z" },
};

beforeEach(() => {
  process.env.FISH_AUDIO_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.FISH_AUDIO_API_KEY;
  vi.unstubAllGlobals();
});

describe("registering a caregiver's own voice", () => {
  it("refuses without a consent statement", async () => {
    // There is no default statement to fall back on. No consent, no voice.
    const result = await provider.calibrate({
      subjectId: "subj-father",
      displayName: "小明的聲音",
      consentStatement: "   ",
      samples: [sample()],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/consent/);
  });

  it("refuses with no samples", async () => {
    const result = await provider.calibrate({
      subjectId: "subj-father",
      displayName: "小明的聲音",
      consentStatement: "這是我自己的聲音",
      samples: [],
    });
    expect(result.ok).toBe(false);
  });

  it("builds a private model and keeps the consent statement as given", async () => {
    let sentForm: FormData | null = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sentForm = init.body as FormData;
      return new Response(JSON.stringify({ _id: "voice-123" }), { status: 200 });
    });

    const result = await provider.calibrate({
      subjectId: "subj-father",
      displayName: "小明的聲音",
      consentStatement: "這是我本人的聲音,我同意用來對我爸說明用藥。",
      samples: [sample()],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.externalVoiceId).toBe("voice-123");
    expect(result.profile.consent.statement).toBe(
      "這是我本人的聲音,我同意用來對我爸說明用藥。",
    );
    // A caregiver's voice must never become a public model.
    expect(sentForm).not.toBeNull();
    expect((sentForm as unknown as FormData).get("visibility")).toBe("private");
  });

  it("fails rather than storing a profile that cannot speak", async () => {
    // A model we cannot address is not a model. Storing it would put an option
    // in front of the older adult that stays silent when he presses it.
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({}), { status: 200 }));
    const result = await provider.calibrate({
      subjectId: "subj-father",
      displayName: "小明的聲音",
      consentStatement: "這是我自己的聲音",
      samples: [sample()],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/no model id/);
  });

  it("reports a provider failure rather than throwing", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));
    const result = await provider.calibrate({
      subjectId: "subj-father",
      displayName: "小明的聲音",
      consentStatement: "這是我自己的聲音",
      samples: [sample()],
    });
    expect(result.ok).toBe(false);
  });
});

describe("speaking", () => {
  it("addresses the caregiver's own model and asks for mp3", async () => {
    let body: Record<string, unknown> = {};
    let headers: Record<string, string> = {};
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      headers = init.headers as Record<string, string>;
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });

    const result = await provider.synthesise({
      text: "這顆白色的是控制血壓的。",
      language: "zh",
      profile,
    });

    expect(result.ok).toBe(true);
    expect(body.reference_id).toBe("abc");
    expect(body.format).toBe("mp3");
    expect(headers.model).toBe("s2-pro");
  });

  it("marks rate limiting as retryable and a bad model as not", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 429 }));
    const limited = await provider.synthesise({ text: "x", language: "zh", profile });
    expect(limited.ok).toBe(false);
    if (limited.ok) return;
    expect(limited.retryable).toBe(true);

    const noModel = await provider.synthesise({
      text: "x",
      language: "zh",
      profile: { ...profile, externalVoiceId: undefined },
    });
    expect(noModel.ok).toBe(false);
    if (noModel.ok) return;
    expect(noModel.retryable).toBe(false);
  });

  it("does nothing at all without a key configured", async () => {
    delete process.env.FISH_AUDIO_API_KEY;
    let called = false;
    vi.stubGlobal("fetch", async () => {
      called = true;
      return new Response("", { status: 200 });
    });
    const result = await provider.synthesise({ text: "x", language: "zh", profile });
    expect(result.ok).toBe(false);
    // The default build makes no third-party call. This asserts that literally.
    expect(called).toBe(false);
  });
});
