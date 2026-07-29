/**
 * Serve the clinician-summary QR image.
 *
 * ## Why this route exists rather than a public blob
 *
 * LINE renders an image message by fetching the URL, so it must be reachable
 * without credentials. The first version stored the PNG with
 * `access: "public"` and the store refused — it is configured private, and
 * that is the right configuration for a store holding medication logs.
 *
 * So the blob stays private and this route is the public surface. The
 * difference matters: a public blob is reachable by anyone who guesses the
 * path, forever. This is reachable only with a token that carries an HMAC and
 * an expiry, and it verifies both before reading anything.
 *
 * ## The token is the authorisation
 *
 * It is the same token the QR encodes, so this route grants exactly what
 * scanning the QR already grants — no more. An expired token gets 404 rather
 * than 403: the difference between "wrong" and "too late" is not something a
 * stranger needs told.
 */

import { verifyShareToken } from "@/lib/summary/share-token";
import { summaryQrPath } from "@/lib/summary/qr-path";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: raw } = await params;
  // The .png suffix is for LINE, which inspects the URL before the response.
  const token = raw.replace(/\.png$/, "");

  const verified = verifyShareToken(token, Date.now());
  if (!verified.valid) return new Response(null, { status: 404 });

  try {
    const { list, get } = await import("@vercel/blob");
    const pathname = summaryQrPath(token);
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const found = blobs.find((b) => b.pathname === pathname);
    if (!found) return new Response(null, { status: 404 });

    const res = await get(found.url, { access: "private" });
    if (!res || res.statusCode !== 200) return new Response(null, { status: 404 });

    const bytes = new Uint8Array(await new Response(res.stream).arrayBuffer());
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        // Cacheable for the token's life and no longer: the image is a
        // picture of the token, so it dies with it.
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch (err) {
    console.error("[medbuddy] summary QR read failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return new Response(null, { status: 404 });
  }
}
