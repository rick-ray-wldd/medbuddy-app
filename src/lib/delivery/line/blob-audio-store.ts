import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { AUDIO_URL_TTL_MS, buildSignedAudioUrl } from "./audio-url";
import type { AudioStore, HostedAudio } from "./audio";

/**
 * AudioStore backed by Vercel Blob with PRIVATE access. The blob itself is
 * never publicly reachable; LINE fetches through the HMAC-signed, short-lived
 * URL served by src/app/api/line/audio/[key]/route.ts (health information —
 * spec §7). Requires env: BLOB_READ_WRITE_TOKEN (provisioned by the Blob
 * store), AUDIO_PUBLIC_BASE_URL, AUDIO_URL_SIGNING_SECRET.
 */

export const AUDIO_BLOB_PREFIX = "line-audio/";

type PutImpl = typeof put;

export class BlobAudioStore implements AudioStore {
  private readonly putImpl: PutImpl;

  constructor(deps: { putImpl?: PutImpl } = {}) {
    this.putImpl = deps.putImpl ?? put;
  }

  async put(bytes: Uint8Array, format: "m4a" | "mp3"): Promise<HostedAudio> {
    const baseUrl = process.env.AUDIO_PUBLIC_BASE_URL;
    const secret = process.env.AUDIO_URL_SIGNING_SECRET;
    if (!baseUrl || !secret) {
      // §6.6 fail loudly — never run half-configured.
      throw new Error(
        "line-adapter: AUDIO_PUBLIC_BASE_URL and AUDIO_URL_SIGNING_SECRET must be set",
      );
    }

    const key = `${randomUUID()}.${format}`;
    await this.putImpl(`${AUDIO_BLOB_PREFIX}${key}`, Buffer.from(bytes), {
      access: "private",
      contentType: format === "m4a" ? "audio/mp4" : "audio/mpeg",
    });

    const expiresAtMs = Date.now() + AUDIO_URL_TTL_MS;
    return {
      url: buildSignedAudioUrl(baseUrl, key, expiresAtMs, secret),
      expiresAt: new Date(expiresAtMs),
    };
  }
}
