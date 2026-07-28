import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { InboundMessage } from "../../inbound";
import type { DeliveryTarget } from "../../types";
import { buildSignedAudioUrl, signAudioKey, verifySignedAudioRequest } from "../audio-url";
import { LIMITS } from "../config";
import { fetchAudioContentFromLine, formatFromContentType } from "../content";
import { ProviderMessageDedupe } from "../dedupe";
import { LineDelivery } from "../LineDelivery";
import { handleLineWebhookRequest, type WebhookDeps } from "../webhook";

/**
 * Spec §8 checklist. The suite must pass OFFLINE on a clean clone with no
 * credentials — every network dependency is injected (fetchImpl,
 * fetchAudioContent, onInbound, channelSecret).
 *
 * `it.todo(...)` = required by the spec but blocked on a TODO in the code.
 * Turn each one into a real test as you implement.
 */

// ---------- helpers ----------

const SECRET = "test-channel-secret";

const sign = (raw: string) =>
  createHmac("sha256", SECRET).update(raw, "utf8").digest("base64");

const bodyOf = (events: unknown[]) => JSON.stringify({ events });

const textEvent = (id: string, text: string, userId = "U-test-user") => ({
  type: "message",
  timestamp: 1753600000000,
  source: { userId },
  message: { id, type: "text", text },
});

function collector() {
  const seen: InboundMessage[] = [];
  return {
    seen,
    onInbound: async (m: InboundMessage) => {
      seen.push(m);
    },
  };
}

const freshWebhookDeps = () => ({
  channelSecret: SECRET,
  dedupe: new ProviderMessageDedupe(),
});

const target = (
  role: DeliveryTarget["role"],
  overrides: Partial<DeliveryTarget> = {},
): DeliveryTarget => ({
  channelUserId: "U-recipient",
  role,
  subject: { id: "S-1", displayName: "王伯伯" },
  ...overrides,
});

const offlineDelivery = () => {
  const fetchMock = vi.fn(async () => {
    throw new Error("network must not be touched in tests");
  }) as unknown as typeof fetch;
  const delivery = new LineDelivery({
    channelAccessToken: "test-token",
    fetchImpl: fetchMock,
  });
  return { delivery, fetchMock };
};

// ---------- §8: webhook signature ----------

