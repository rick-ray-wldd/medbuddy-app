import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleInbound, type InboundMessage } from "../inbound";
import { InMemoryRoleStore } from "../../roles/stores";
import type { Delivery, DeliveryMessage, DeliveryTarget } from "../types";

const AT = "2026-07-28T17:00:00.000Z";

function fakeDelivery() {
  const calls: { target: DeliveryTarget; message: DeliveryMessage }[] = [];
  const delivery: Delivery = {
    async send(target, message) {
      calls.push({ target, message });
      return { ok: true, providerMessageId: "m1" };
    },
  };
  return { delivery, calls };
}

function fakeSetup() {
  const flex: { userId: string }[] = [];
  const links: { userId: string; richMenuId: string }[] = [];
  return {
    flex,
    links,
    setup: {
      async pushFlex(userId: string) {
        flex.push({ userId });
        return { ok: true };
      },
      async linkRichMenu(userId: string, richMenuId: string) {
        links.push({ userId, richMenuId });
        return { ok: true };
      },
    },
  };
}

function msg(body: InboundMessage["body"], userId = "U-someone"): InboundMessage {
  return {
    channelUserId: userId,
    receivedAt: AT,
    providerMessageId: `e-${Math.random()}`,
    body,
  };
}

let store: InMemoryRoleStore;
beforeEach(() => {
  store = new InMemoryRoleStore();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.LINE_RICH_MENU_ELDER_ID = "rm-elder";
  process.env.LINE_RICH_MENU_CAREGIVER_ID = "rm-caregiver";
});
afterEach(() => {
  delete process.env.LINE_RICH_MENU_ELDER_ID;
  delete process.env.LINE_RICH_MENU_CAREGIVER_ID;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("adding the bot", () => {
  it("asks who is holding the phone, once", async () => {
    const { setup, flex } = fakeSetup();
    await handleInbound(msg({ kind: "follow" }), { roleStore: store, setup });
    expect(flex).toEqual([{ userId: "U-someone" }]);
  });
});

describe("answering the card", () => {
  it("binds the role and links that role's menu", async () => {
    const { setup, links } = fakeSetup();
    await handleInbound(
      msg({ kind: "postback", data: "action=bind&role=caregiver" }, "U-daughter"),
      { roleStore: store, setup },
    );

    expect(await store.get("U-daughter")).toMatchObject({ role: "caregiver" });
    expect(links).toEqual([{ userId: "U-daughter", richMenuId: "rm-caregiver" }]);
  });

  it("gives the elder the elder menu", async () => {
    const { setup, links } = fakeSetup();
    await handleInbound(
      msg({ kind: "postback", data: "action=bind&role=elder" }, "U-father"),
      { roleStore: store, setup },
    );
    expect(links).toEqual([{ userId: "U-father", richMenuId: "rm-elder" }]);
  });

  it("always records either phone against the one demo subject", async () => {
    vi.stubEnv("LINE_DEMO_SUBJECT_ID", "subj-father");
    vi.stubEnv("LINE_USER_SUBJECT_MAP", "U-daughter:subj-mother");
    const { setup } = fakeSetup();

    await handleInbound(
      msg({ kind: "postback", data: "action=bind&role=caregiver" }, "U-daughter"),
      { roleStore: store, setup },
    );

    expect(await store.get("U-daughter")).toMatchObject({
      role: "caregiver",
      subjectId: "subj-father",
    });
  });

  it("does not let a third phone take a configured demo role", async () => {
    vi.stubEnv("LINE_DEMO_ELDER_USER_ID", "U-father");
    vi.stubEnv("LINE_DEMO_CAREGIVER_USER_ID", "U-daughter");
    const { setup, links } = fakeSetup();

    await handleInbound(
      msg({ kind: "postback", data: "action=bind&role=elder" }, "U-third-phone"),
      { roleStore: store, setup },
    );

    expect(await store.get("U-third-phone")).toBeNull();
    expect(links).toEqual([]);
  });

  it("refuses a crafted postback that would move an elder to the caregiver menu", async () => {
    // The surface this protects: what the family wrote about him, in their
    // words, without his being asked.
    const { setup, links } = fakeSetup();
    await handleInbound(
      msg({ kind: "postback", data: "action=bind&role=elder" }, "U-father"),
      { roleStore: store, setup },
    );
    links.length = 0;

    await handleInbound(
      msg({ kind: "postback", data: "action=bind&role=caregiver" }, "U-father"),
      { roleStore: store, setup },
    );

    expect(links).toEqual([]); // no menu swap
    expect(await store.get("U-father")).toMatchObject({ role: "elder" });
  });
});

describe("the same sentence, two meanings", () => {
  it("from an elder it is a question, and gets an explanation back", async () => {
    const { delivery, calls } = fakeDelivery();
    const { setup } = fakeSetup();
    await store.put({
      channelUserId: "U-father",
      role: "elder",
      subjectId: "subj-father",
      boundAt: AT,
    });

    await handleInbound(msg({ kind: "text", text: "普拿疼膜衣錠500毫克" }, "U-father"), {
      roleStore: store,
      delivery,
      setup,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].target.role).toBe("elder");
    expect(calls[0].message.text.length).toBeGreaterThan(0);
  });

  it("from a caregiver it is an observation, and gets no explanation back", async () => {
    // A reply here would be the product answering a note as though it were a
    // question — and it would put clinical text in front of the wrong act.
    const { delivery, calls } = fakeDelivery();
    const { setup } = fakeSetup();
    await store.put({
      channelUserId: "U-daughter",
      role: "caregiver",
      subjectId: "subj-father",
      boundAt: AT,
    });

    await handleInbound(
      msg({ kind: "text", text: "他最近也比較常喝酒" }, "U-daughter"),
      { roleStore: store, delivery, setup },
    );

    expect(calls).toHaveLength(0);
  });
});

describe("an unbound sender", () => {
  it("gets the card rather than an answer", async () => {
    // Never a guessed subject (§6.5): a clinical answer in front of the wrong
    // person is the worst error available here.
    const { delivery, calls } = fakeDelivery();
    const { setup, flex } = fakeSetup();

    await handleInbound(msg({ kind: "text", text: "普拿疼" }, "U-stranger"), {
      roleStore: store,
      delivery,
      setup,
    });

    expect(calls).toHaveLength(0);
    expect(flex).toEqual([{ userId: "U-stranger" }]);
  });
});

describe("menu presses", () => {
  beforeEach(async () => {
    await store.put({
      channelUserId: "U-father",
      role: "elder",
      subjectId: "subj-father",
      boundAt: AT,
    });
  });

  it("這顆是什麼 explains how to ask, and names no medicine", async () => {
    const { delivery, calls } = fakeDelivery();
    const { setup } = fakeSetup();
    await handleInbound(msg({ kind: "postback", data: "action=how_to_ask" }, "U-father"), {
      roleStore: store,
      delivery,
      setup,
    });

    expect(calls).toHaveLength(1);
    const text = calls[0].message.text;
    // Furniture, not content: it would read identically to someone taking
    // nothing at all.
    for (const medicine of ["普拿疼", "紅麴", "ASPIRIN", "毫克"]) {
      expect(text).not.toContain(medicine);
    }
  });

  it("找家人 reaches the one configured caregiver phone", async () => {
    vi.stubEnv("LINE_DEMO_CAREGIVER_USER_ID", "U-daughter");
    const { delivery, calls } = fakeDelivery();
    const { setup } = fakeSetup();

    await handleInbound(
      msg({ kind: "postback", data: "action=reach_family" }, "U-father"),
      { roleStore: store, delivery, setup },
    );

    expect(calls.map((call) => call.target.channelUserId)).toEqual([
      "U-daughter",
      "U-father",
    ]);
    expect(calls[0].target.role).toBe("caregiver");
  });

  it("an unrecognised press says nothing", async () => {
    const { delivery, calls } = fakeDelivery();
    const { setup } = fakeSetup();
    await handleInbound(
      msg({ kind: "postback", data: "action=definitely_not_a_thing" }, "U-father"),
      { roleStore: store, delivery, setup },
    );
    expect(calls).toHaveLength(0);
  });

  it("does not let an elder invoke a caregiver-only menu action", async () => {
    const { delivery, calls } = fakeDelivery();
    const { setup } = fakeSetup();

    await handleInbound(
      msg({ kind: "postback", data: "action=subjects" }, "U-father"),
      { roleStore: store, delivery, setup },
    );

    expect(calls).toHaveLength(0);
  });

  it("切換身分 re-asks rather than switching silently", async () => {
    const { setup, flex } = fakeSetup();
    await handleInbound(msg({ kind: "postback", data: "action=rebind" }, "U-father"), {
      roleStore: store,
      setup,
    });
    expect(flex).toEqual([{ userId: "U-father" }]);
    // And the binding is untouched until the card is answered.
    expect(await store.get("U-father")).toMatchObject({ role: "elder" });
  });
});

describe("a voice message", () => {
  it("is recorded and never answered", async () => {
    const { delivery, calls } = fakeDelivery();
    const { setup } = fakeSetup();
    await store.put({
      channelUserId: "U-father",
      role: "elder",
      subjectId: "subj-father",
      boundAt: AT,
    });

    await handleInbound(
      msg(
        { kind: "audio", audio: new Uint8Array([1, 2, 3]), format: "m4a", durationMs: 1200 },
        "U-father",
      ),
      { roleStore: store, delivery, setup },
    );

    // Until STT is a product decision, answering would mean guessing.
    expect(calls).toHaveLength(0);
  });
});
