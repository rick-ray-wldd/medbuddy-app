import { createHash } from "node:crypto";

/**
 * Every signed share token gets a unique public asset name without putting the
 * bearer token itself in Blob metadata or logs. Hashing the full token also
 * avoids the old collision where its first 24 base64 characters were identical
 * for every summary belonging to the same subject.
 */
export function summaryQrPath(token: string): string {
  const digest = createHash("sha256").update(token, "utf8").digest("hex").slice(0, 40);
  return `summary-qr/${digest}.png`;
}
