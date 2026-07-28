import type { FetchedAudio } from "./webhook";

/**
 * Default inbound audio content download (spec §5, §7).
 *
 * Endpoint verified 2026-07-28:
 *   GET https://api-data.line.me/v2/bot/message/{messageId}/content
 * — note the `api-data` host (differs from api.line.me), Bearer auth, response
 * is the raw binary with the format indicated by the response Content-Type.
 * https://developers.line.biz/en/reference/messaging-api/#get-content
 *
 * The bytes are handed off UNTOUCHED — no transcoding, no transcription
 * (spec §5: transcription is a product decision upstream, not transport).
 */

export type AudioContentDeps = {
  channelAccessToken: string;
  /** injectable so the test suite runs fully offline (spec §8) */
  fetchImpl?: typeof fetch;
};

/**
 * Map a response Content-Type to `InboundMessage.format`. Only well-known m4a
 * types are normalised; anything else passes through as the raw content-type
 * string — `format` is a free string (spec §5), so never guess.
 */
export function formatFromContentType(contentType: string | null): string {
  const mime = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (mime === "audio/x-m4a" || mime === "audio/mp4" || mime === "audio/m4a") {
    return "m4a";
  }
  return mime || "unknown";
}

export async function fetchAudioContentFromLine(
  messageId: string,
  deps: AudioContentDeps,
): Promise<FetchedAudio> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${deps.channelAccessToken}` },
    },
  );

  // Verified 2026-07-28: large audio may return 202 while the binary is still
  // being prepared — that is NOT success, so require exactly 200 (res.ok would
  // wrongly accept 202). Callers treat a throw as: log ids/status, ack 200,
  // drop (§6.6 — loud, and never a composed user-facing message).
  if (res.status !== 200) {
    throw new Error(`line-content-download-failed status=${res.status}`);
  }

  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    format: formatFromContentType(res.headers.get("content-type")),
    // The content endpoint does not report duration; the webhook event's
    // `message.duration` takes precedence in webhook.ts anyway.
    durationMs: undefined,
  };
}
