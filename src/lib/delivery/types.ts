/**
 * Delivery seam.
 *
 * Everything upstream of this file decides *what* to say. Implementations of
 * `Delivery` decide only *how it travels*. An adapter that inspects medication
 * data, calls a model, or rewrites `text` has crossed the seam.
 *
 * See docs/LINE-ADAPTER-SPEC.md.
 */

export type DeliveryRole = "elder" | "caregiver";

export type DeliveryTarget = {
  /** Opaque per-channel recipient id. For LINE, the userId. */
  channelUserId: string;
  /**
   * Does not influence content — content is settled upstream — but does gate
   * the constraints an adapter must enforce. Notably: an `elder` target must
   * never receive a link.
   */
  role: DeliveryRole;
};

export type SpeechPayload = {
  /** Already synthesised upstream. Adapters transcode, never re-synthesise. */
  audio: Uint8Array;
  format: "mp3" | "wav" | "m4a";
  /** LINE requires an explicit duration and will not compute one. */
  durationMs: number;
};

export type DeliveryMessage = {
  /**
   * Written for this recipient upstream. Adapters send it verbatim: no
   * greeting, no emoji, no appended link, no truncation. If it cannot be sent
   * as-is, fail rather than alter it — a medication explanation that arrives
   * altered is worse than one that does not arrive.
   */
  text: string;
  /** When present, also deliver as speech. */
  speech?: SpeechPayload;
};

export type DeliveryResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; reason: string; retryable: boolean };

export interface Delivery {
  send(
    target: DeliveryTarget,
    message: DeliveryMessage,
  ): Promise<DeliveryResult>;
}

/** A message bound for an elder must not teach them to tap links. */
const URL_PATTERN = /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]{2,}/i;

export function containsLink(text: string): boolean {
  return URL_PATTERN.test(text);
}
