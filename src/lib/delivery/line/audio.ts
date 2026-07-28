/**
 * Audio-out seam (spec §7). LINE audio messages reference a publicly reachable
 * HTTPS URL plus an explicit duration — they do not accept inline bytes.
 *
 * The audio contains health information → prefer signed, SHORT-LIVED URLs.
 *
 * ⏱ Priority note (spec §9): audio out is the lowest-priority piece. Do not
 * let it destabilise the text path.
 */

export type HostedAudio = {
  /** publicly reachable HTTPS URL LINE can fetch */
  url: string;
  /** when the (signed) URL stops working */
  expiresAt: Date;
};

export interface AudioStore {
  put(bytes: Uint8Array, format: "m4a"): Promise<HostedAudio>;
}

/**
 * TODO(line-adapter): propose real hosting (e.g. Vercel Blob + signed URLs) to
 * the team BEFORE adding any dependency. Until then this stub keeps failures
 * loud (§6.6) instead of silently dropping speech.
 */
export class NotImplementedAudioStore implements AudioStore {
  async put(): Promise<HostedAudio> {
    throw new Error("TODO(line-adapter): AudioStore not implemented yet");
  }
}

/**
 * §7: the format to target is m4a. If upstream hands mp3/wav, transcode HERE
 * and nowhere else — this function is the single isolation point.
 *
 * If a real transcoder proves too heavy for serverless in the time left, the
 * adapter must return { ok:false, reason } for those formats — never ship
 * broken audio, never drop it silently (§6.6).
 */
export async function transcodeToM4a(
  _bytes: Uint8Array,
  _from: "mp3" | "wav",
): Promise<Uint8Array> {
  void _bytes;
  void _from;
  throw new Error("TODO(line-adapter): transcodeToM4a not implemented yet");
}
