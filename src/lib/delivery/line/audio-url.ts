import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, short-lived URLs for outbound audio (spec §7: the audio contains
 * health information — prefer a signed, short-lived URL).
 *
 * The URL LINE fetches looks like:
 *   {AUDIO_PUBLIC_BASE_URL}/api/line/audio/{key}?exp={msEpoch}&sig={base64url}
 * where sig = HMAC-SHA256("{key}:{exp}") with AUDIO_URL_SIGNING_SECRET.
 *
 * Pure functions, offline-testable. The serving route
 * (src/app/api/line/audio/[key]/route.ts) is a thin shell over verify.
 */

/** Default lifetime: long enough for LINE to fetch and the recipient to
 *  listen soon after delivery, short enough to bound exposure. */
export const AUDIO_URL_TTL_MS = 30 * 60 * 1000;

export function signAudioKey(key: string, expiresAtMs: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${key}:${expiresAtMs}`, "utf8")
    .digest("base64url");
}

export function buildSignedAudioUrl(
  baseUrl: string,
  key: string,
  expiresAtMs: number,
  secret: string,
): string {
  const sig = signAudioKey(key, expiresAtMs, secret);
  return `${baseUrl.replace(/\/$/, "")}/api/line/audio/${encodeURIComponent(
    key,
  )}?exp=${expiresAtMs}&sig=${sig}`;
}

/** Constant-time verify; false on expiry, tampering, or malformed input. */
export function verifySignedAudioRequest(
  key: string,
  expParam: string | null,
  sigParam: string | null,
  secret: string,
  nowMs: number,
): boolean {
  if (!expParam || !sigParam) return false;
  const expiresAtMs = Number(expParam);
  if (!Number.isFinite(expiresAtMs) || nowMs > expiresAtMs) return false;
  const expected = Buffer.from(signAudioKey(key, expiresAtMs, secret), "utf8");
  const provided = Buffer.from(sigParam, "utf8");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
