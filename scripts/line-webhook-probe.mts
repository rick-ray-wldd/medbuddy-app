/**
 * Send a correctly-signed LINE webhook to a running instance, without LINE.
 *
 *   npm run dev                      # in one terminal
 *   npm run probe:line               # in another
 *
 * The point is to exercise the real route — raw body read, signature verified
 * over those exact bytes, event normalised — before any LINE channel exists.
 * A bot that only works once credentials arrive is a bot nobody has tested.
 *
 * It signs with whatever LINE_CHANNEL_SECRET is set, defaulting to a throwaway,
 * so it also demonstrates the failure path: change one byte of the body and the
 * same request must be rejected.
 */

import { createHmac } from "node:crypto";

const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.LINE_CHANNEL_SECRET ?? "probe-secret";
const URL = `${BASE}/api/line/webhook`;

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

async function post(label: string, body: string, signature: string | null) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "x-line-signature": signature } : {}),
    },
    body,
  });
  const expected = label.startsWith("✓") ? "2xx" : "rejected";
  console.log(`  ${res.status}  ${label}   (expected ${expected})`);
  return res.status;
}

function event(kind: "text" | "audio", messageId: string) {
  const base = {
    type: "message",
    replyToken: "probe-reply-token",
    source: { type: "user", userId: "Uprobe0000000000000000000000000000" },
    timestamp: 1_780_000_000_000,
    mode: "active",
  };
  const message =
    kind === "text"
      ? { id: messageId, type: "text", text: "這顆白色的是幹嘛的?" }
      : { id: messageId, type: "audio", duration: 3200, contentProvider: { type: "line" } };
  return JSON.stringify({ destination: "Uprobe", events: [{ ...base, message }] });
}

async function main() {
  console.log(`probing ${URL}\n`);

  console.log("signature");
  const good = event("text", "probe-msg-1");
  await post("✓ valid signature", good, sign(good, SECRET));
  await post("✗ wrong signature", good, sign(good, "not-the-secret"));
  await post("✗ no signature header", good, null);
  // The signature is over raw bytes: one character of difference must fail.
  await post("✗ body tampered after signing", good.replace("白色", "藍色"), sign(good, SECRET));

  console.log("\nmessage kinds");
  const audio = event("audio", "probe-msg-2");
  await post("✓ audio message", audio, sign(audio, SECRET));
  const sticker = JSON.stringify({
    destination: "Uprobe",
    events: [
      {
        type: "message",
        replyToken: "t",
        source: { type: "user", userId: "Uprobe0000000000000000000000000000" },
        timestamp: 1_780_000_000_000,
        message: { id: "probe-msg-3", type: "sticker", packageId: "1", stickerId: "1" },
      },
    ],
  });
  await post("✓ unsupported kind is acknowledged, not actioned", sticker, sign(sticker, SECRET));

  console.log("\nidempotency — LINE retries on non-2xx");
  const repeated = event("text", "probe-msg-repeat");
  await post("✓ first delivery", repeated, sign(repeated, SECRET));
  await post("✓ same message id again", repeated, sign(repeated, SECRET));
  console.log("     (check the dev-server log: handleInbound should appear once)");

  console.log(
    "\nhandleInbound is still a stub, so nothing happens downstream — that is\n" +
      "the honest state of the integration, not a probe failure.",
  );
}

main().catch((e) => {
  console.error(`\ncould not reach ${URL} — is \`npm run dev\` running?\n`, e);
  process.exit(1);
});
