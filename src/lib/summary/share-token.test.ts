import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createShareToken,
  DEFAULT_TTL_MS,
  shareUrl,
  verifyShareToken,
} from "./share-token";

const NOW = Date.parse("2026-07-29T09:00:00Z");

beforeEach(() => {
  process.env.SUMMARY_SHARE_SECRET = "test-secret";
});
afterEach(() => {
  delete process.env.SUMMARY_SHARE_SECRET;
});

describe("minting", () => {
  it("round-trips the subject it was issued for", () => {
    const token = createShareToken("subj-father", NOW)!;
    const result = verifyShareToken(token, NOW + 1000);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.payload.subjectId).toBe("subj-father");
  });

  it("refuses to mint anything without a configured secret", () => {
    // A predictable key would put every subject's record one guess away, so
    // the absence of a secret must stop minting rather than fall back.
    delete process.env.SUMMARY_SHARE_SECRET;
    expect(createShareToken("subj-father", NOW)).toBeNull();
  });
});

describe("what the check rejects", () => {
  it("a token whose body was edited to name another person", () => {
    // The attack this exists for: swap the subject, keep the signature.
    const token = createShareToken("subj-father", NOW)!;
    const [body, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    decoded.subjectId = "subj-mother";
    const forged = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;

    const result = verifyShareToken(forged, NOW + 1000);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe("bad_signature");
  });

  it("a token whose expiry was pushed out", () => {
    const token = createShareToken("subj-father", NOW)!;
    const [body, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    decoded.expiresAt = NOW + 365 * 24 * 60 * 60 * 1000;
    const forged = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;

    expect(verifyShareToken(forged, NOW + 1000).valid).toBe(false);
  });

  it("a token signed with a different secret", () => {
    const token = createShareToken("subj-father", NOW)!;
    process.env.SUMMARY_SHARE_SECRET = "a-different-secret";
    const result = verifyShareToken(token, NOW + 1000);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe("bad_signature");
  });

  it("a token that has aged out", () => {
    // A screenshot taken during the appointment is useless the next day.
    const token = createShareToken("subj-father", NOW)!;
    const result = verifyShareToken(token, NOW + DEFAULT_TTL_MS + 1);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe("expired");
  });

  it("garbage, without throwing", () => {
    for (const junk of ["", "no-dot", "a.b.c", "....", "%%%.%%%"]) {
      expect(verifyShareToken(junk, NOW).valid).toBe(false);
    }
  });

  it("reports a forged expired token as forged, not as stale", () => {
    // "Expired" invites a refresh; this one was never validly signed and no
    // refresh is the answer.
    const expired = createShareToken("subj-father", NOW - DEFAULT_TTL_MS - 1000)!;
    process.env.SUMMARY_SHARE_SECRET = "a-different-secret";
    const result = verifyShareToken(expired, NOW);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toBe("bad_signature");
  });
});

describe("still valid right up to the boundary", () => {
  it("accepts one millisecond before expiry and rejects at it", () => {
    const token = createShareToken("subj-father", NOW)!;
    expect(verifyShareToken(token, NOW + DEFAULT_TTL_MS - 1).valid).toBe(true);
    expect(verifyShareToken(token, NOW + DEFAULT_TTL_MS).valid).toBe(false);
  });

  it("lasts long enough for a three-hour wait and a pharmacy queue", () => {
    expect(DEFAULT_TTL_MS).toBeGreaterThanOrEqual(6 * 60 * 60 * 1000);
    // And not so long that a photograph stays useful for days.
    expect(DEFAULT_TTL_MS).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});

describe("the URL", () => {
  it("puts the token in the path and escapes it", () => {
    const url = shareUrl("https://medbuddy-app.vercel.app/summary", "a.b+c/d");
    expect(url).toBe("https://medbuddy-app.vercel.app/summary/s/a.b%2Bc%2Fd");
  });

  it("does not double a trailing slash", () => {
    expect(shareUrl("https://x.test/summary/", "t")).toBe("https://x.test/summary/s/t");
  });

  it("never contains the subject id", () => {
    // The whole reason the token exists: /summary/subj-father would be
    // guessable, and a QR code is photographable.
    const token = createShareToken("subj-father", NOW)!;
    expect(shareUrl("https://x.test/summary", token)).not.toContain("subj-father");
  });
});
