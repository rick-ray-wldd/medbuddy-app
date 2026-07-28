import { containsLink, type DeliveryResult, type DeliveryTarget } from "../types";
import { LIMITS } from "./config";

type Refusal = Extract<DeliveryResult, { ok: false }>;

/**
 * §6.5 — every message names whose medications it is about; never send a bare
 * finding. Upstream puts the name in `text`; the adapter's obligation is to
 * REFUSE when `subject` is missing or empty rather than send unattributed.
 */
export function validateSubject(target: DeliveryTarget): Refusal | null {
  const id = target?.subject?.id?.trim();
  const name = target?.subject?.displayName?.trim();
  if (!id || !name) {
    return { ok: false, reason: "missing-subject", retryable: false };
  }
  return null;
}

/**
 * §6.1 — never send a link to an `elder` target. The elder clicks links
 * carelessly; a message must never train him to tap things in chat.
 *
 * STARTER IMPLEMENTATION — deliberately over-broad. Over-detection is the safe
 * direction here: a blocked message is a missing message (safe per §6.6),
 * while a delivered link is not.
 *
 * TODO(harden):
 *   - decide whether bare domains ("example.com") should also block
 *   - schemes without "//" (e.g. "tel:", "mailto:") — block or allow?
 *   - every new decision gets a test case in __tests__ (§8)
 */
const TAPPABLE_LINK_PATTERNS: readonly RegExp[] = [
  /https?:\/\//i, // http:// or https://
  /\bwww\./i, // www.
  /\b[a-z][a-z0-9+.-]*:\/\//i, // any scheme:// (line://, ftp://, …)
];

export function containsTappableLink(text: string): boolean {
  // Union with Ray's detector at the seam (../types.ts): if either flags it,
  // block. This can only ever OVER-detect relative to each detector alone —
  // the safe direction — and picks up any future hardening of Ray's pattern.
  return containsLink(text) || TAPPABLE_LINK_PATTERNS.some((re) => re.test(text));
}

/**
 * §7 limits — refuse, never truncate. Upstream (Ray) fixes oversize text.
 * VERIFIED 2026-07-28: LINE counts text length in UTF-16 code units, which is
 * exactly what `.length` counts — so this check matches LINE's counting.
 * https://developers.line.biz/en/docs/messaging-api/text-character-count/
 */
export function checkTextLimit(text: string): Refusal | null {
  if (text.length > LIMITS.maxTextChars) {
    return { ok: false, reason: "text-exceeds-line-limit", retryable: false };
  }
  return null;
}
