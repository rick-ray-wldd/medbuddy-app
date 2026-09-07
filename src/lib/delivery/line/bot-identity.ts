/**
 * Who this bot is to a stranger holding a phone.
 *
 * The channel secret and access token in `config.ts` are how the server proves
 * itself to LINE. This file is the opposite direction: the one public fact a
 * person needs in order to start a conversation at all.
 *
 * ## Why the Basic ID is hard-coded
 *
 * It is not a secret and it is not a runtime decision — it is the permanent
 * public address of the channel whose credentials sit in the environment. It
 * is checked in so the invitation renders on a machine that has no LINE
 * credentials at all, which is the machine a reviewer will be using.
 *
 * Read from `GET https://api.line.me/v2/bot/info` on 2026-07-28, the same way
 * `config.ts` records when its limits were last checked against the reference:
 *
 *     { "basicId": "@134cwbvt", "displayName": "Medbuddy", "chatMode": "bot" }
 *
 * If the deployment is ever pointed at a different channel, this constant must
 * move with it. Nothing can detect that drift offline — the constant and the
 * token are only related through the LINE account they both belong to — so the
 * check is: re-run that endpoint and compare.
 */

/** Public address of the Medbuddy channel. */
export const LINE_BOT_BASIC_ID = "@134cwbvt";

/** The name LINE shows in the add-friend sheet. */
export const LINE_BOT_DISPLAY_NAME = "Medbuddy";

/**
 * The URL an add-friend QR encodes.
 *
 * LINE documents the `@` as percent-encoded. Bare `@` also resolves, but the
 * encoded form is what survives being pasted into places that treat `@`
 * specially, and a QR is scanned by things we do not control.
 */
export function lineAddFriendUrl(basicId: string = LINE_BOT_BASIC_ID): string {
  if (!/^@[a-z0-9]{3,20}$/.test(basicId)) {
    // A malformed ID produces a QR that scans cleanly and lands nowhere, which
    // is the worst possible failure: it looks like it worked.
    throw new Error(`line-bot-identity: not a LINE Basic ID: ${basicId}`);
  }
  return `https://line.me/R/ti/p/${encodeURIComponent(basicId)}`;
}
