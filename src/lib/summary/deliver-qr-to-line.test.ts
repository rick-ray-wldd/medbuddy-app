import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Delivery,
  DeliveryMessage,
  DeliveryTarget,
} from "@/lib/delivery/types";
import { deliverSummaryQrToLine } from "./deliver-qr-to-line";

const blob = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: blob.put }));

const NOW = Date.parse("2026-07-29T07:30:00.000Z");

describe("clinician-summary QR delivery", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_DEMO_ELDER_USER_ID", "U-father");
    vi.stubEnv("LINE_DEMO_CAREGIVER_USER_ID", "U-daughter");
    vi.stubEnv("SUMMARY_SHARE_SECRET", "test-summary-secret");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://stale-personal-project.vercel.app");
    vi.spyOn(console, "error").mockImplementation(() => {});
    blob.put.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("creates one QR on the current deployment and delivers role-safe copies to both demo phones", async () => {
    const renderedUrls: string[] = [];
    const storedImages: Array<{ path: string; bytes: Uint8Array }> = [];
    const sent: Array<{ target: DeliveryTarget; message: DeliveryMessage }> = [];
    const delivery: Delivery = {
      async send(target, message) {
        sent.push({ target, message });
        return { ok: true, providerMessageId: `line-${sent.length}` };
      },
    };

    const result = await deliverSummaryQrToLine(
      {
        subjectId: "subj-father",
        baseUrl: "https://current-medbuddy.vercel.app",
      },
      {
        now: () => NOW,
        renderQr: async (url) => {
          renderedUrls.push(url);
          return Uint8Array.from([1, 2, 3]);
        },
        storeQr: async (path, bytes) => {
          storedImages.push({ path, bytes });
          return { url: "https://blob.example.com/summary.png" };
        },
        delivery,
      },
    );

    expect(result).toEqual({
      ok: true,
      deliveredAt: "2026-07-29T07:30:00.000Z",
      recipients: { elder: true, caregiver: true },
    });
    expect(renderedUrls).toHaveLength(1);
    expect(renderedUrls[0]).toMatch(
      /^https:\/\/current-medbuddy\.vercel\.app\/summary\/s\//,
    );
    expect(renderedUrls[0]).not.toContain("subj-father");
    expect(storedImages).toEqual([
      {
        path: expect.stringMatching(/^summary-qr\/[a-f0-9]{40}\.png$/),
        bytes: Uint8Array.from([1, 2, 3]),
      },
    ]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      target: { channelUserId: "U-father", role: "elder" },
      message: { imageUrl: "https://blob.example.com/summary.png" },
    });
    expect(sent[0].message.text).not.toMatch(/https?:\/\//);
    expect(sent[1]).toMatchObject({
      target: { channelUserId: "U-daughter", role: "caregiver" },
      message: { imageUrl: "https://blob.example.com/summary.png" },
    });
    expect(sent[1].message.text).toContain(renderedUrls[0]);
  });

  it("rejects another seeded subject before rendering, storing, or sending", async () => {
    const renderQr = vi.fn(async () => Uint8Array.from([1]));
    const storeQr = vi.fn(async () => ({ url: "https://blob.example.com/qr.png" }));
    const send = vi.fn(async () => ({ ok: true as const }));

    const result = await deliverSummaryQrToLine(
      {
        subjectId: "subj-mother",
        baseUrl: "https://current-medbuddy.vercel.app",
      },
      {
        now: () => NOW,
        renderQr,
        storeQr,
        delivery: { send },
      },
    );

    expect(result).toEqual({
      ok: false,
      code: "outside-demo-pair",
      reason: "the demo supports one fixed care subject",
    });
    expect(renderQr).not.toHaveBeenCalled();
    expect(storeQr).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("safely repeats the same QR Blob write when two requests mint the same token", async () => {
    const seenPaths = new Set<string>();
    blob.put.mockImplementation(
      async (
        path: string,
        _png: unknown,
        options: { allowOverwrite?: boolean },
      ) => {
        if (seenPaths.has(path) && options.allowOverwrite !== true) {
          throw new Error("blob already exists");
        }
        seenPaths.add(path);
        return { url: "https://blob.example.com/summary.png" };
      },
    );
    const delivery: Delivery = {
      async send() {
        return { ok: true };
      },
    };
    const request = {
      subjectId: "subj-father",
      baseUrl: "https://current-medbuddy.vercel.app",
    };
    const deps = {
      now: () => NOW,
      renderQr: async () => Uint8Array.from([1, 2, 3]),
      delivery,
    };

    const first = await deliverSummaryQrToLine(request, deps);
    const second = await deliverSummaryQrToLine(request, deps);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(blob.put).toHaveBeenCalledTimes(2);
    expect(blob.put.mock.calls[0][0]).toBe(blob.put.mock.calls[1][0]);
    expect(blob.put.mock.calls[1][2]).toMatchObject({ allowOverwrite: true });
  });

  it("refuses to mint or send a QR when the share secret is missing", async () => {
    vi.stubEnv("SUMMARY_SHARE_SECRET", "");
    const renderQr = vi.fn(async () => Uint8Array.from([1]));
    const storeQr = vi.fn(async () => ({ url: "https://blob.example.com/qr.png" }));
    const send = vi.fn(async () => ({ ok: true as const }));

    const result = await deliverSummaryQrToLine(
      {
        subjectId: "subj-father",
        baseUrl: "https://current-medbuddy.vercel.app",
      },
      {
        now: () => NOW,
        renderQr,
        storeQr,
        delivery: { send },
      },
    );

    expect(result).toEqual({
      ok: false,
      code: "share-secret-unconfigured",
      reason: "SUMMARY_SHARE_SECRET is not configured; refusing to mint a link",
    });
    expect(renderQr).not.toHaveBeenCalled();
    expect(storeQr).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses before QR work when no elder phone is configured", async () => {
    vi.stubEnv("LINE_DEMO_ELDER_USER_ID", "");
    vi.stubEnv("LINE_DEMO_CAREGIVER_USER_ID", "");
    vi.stubEnv("LINE_ELDER_USER_ID", "");
    const renderQr = vi.fn(async () => Uint8Array.from([1]));
    const storeQr = vi.fn(async () => ({ url: "https://blob.example.com/qr.png" }));
    const send = vi.fn(async () => ({ ok: true as const }));

    const result = await deliverSummaryQrToLine(
      {
        subjectId: "subj-father",
        baseUrl: "https://current-medbuddy.vercel.app",
      },
      {
        now: () => NOW,
        renderQr,
        storeQr,
        delivery: { send },
      },
    );

    expect(result).toEqual({
      ok: false,
      code: "missing-elder-recipient",
      reason: "no LINE account is bound to 父親",
    });
    expect(renderQr).not.toHaveBeenCalled();
    expect(storeQr).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("returns a delivery failure and does not attempt the caregiver after the elder fails", async () => {
    const targets: DeliveryTarget[] = [];
    const delivery: Delivery = {
      async send(target) {
        targets.push(target);
        return {
          ok: false,
          reason: "LINE push rejected",
          retryable: true,
        };
      },
    };

    const result = await deliverSummaryQrToLine(
      {
        subjectId: "subj-father",
        baseUrl: "https://current-medbuddy.vercel.app",
      },
      {
        now: () => NOW,
        renderQr: async () => Uint8Array.from([1]),
        storeQr: async () => ({ url: "https://blob.example.com/qr.png" }),
        delivery,
      },
    );

    expect(result).toEqual({
      ok: false,
      code: "elder-delivery-failed",
      reason: "LINE push rejected",
    });
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ channelUserId: "U-father", role: "elder" });
  });

  it("reports partial success when the elder receives the QR but the caregiver copy fails", async () => {
    const targets: DeliveryTarget[] = [];
    const delivery: Delivery = {
      async send(target) {
        targets.push(target);
        return target.role === "elder"
          ? { ok: true }
          : {
              ok: false,
              reason: "caregiver blocked the bot",
              retryable: false,
            };
      },
    };

    const result = await deliverSummaryQrToLine(
      {
        subjectId: "subj-father",
        baseUrl: "https://current-medbuddy.vercel.app",
      },
      {
        now: () => NOW,
        renderQr: async () => Uint8Array.from([1]),
        storeQr: async () => ({ url: "https://blob.example.com/qr.png" }),
        delivery,
      },
    );

    expect(result).toEqual({
      ok: true,
      deliveredAt: "2026-07-29T07:30:00.000Z",
      recipients: { elder: true, caregiver: false },
    });
    expect(targets.map(({ channelUserId, role }) => ({ channelUserId, role }))).toEqual([
      { channelUserId: "U-father", role: "elder" },
      { channelUserId: "U-daughter", role: "caregiver" },
    ]);
    expect(console.error).toHaveBeenCalledWith(
      "[medbuddy] caregiver copy of summary QR failed",
      { reason: "caregiver blocked the bot" },
    );
  });
});