describe("webhook signature (§7, §8)", () => {
  it("accepts a valid signature (LINE verification ping → 200)", async () => {
    const raw = bodyOf([]);
    const res = await handleLineWebhookRequest(raw, sign(raw), freshWebhookDeps());
    expect(res.status).toBe(200);
  });

  it("rejects an invalid signature with 401 and no downstream call", async () => {
    const raw = bodyOf([textEvent("m-1", "hello")]);
    const { seen, onInbound } = collector();
    const res = await handleLineWebhookRequest(raw, "AAAAinvalidAAAA", {
      ...freshWebhookDeps(),
      onInbound,
    });
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it("rejects a missing signature header with 401", async () => {
    const raw = bodyOf([]);
    const res = await handleLineWebhookRequest(raw, null, freshWebhookDeps());
    expect(res.status).toBe(401);
  });
});

// ---------- §8: inbound handling ----------

describe("webhook inbound (§5, §8)", () => {
  it("text inbound → correct InboundMessage, text verbatim", async () => {
    const raw = bodyOf([textEvent("m-text-1", "阿公問:普拿疼可以配酒嗎?")]);
    const { seen, onInbound } = collector();
    const res = await handleLineWebhookRequest(raw, sign(raw), {
      ...freshWebhookDeps(),
      onInbound,
    });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    const msg = seen[0]!;
    expect(msg.channelUserId).toBe("U-test-user");
    expect(msg.providerMessageId).toBe("m-text-1");
    expect(msg.receivedAt).toBe(new Date(1753600000000).toISOString());
    expect(msg.body).toEqual({
      kind: "text",
      text: "阿公問:普拿疼可以配酒嗎?",
    });
  });

  it("duplicate providerMessageId → exactly one downstream call (LINE retry)", async () => {
    const raw = bodyOf([textEvent("m-dup", "hi")]);
    const { seen, onInbound } = collector();
    const deps = { ...freshWebhookDeps(), onInbound };
    // same request delivered twice, as LINE does on retry:
    expect((await handleLineWebhookRequest(raw, sign(raw), deps)).status).toBe(200);
    expect((await handleLineWebhookRequest(raw, sign(raw), deps)).status).toBe(200);
    expect(seen).toHaveLength(1);
  });

  it("audio inbound → bytes fetched and handed off untouched, no transcription", async () => {
    const bytes = Uint8Array.from([0x4f, 0x67, 0x67, 0x53]);
    const fetchAudioContent = vi.fn(async () => ({
      bytes,
      format: "m4a",
      durationMs: 4200,
    }));
    const raw = bodyOf([
      {
        type: "message",
        timestamp: 1753600000000,
        source: { userId: "U-elder" },
        message: { id: "m-audio-1", type: "audio", duration: 4200 },
      },
    ]);
    const { seen, onInbound } = collector();
    const res = await handleLineWebhookRequest(raw, sign(raw), {
      ...freshWebhookDeps(),
      onInbound,
      fetchAudioContent,
    });
    expect(res.status).toBe(200);
    expect(fetchAudioContent).toHaveBeenCalledWith("m-audio-1");
    expect(seen).toHaveLength(1);
    const body = seen[0]!.body;
    expect(body.kind).toBe("audio");
    if (body.kind !== "audio") throw new Error("unreachable");
    // the exact bytes, untouched — and no transcript anywhere on the message:
    expect(body.audio).toBe(bytes);
    expect("text" in body).toBe(false);
    expect(body.format).toBe("m4a");
    expect(body.durationMs).toBe(4200);
  });

  it("unsupported message type (sticker) → 200, no downstream call", async () => {
    const raw = bodyOf([
      {
        type: "message",
        timestamp: 1753600000000,
        source: { userId: "U-test-user" },
        message: { id: "m-sticker-1", type: "sticker" },
      },
    ]);
    const { seen, onInbound } = collector();
    const res = await handleLineWebhookRequest(raw, sign(raw), {
      ...freshWebhookDeps(),
      onInbound,
    });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(0);
  });

  it("non-message event (follow) → 200, no downstream call", async () => {
    const raw = bodyOf([
      { type: "follow", timestamp: 1753600000000, source: { userId: "U-x" } },
    ]);
    const { seen, onInbound } = collector();
    const res = await handleLineWebhookRequest(raw, sign(raw), {
      ...freshWebhookDeps(),
      onInbound,
    });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(0);
  });

  it("audio download failure → 200, logged, dropped, no downstream call (§6.6)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const raw = bodyOf([
        {
          type: "message",
          timestamp: 1753600000000,
          source: { userId: "U-elder" },
          message: { id: "m-audio-fail", type: "audio" },
        },
      ]);
      const { seen, onInbound } = collector();
      const res = await handleLineWebhookRequest(raw, sign(raw), {
        ...freshWebhookDeps(),
        onInbound,
        fetchAudioContent: async () => {
          throw new Error("line-content-download-failed status=202");
        },
      });
      expect(res.status).toBe(200); // acknowledged, not retried via 5xx
      expect(seen).toHaveLength(0);
      expect(errSpy).toHaveBeenCalled(); // loud, never silent
    } finally {
      errSpy.mockRestore();
    }
  });

  it("audio with external contentProvider → 200, dropped, content fetch not attempted", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fetchAudioContent = vi.fn();
      const raw = bodyOf([
        {
          type: "message",
          timestamp: 1753600000000,
          source: { userId: "U-elder" },
          message: {
            id: "m-audio-ext",
            type: "audio",
            contentProvider: { type: "external" },
          },
        },
      ]);
      const { seen, onInbound } = collector();
      const res = await handleLineWebhookRequest(raw, sign(raw), {
        ...freshWebhookDeps(),
        onInbound,
        fetchAudioContent:
          fetchAudioContent as unknown as WebhookDeps["fetchAudioContent"],
      });
      expect(res.status).toBe(200);
      expect(seen).toHaveLength(0);
      expect(fetchAudioContent).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("duration precedence: fetch-layer value is used when the event carries none", async () => {
    const raw = bodyOf([
      {
        type: "message",
        timestamp: 1753600000000,
        source: { userId: "U-elder" },
        message: { id: "m-audio-nodur", type: "audio" }, // duration "not always included"
      },
    ]);
    const { seen, onInbound } = collector();
    await handleLineWebhookRequest(raw, sign(raw), {
      ...freshWebhookDeps(),
      onInbound,
      fetchAudioContent: async () => ({
        bytes: Uint8Array.from([1]),
        format: "m4a",
        durationMs: 7000,
      }),
    });
    const body = seen[0]!.body;
    if (body.kind !== "audio") throw new Error("unreachable");
    expect(body.durationMs).toBe(7000);
  });
});

