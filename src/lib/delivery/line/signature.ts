import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook signature (spec §7): `X-Line-Signature` = base64 of HMAC-SHA256 over
 * the RAW request body using the channel secret.
 *
 * MUST be computed over the raw body exactly as received — never over
 * re-serialised JSON (a parser round-trip changes bytes). Callers reject
 * mismatches with 401.
 *
 * VERIFIED 2026-07-28 against current LINE docs — scheme unchanged: header
 * `x-line-signature`, base64 of HMAC-SHA256 over the raw UTF-8 body with the
 * channel secret as key.
 * https://developers.line.biz/en/reference/messaging-api/#signature-validation
 */
export function verifyLineSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  channelSecret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", channelSecret)
    .update(rawBody, "utf8")
    .digest();
  const provided = Buffer.from(signatureHeader, "base64");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
