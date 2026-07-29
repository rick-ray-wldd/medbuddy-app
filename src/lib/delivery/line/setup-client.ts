/**
 * LINE calls that set up the *interface*, as opposed to delivering content.
 *
 * ## Why this is not in LineDelivery
 *
 * `LineDelivery` is the seam for things the pipeline produced: it sends `text`
 * verbatim, refuses to alter it, and refuses to send an elder a link. Every one
 * of those rules exists because the payload is a medication explanation.
 *
 * Nothing here carries a medication explanation. Linking a rich menu and
 * pushing the role card are plumbing — the card asks which of two people is
 * holding the phone, and the menu is furniture. Routing them through the
 * content seam would mean relaxing that seam's rules (Flex is not `text`), and
 * a seam with an exception is not a seam.
 *
 * Endpoints verified 2026-07-28 against
 * https://developers.line.biz/en/reference/messaging-api/
 */

import type { FlexMessage } from "./role-card";
import type { RichMenuDefinition } from "./rich-menu";

const API = "https://api.line.me/v2/bot";
const DATA_API = "https://api-data.line.me/v2/bot";

export type SetupClientDeps = {
  channelAccessToken: string;
  fetchImpl?: typeof fetch;
};

export type SetupResult = { ok: true } | { ok: false; reason: string };

export class LineSetupClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(deps: SetupClientDeps) {
    this.token = deps.channelAccessToken;
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  private headers(contentType = "application/json"): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": contentType,
    };
  }

  /** Push a Flex message. Used for exactly one thing: the role card. */
  async pushFlex(channelUserId: string, message: FlexMessage): Promise<SetupResult> {
    const res = await this.fetchImpl(`${API}/message/push`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ to: channelUserId, messages: [message] }),
    });
    if (!res.ok) {
      // Body may carry LINE's reason; ids and status only in the log.
      return { ok: false, reason: `push failed ${res.status}` };
    }
    return { ok: true };
  }

  /**
   * Attach a menu to one user.
   *
   * This is the whole mechanism behind "one bot, two interfaces": the menu is a
   * property of the user, so the elder and his daughter open the same channel
   * and find different furniture.
   */
  async linkRichMenu(channelUserId: string, richMenuId: string): Promise<SetupResult> {
    const res = await this.fetchImpl(
      `${API}/user/${encodeURIComponent(channelUserId)}/richmenu/${encodeURIComponent(richMenuId)}`,
      { method: "POST", headers: this.headers() },
    );
    if (!res.ok) return { ok: false, reason: `link failed ${res.status}` };
    return { ok: true };
  }

  // ── Registration. Run once from scripts/register-rich-menus.mts, not at
  //    request time: creating a menu on every cold start would leak menus.

  async createRichMenu(definition: RichMenuDefinition): Promise<string> {
    const res = await this.fetchImpl(`${API}/richmenu`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(definition),
    });
    if (!res.ok) {
      throw new Error(`create rich menu failed ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { richMenuId?: string };
    if (!body.richMenuId) throw new Error("create rich menu returned no id");
    return body.richMenuId;
  }

  /** Image upload goes to the api-data host, not api — a easy 404 to chase. */
  async uploadRichMenuImage(richMenuId: string, png: Uint8Array): Promise<void> {
    const res = await this.fetchImpl(
      `${DATA_API}/richmenu/${encodeURIComponent(richMenuId)}/content`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "image/png",
        },
        body: png as unknown as BodyInit,
      },
    );
    if (!res.ok) {
      throw new Error(`upload rich menu image failed ${res.status}: ${await res.text()}`);
    }
  }

  async listRichMenus(): Promise<{ richMenuId: string; name: string }[]> {
    const res = await this.fetchImpl(`${API}/richmenu/list`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`list rich menus failed ${res.status}`);
    const body = (await res.json()) as {
      richmenus?: { richMenuId: string; name: string }[];
    };
    return body.richmenus ?? [];
  }

  async deleteRichMenu(richMenuId: string): Promise<void> {
    const res = await this.fetchImpl(
      `${API}/richmenu/${encodeURIComponent(richMenuId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${this.token}` } },
    );
    if (!res.ok) throw new Error(`delete rich menu failed ${res.status}`);
  }
}
