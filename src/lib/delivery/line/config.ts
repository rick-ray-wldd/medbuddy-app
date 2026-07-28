/**
 * LINE adapter configuration. Env var names come from spec §7 — add them to
 * `.env.example` (see env.example.snippet at the scaffold root; never commit
 * real values).
 */

export type LineConfig = {
  channelSecret: string;
  channelAccessToken: string;
  /** where synthesised audio is served from (spec §7) */
  audioPublicBaseUrl?: string;
};

export function getLineConfig(env: NodeJS.ProcessEnv = process.env): LineConfig {
  const channelSecret = env.LINE_CHANNEL_SECRET;
  const channelAccessToken = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelSecret || !channelAccessToken) {
    // §6.6 fail loudly — never run half-configured.
    throw new Error(
      "line-adapter: LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN must be set",
    );
  }
  return {
    channelSecret,
    channelAccessToken,
    audioPublicBaseUrl: env.AUDIO_PUBLIC_BASE_URL,
  };
}

/**
 * Verified against the LINE Messaging API reference on 2026-07-28 (see the
 * "Drift vs spec §7" section of this module's README for the full log).
 *
 * Spec rule either way: oversize → { ok: false, retryable: false }.
 * NEVER truncate (§7, §6.6).
 */
export const LIMITS = {
  /**
   * Max characters for one text message: 5000, counted in UTF-16 code units
   * (surrogate pairs / many emoji count as 2+) — which is exactly what JS
   * `String.prototype.length` counts, so `text.length` is the right check.
   * https://developers.line.biz/en/reference/messaging-api/#text-message
   */
  maxTextChars: 5000,
  /**
   * ⚠️ ADAPTER-LEVEL cap, NOT a LINE limit: current docs specify NO maximum
   * audio duration (60000 ms appears only as an example value). We keep a
   * conservative cap because a scheduled medication explanation should never
   * be minutes long; raise it deliberately if upstream needs more.
   * https://developers.line.biz/en/reference/messaging-api/#audio-message
   */
  maxAudioDurationMs: 60_000,
  /**
   * Max audio file size for an outbound audio message: 200 MB (LINE limit).
   * The hosted file must be HTTPS (TLS 1.2+), format m4a or mp3.
   * https://developers.line.biz/en/reference/messaging-api/#audio-message
   */
  maxAudioFileBytes: 200 * 1024 * 1024,
} as const;