// ---------- §8: default inbound audio content download (§5, §7) ----------

describe("fetchAudioContentFromLine (default fetchAudioContent)", () => {
  const fakeAudioResponse = (
    status: number,
    contentType: string | null,
    bytes: Uint8Array,
  ) =>
    vi.fn(async (url: string, init?: RequestInit) => {
      fakeCaptured.url = url;
      fakeCaptured.init = init;
      return new Response(status === 200 ? bytes.slice().buffer : null, {
        status,
        headers: contentType ? { "Content-Type": contentType } : {},
      });
    });
  const fakeCaptured: { url?: string; init?: RequestInit } = {};

  it("GETs the api-data content endpoint with Bearer auth and passes bytes through", async () => {
    const bytes = Uint8Array.from([0x00, 0x01, 0xfe, 0xff]);
    const fetchImpl = fakeAudioResponse(200, "audio/x-m4a", bytes);
    const result = await fetchAudioContentFromLine("m-audio-1", {
      channelAccessToken: "test-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fakeCaptured.url).toBe(
      "https://api-data.line.me/v2/bot/message/m-audio-1/content",
    );
    expect(fakeCaptured.init?.method).toBe("GET");
    expect(
      (fakeCaptured.init?.headers as Record<string, string>)["Authorization"],
    ).toBe("Bearer test-token");
    expect(result.bytes).toEqual(bytes); // byte-for-byte, untouched
    expect(result.format).toBe("m4a");
    expect(result.durationMs).toBeUndefined(); // content endpoint knows no duration
  });

  it("maps m4a content types; unrecognised types pass through raw (never guess)", () => {
    expect(formatFromContentType("audio/x-m4a")).toBe("m4a");
    expect(formatFromContentType("audio/mp4")).toBe("m4a");
    expect(formatFromContentType("audio/m4a; charset=binary")).toBe("m4a");
    expect(formatFromContentType("audio/ogg")).toBe("audio/ogg");
    expect(formatFromContentType(null)).toBe("unknown");
  });

  it("non-200 (incl. 202 still-preparing) → throws, so the webhook logs and drops", async () => {
    const fetchImpl = fakeAudioResponse(202, null, Uint8Array.from([]));
    await expect(
      fetchAudioContentFromLine("m-audio-2", {
        channelAccessToken: "test-token",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow("status=202");
  });
});

// ---------- §8: outbound guards (§6) ----------

describe("LineDelivery.send() guards (§6)", () => {
  it("missing/empty subject → refused, nothing sent (§6.5)", async () => {
    const { delivery, fetchMock } = offlineDelivery();
    const res = await delivery.send(
      target("caregiver", { subject: { id: "", displayName: "  " } }),
      { text: "finding without a name" },
    );
    expect(res).toEqual({ ok: false, reason: "missing-subject", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a URL to an elder target → refused, nothing sent (§6.1)", async () => {
    const { delivery, fetchMock } = offlineDelivery();
    for (const text of [
      "王伯伯,詳情請看 https://example.com/info",
      "王伯伯,請至 www.example.com",
      "王伯伯,開啟 line://app/123",
    ]) {
      const res = await delivery.send(target("elder"), { text });
      expect(res).toEqual({
        ok: false,
        reason: "link-in-elder-message",
        retryable: false,
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("oversized text → { ok:false, retryable:false }, nothing sent, never truncated (§7)", async () => {
    const { delivery, fetchMock } = offlineDelivery();
    const res = await delivery.send(target("caregiver"), {
      text: "王".repeat(LIMITS.maxTextChars + 1),
    });
    expect(res).toEqual({
      ok: false,
      reason: "text-exceeds-line-limit",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("over-limit audio duration → refused, nothing sent (§7)", async () => {
    const { delivery, fetchMock } = offlineDelivery();
    const res = await delivery.send(target("elder"), {
      text: "王伯伯,今晚的藥已經說明如下。",
      speech: {
        audio: Uint8Array.from([1, 2, 3]),
        format: "m4a",
        durationMs: LIMITS.maxAudioDurationMs + 1,
      },
    });
    expect(res).toEqual({
      ok: false,
      reason: "audio-exceeds-duration-limit",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

});

// ---------- §8 / Step 4: audio outbound (§7) ----------

describe("LineDelivery.send() audio outbound (§7, Step 4)", () => {
  const SIGNED_URL =
    "https://medbuddy.example/api/line/audio/abc.m4a?exp=1900000000000&sig=x";

  const mockStore = (url = SIGNED_URL) => ({
    put: vi.fn(async () => ({ url, expiresAt: new Date(1900000000000) })),
  });

  const speech = (overrides: Partial<{ format: "mp3" | "wav" | "m4a"; durationMs: number }> = {}) => ({
    audio: Uint8Array.from([1, 2, 3, 4]),
    format: "m4a" as const,
    durationMs: 4200,
    ...overrides,
  });

  const deliveryWithStore = (
    store: { put: unknown },
    fetchMock: unknown,
  ) =>
    new LineDelivery({
      channelAccessToken: "test-token",
      fetchImpl: fetchMock as typeof fetch,
      audioStore: store as never,
    });

  it("m4a speech → AudioStore.put → push carries [text, audio] with hosted URL + duration (todo 4)", async () => {
    const store = mockStore();
    const { fetchMock, captured } = pushCapture(200, { sentMessages: [] });
    const res = await deliveryWithStore(store, fetchMock).send(
      target("elder", { channelUserId: "U-elder-1" }),
      { text: "王伯伯,今晚的藥已說明。", speech: speech() },
    );

    expect(res).toEqual({ ok: true });
    expect(store.put).toHaveBeenCalledTimes(1);
    expect(store.put).toHaveBeenCalledWith(
      Uint8Array.from([1, 2, 3, 4]),
      "m4a",
    );
    const body = JSON.parse(String(captured.init?.body));
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toEqual({
      type: "text",
      text: "王伯伯,今晚的藥已說明。",
    });
    expect(body.messages[1]).toEqual({
      type: "audio",
      originalContentUrl: SIGNED_URL,
      duration: 4200,
    });
  });

  it("mp3 passes through WITHOUT transcoding (verified drift: LINE accepts mp3 or m4a)", async () => {
    const store = mockStore();
    const { fetchMock } = pushCapture(200, { sentMessages: [] });
    const res = await deliveryWithStore(store, fetchMock).send(
      target("caregiver"),
      { text: "王伯伯的語音說明。", speech: speech({ format: "mp3" }) },
    );
    expect(res).toEqual({ ok: true });
    expect(store.put).toHaveBeenCalledWith(expect.any(Uint8Array), "mp3");
  });

  it("wav → unsupported-audio-format, nothing sent, nothing hosted (§6.6)", async () => {
    const store = mockStore();
    const { fetchMock } = pushCapture(200);
    const res = await deliveryWithStore(store, fetchMock).send(
      target("caregiver"),
      { text: "王伯伯的語音說明。", speech: speech({ format: "wav" }) },
    );
    expect(res).toEqual({
      ok: false,
      reason: "unsupported-audio-format",
      retryable: false,
    });
    expect(store.put).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("oversized audio payload (> 200 MB size cap) → refused, nothing sent (todo 5)", async () => {
    const store = mockStore();
    const { fetchMock } = pushCapture(200);
    // Only byteLength is read before refusal — avoid allocating 200 MB.
    const hugeAudio = {
      byteLength: LIMITS.maxAudioFileBytes + 1,
    } as unknown as Uint8Array;
    const res = await deliveryWithStore(store, fetchMock).send(
      target("caregiver"),
      {
        text: "王伯伯的語音說明。",
        speech: { audio: hugeAudio, format: "m4a", durationMs: 4200 },
      },
    );
    expect(res).toEqual({
      ok: false,
      reason: "audio-exceeds-size-limit",
      retryable: false,
    });
    expect(store.put).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AudioStore failure → audio-hosting-failed (retryable), nothing sent", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const store = {
        put: vi.fn(async () => {
          throw new Error("blob unavailable");
        }),
      };
      const { fetchMock } = pushCapture(200);
      const res = await deliveryWithStore(store, fetchMock).send(
        target("caregiver"),
        { text: "王伯伯的語音說明。", speech: speech() },
      );
      expect(res).toEqual({
        ok: false,
        reason: "audio-hosting-failed",
        retryable: true,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("non-HTTPS hosted URL → refused, nothing sent (health information)", async () => {
    const store = mockStore("http://insecure.example/audio.m4a");
    const { fetchMock } = pushCapture(200);
    const res = await deliveryWithStore(store, fetchMock).send(
      target("caregiver"),
      { text: "王伯伯的語音說明。", speech: speech() },
    );
    expect(res).toEqual({
      ok: false,
      reason: "audio-url-not-https",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------- Step 4: signed short-lived audio URLs ----------

describe("signed audio URLs (audio-url.ts)", () => {
  const SECRET = "test-signing-secret";
  const NOW = 1900000000000;

  it("round-trip: built URL verifies before expiry", () => {
    const url = new URL(
      buildSignedAudioUrl("https://medbuddy.example/", "abc.m4a", NOW + 60_000, SECRET),
    );
    expect(url.pathname).toBe("/api/line/audio/abc.m4a");
    expect(
      verifySignedAudioRequest(
        "abc.m4a",
        url.searchParams.get("exp"),
        url.searchParams.get("sig"),
        SECRET,
        NOW,
      ),
    ).toBe(true);
  });

  it("expired → rejected", () => {
    const exp = NOW - 1;
    expect(
      verifySignedAudioRequest(
        "abc.m4a",
        String(exp),
        signAudioKey("abc.m4a", exp, SECRET),
        SECRET,
        NOW,
      ),
    ).toBe(false);
  });

  it("tampered signature / wrong key / extended expiry → rejected", () => {
    const exp = NOW + 60_000;
    const sig = signAudioKey("abc.m4a", exp, SECRET);
    expect(verifySignedAudioRequest("abc.m4a", String(exp), "AAAA", SECRET, NOW)).toBe(false);
    expect(verifySignedAudioRequest("other.m4a", String(exp), sig, SECRET, NOW)).toBe(false);
    // attacker stretches exp without re-signing:
    expect(
      verifySignedAudioRequest("abc.m4a", String(exp + 999_999), sig, SECRET, NOW),
    ).toBe(false);
    expect(verifySignedAudioRequest("abc.m4a", null, sig, SECRET, NOW)).toBe(false);
  });
});

// ---------- §8: push (text path) ----------

/** fetchImpl that captures the exact request and returns a canned response. */
function pushCapture(
  status: number,
  body?: unknown,
): {
  fetchMock: ReturnType<typeof vi.fn>;
  captured: { url?: string; init?: RequestInit };
} {
  const captured: { url?: string; init?: RequestInit } = {};
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
    });
  });
  return { fetchMock, captured };
}

const deliveryWith = (fetchMock: unknown) =>
  new LineDelivery({
    channelAccessToken: "test-token",
    fetchImpl: fetchMock as typeof fetch,
  });

describe("LineDelivery.send() push (§4, §7, §8)", () => {
  // Leading/trailing spaces, interior newline, emoji (surrogate pair), mixed
  // full-width/half-width punctuation, Traditional Chinese, and a URL.
  const NASTY_TEXT =
    "  王伯伯:今晚的 ibuprofen(布洛芬)可以吃嗎?\n詳見 https://example.com/info?q=藥&x=1 💊。 OK! ";

  it("message.text is delivered VERBATIM — fails if even one character differs (§4, §8)", async () => {
    const { fetchMock, captured } = pushCapture(200, { sentMessages: [] });
    const res = await deliveryWith(fetchMock).send(
      target("caregiver", { channelUserId: "U-caregiver-1" }),
      { text: NASTY_TEXT },
    );

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(captured.url).toBe("https://api.line.me/v2/bot/message/push");
    expect(captured.init?.method).toBe("POST");

    const headers = captured.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-token");
    expect(headers["Content-Type"]).toBe("application/json");

    const capturedBody = JSON.parse(String(captured.init?.body));
    // character-for-character identical, exactly one text message:
    expect(capturedBody.messages[0].text).toBe(NASTY_TEXT);
    expect(capturedBody.messages).toHaveLength(1);
    // …and the WHOLE payload is exactly this — no extra field can carry an
    // altered copy of the text (toEqual fails on any extra property):
    expect(capturedBody).toEqual({
      to: "U-caregiver-1",
      messages: [{ type: "text", text: NASTY_TEXT }],
    });
  });

  it("caregiver messages MAY contain links and pass through to push (§6.1 is elder-only)", async () => {
    const { fetchMock } = pushCapture(200, { sentMessages: [] });
    const res = await deliveryWith(fetchMock).send(target("caregiver"), {
      text: "王伯伯的用藥報告:https://example.com/report/123",
    });
    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("success response provides sentMessages[0].id → providerMessageId (string, per verified shape)", async () => {
    const { fetchMock } = pushCapture(200, {
      sentMessages: [{ id: "461230966842064897", quoteToken: "q..." }],
    });
    const res = await deliveryWith(fetchMock).send(target("caregiver"), {
      text: "王伯伯:一切正常。",
    });
    expect(res).toEqual({ ok: true, providerMessageId: "461230966842064897" });
  });

  it("numeric id (docs type it Number) is normalised to a string", async () => {
    const { fetchMock } = pushCapture(200, { sentMessages: [{ id: 12345 }] });
    const res = await deliveryWith(fetchMock).send(target("caregiver"), {
      text: "王伯伯:一切正常。",
    });
    expect(res).toEqual({ ok: true, providerMessageId: "12345" });
  });

  it("2xx with an empty body is still ok:true, just without an id", async () => {
    const { fetchMock } = pushCapture(200);
    const res = await deliveryWith(fetchMock).send(target("caregiver"), {
      text: "王伯伯:一切正常。",
    });
    expect(res).toEqual({ ok: true });
  });

  it("failure mapping table — exact { ok, reason, retryable }, exactly ONE fetch call (no auto-retry, §6.2)", async () => {
    const table: Array<[number, string, boolean]> = [
      [400, "line-rejected-request", false],
      [401, "line-auth-failed", false],
      [403, "line-auth-failed", false],
      [429, "rate-limited", true],
      [500, "line-server-error", true],
      [502, "line-server-error", true],
    ];
    for (const [status, reason, retryable] of table) {
      const { fetchMock } = pushCapture(status, { message: "err" });
      const res = await deliveryWith(fetchMock).send(target("caregiver"), {
        text: "王伯伯:測試。",
      });
      expect(res).toEqual({ ok: false, reason, retryable });
      expect(fetchMock).toHaveBeenCalledTimes(1); // proves no auto-retry
    }
  });

  it("thrown network error → { ok:false, reason:'network-error', retryable:true }, never throws (§6.6)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const res = await deliveryWith(fetchMock).send(target("caregiver"), {
      text: "王伯伯:測試。",
    });
    expect(res).toEqual({ ok: false, reason: "network-error", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
