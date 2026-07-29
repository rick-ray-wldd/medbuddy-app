/**
 * Send to everyone who has added the bot. Demo only.
 *
 * ## Why this exists, and why it is behind a flag
 *
 * The product addresses one person: a finding attached to the wrong one is the
 * worst error it can make, and every path upstream resolves a recipient before
 * anything is sent. Broadcast is the opposite of that, so it is not a fallback
 * that quietly engages — `MEDBUDDY_DEMO_BROADCAST` has to be set on purpose,
 * and it is set on a channel whose only friends are the people running the
 * demo, holding a seeded fictional subject.
 *
 * ## Everyone gets the elder's message
 *
 * A broadcast does not know who is receiving it. LINE-ADAPTER-SPEC §6.1
 * refuses to send an older adult a link, because he taps links without
 * checking; a caregiver has no such constraint. Not knowing which is which,
 * the safe collapse is to send everyone the shape with no link in it. A
 * caregiver losing a link loses a convenience. An elder gaining one is the
 * thing the rule exists to prevent.
 *
 * ## What it does not do
 *
 * It carries no medication text. The QR is an image of a short-lived signed
 * token, and the sentence beside it says what the picture is and what to do
 * with it — the same words the addressed path uses, which are furniture rather
 * than clinical content.
 *
 * Endpoint verified 2026-07-29 against
 * https://developers.line.biz/en/reference/messaging-api/#send-broadcast-message
 */

const ENDPOINT = "https://api.line.me/v2/bot/message/broadcast";

export type BroadcastResult = { ok: true } | { ok: false; reason: string };

export function demoBroadcastEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.MEDBUDDY_DEMO_BROADCAST?.trim() === "true";
}

export async function broadcastImage(
  params: {
    channelAccessToken: string;
    text: string;
    imageUrl: string;
  },
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<BroadcastResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  // The text is refused rather than stripped if it carries a link: a broadcast
  // may reach an older adult, and silently editing a message is the one thing
  // the delivery seam never does.
  if (/\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]{2,}/i.test(params.text)) {
    return { ok: false, reason: "broadcast text must not contain a link" };
  }

  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.channelAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { type: "text", text: params.text },
          {
            type: "image",
            originalContentUrl: params.imageUrl,
            previewImageUrl: params.imageUrl,
          },
        ],
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "broadcast request failed",
    };
  }

  if (!res.ok) return { ok: false, reason: `broadcast failed ${res.status}` };
  return { ok: true };
}
