/**
 * Short-lived signed tokens for the clinician's view of a summary.
 *
 * The distribution channel for the one-pager is the family: the older adult
 * carries it into the room and shows it. As a QR code that means the encoded
 * URL is, for a few hours, the only thing standing between a photograph of his
 * phone screen and a copy of his medication history.
 *
 * So the URL is not `/summary/<subjectId>`. It is a token that names the
 * subject, expires, and is signed — anyone can read it, nobody can forge one
 * or extend one, and it stops working the same day.
 *
 * Pure functions over Node crypto: no store, no state, nothing to keep in sync.
 * The cost is that a token cannot be revoked before it expires, which is why
 * the window is hours rather than days.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Long enough to cover a three-hour wait, a consultation, and a pharmacy
 * queue. Short enough that a screenshot taken today is useless tomorrow.
 */
export const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

export type ShareTokenPayload = {
  subjectId: string;
  /** Epoch millis. */
  expiresAt: number;
};

export type TokenVerification =
  | { valid: true; payload: ShareTokenPayload }
  | { valid: false; reason: "malformed" | "bad_signature" | "expired" };

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * The signing key.
 *
 * Deliberately not defaulted to a constant. A build with no secret configured
 * must refuse to mint tokens rather than mint ones anybody could forge — a
 * predictable key here would mean any subject's record is one guess away.
 */
function signingKey(): string | null {
  return process.env.SUMMARY_SHARE_SECRET?.trim() || null;
}

function sign(body: string, key: string): string {
  return b64url(createHmac("sha256", key).update(body).digest());
}

export function createShareToken(
  subjectId: string,
  now: number,
  ttlMs: number = DEFAULT_TTL_MS,
): string | null {
  const key = signingKey();
  if (!key) return null;
  const body = b64url(JSON.stringify({ subjectId, expiresAt: now + ttlMs }));
  return `${body}.${sign(body, key)}`;
}

export function verifyShareToken(token: string, now: number): TokenVerification {
  const key = signingKey();
  if (!key) return { valid: false, reason: "bad_signature" };

  const [body, signature] = token.split(".");
  if (!body || !signature) return { valid: false, reason: "malformed" };

  const expected = sign(body, key);
  // Constant-time: a token check that leaks timing leaks the signature.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload: ShareTokenPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8")) as ShareTokenPayload;
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (typeof payload.subjectId !== "string" || typeof payload.expiresAt !== "number") {
    return { valid: false, reason: "malformed" };
  }

  // Signature checked before expiry on purpose: an expired token that was
  // never validly signed is forged, not stale, and should not be reported as
  // something a refresh would fix.
  if (payload.expiresAt <= now) return { valid: false, reason: "expired" };

  return { valid: true, payload };
}

export function shareUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/s/${encodeURIComponent(token)}`;
}
