import { get } from "@vercel/blob";
import { verifySignedAudioRequest } from "@/lib/delivery/line/audio-url";
import { AUDIO_BLOB_PREFIX } from "@/lib/delivery/line/blob-audio-store";

/**
 * GET /api/line/audio/{key}?exp=…&sig=… — serves outbound audio to LINE.
 *
 * The audio is health information (spec §7): blobs are PRIVATE and only
 * reachable through this route, which requires a valid HMAC signature and an
 * unexpired timestamp (see src/lib/delivery/line/audio-url.ts). Expired or
 * tampered requests get a status code and NO body — the adapter never
 * composes user-facing content, even in error paths (§6.3/§6.4).
 *
 * Logging rule: key + status only. Never log audio bytes or full signed URLs.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key: rawKey } = await ctx.params;
  const key = decodeURIComponent(rawKey);
  const url = new URL(req.url);

  const secret = process.env.AUDIO_URL_SIGNING_SECRET;
  if (!secret) {
    console.error("[line-adapter] audio route missing AUDIO_URL_SIGNING_SECRET");
    return new Response(null, { status: 500 });
  }

  const valid = verifySignedAudioRequest(
    key,
    url.searchParams.get("exp"),
    url.searchParams.get("sig"),
    secret,
    Date.now(),
  );
  if (!valid) {
    console.error("[line-adapter] audio request rejected", { key, status: 401 });
    return new Response(null, { status: 401 });
  }

  const result = await get(`${AUDIO_BLOB_PREFIX}${key}`, { access: "private" });
  if (!result || result.statusCode !== 200) {
    console.error("[line-adapter] audio blob not found", { key, status: 404 });
    return new Response(null, { status: 404 });
  }

  return new Response(result.stream, {
    status: 200,
    headers: {
      "Content-Type": result.blob.contentType,
      "Content-Length": String(result.blob.size),
      "Cache-Control": "private, no-store",
    },
  });
}
