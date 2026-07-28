/**
 * Audio-out seam (spec §7). LINE audio messages reference a publicly reachable
 * HTTPS URL plus an explicit duration — they do not accept inline bytes.
 *
 * The audio contains health information → signed, SHORT-LIVED URLs
 * (see audio-url.ts + BlobAudioStore in blob-audio-store.ts).
 */

export type HostedAudio = {
  /** publicly reachable HTTPS URL LINE can fetch */
  url: string;
  /** when the (signed) URL stops working */
  expiresAt: Date;
};

export interface AudioStore {
  /**
   * Format verified 2026-07-28: LINE audio messages accept m4a OR mp3 (spec
   * assumed m4a-only — logged in the README drift section), so both pass
   * through unhosted-untranscoded. wav is refused in LineDelivery.
   * https://developers.line.biz/en/reference/messaging-api/#audio-message
   */
  put(bytes: Uint8Array, format: "m4a" | "mp3"): Promise<HostedAudio>;
}

/** Loud-failing stub kept for tests and as the safe default (§6.6). */
export class NotImplementedAudioStore implements AudioStore {
  async put(): Promise<HostedAudio> {
    throw new Error("line-adapter: AudioStore not implemented");
  }
}

/**
 * wav → m4a transcoding remains unimplemented: no transcoder is feasible for
 * serverless in the hackathon window, so `send()` refuses wav with
 * { ok:false, reason:"unsupported-audio-format" } — a loud refusal over
 * broken audio (§6.6). mp3 no longer needs transcoding (see drift note above).
 */
export async function transcodeToM4a(
  _bytes: Uint8Array,
  _from: "wav",
): Promise<Uint8Array> {
  void _bytes;
  void _from;
  throw new Error("TODO(line-adapter): transcodeToM4a not implemented yet");
}
