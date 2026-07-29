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

  it("restores the saved rich menu instead of asking an already-bound phone again", async () => {
    await store.put({
      channelUserId: "U-father",
      role: "elder",
      subjectId: "subj-father",
      boundAt: AT,
    });
    const { setup, flex, links } = fakeSetup();

    await handleInbound(msg({ kind: "follow" }, "U-father"), {
      roleStore: store,
      setup,
    });

    expect(flex).toEqual([]);
    expect(links).toEqual([{ userId: "U-father", richMenuId: "rm-elder" }]);
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

  it("cannot use a legacy subject map once the two demo phones are allowlisted", async () => {
    vi.stubEnv("LINE_DEMO_ELDER_USER_ID", "U-father");
    vi.stubEnv("LINE_DEMO_CAREGIVER_USER_ID", "U-daughter");
    vi.stubEnv("LINE_USER_SUBJECT_MAP", "U-stranger:subj-father");
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
    vi.stubEnv("LINE_DEMO_ELDER_USER_ID", "U-father");
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

  it("rejects a stale binding that belongs to neither configured demo phone", async () => {
    vi.stubEnv("LINE_DEMO_ELDER_USER_ID", "U-father");
    vi.stubEnv("LINE_DEMO_CAREGIVER_USER_ID", "U-daughter");
    await store.put({
      channelUserId: "U-old-demo-phone",
      role: "elder",
      subjectId: "subj-father",
      boundAt: AT,
    });
    const { delivery, calls } = fakeDelivery();
    const { setup } = fakeSetup();

    await handleInbound(
      msg({ kind: "postback", data: "action=my_meds" }, "U-old-demo-phone"),
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

describe("switching role from the menu, end to end", () => {
  beforeEach(() => {
    vi.stubEnv("MEDBUDDY_ALLOW_ROLE_SWITCH", "true");
    // Neither demo id configured — one phone walking through both sides.
    //
    // `getDemoLinePair` insists on both ids or neither, and refuses to accept
    // the same id twice, so there are exactly two shapes: two named phones
    // each locked to a role, or an open channel where any phone may hold
    // either. A single phone demonstrating both is the second shape, and the
    // cost is stated rather than hidden — with no ids configured, any phone
    // that finds the bot can bind. That is acceptable for a demo channel and
    // is not acceptable for real families, which is the same line
    // MEDBUDDY_ALLOW_ROLE_SWITCH draws.
    vi.stubEnv("LINE_DEMO_ELDER_USER_ID", "");
    vi.stubEnv("LINE_DEMO_CAREGIVER_USER_ID", "");
  });

  it("切換身分 sends the card, and answering it relinks the other menu", async () => {
    const { setup, flex, links } = fakeSetup();

    // Bound as elder, on the elder menu.
    await handleInbound(
      msg({ kind: "postback", data: "action=bind&role=elder" }, "U-father"),
      { roleStore: store, setup },
    );
    expect(links.at(-1)).toEqual({ userId: "U-father", richMenuId: "rm-elder" });

    // Presses 切換身分 → the card comes back.
    await handleInbound(msg({ kind: "postback", data: "action=rebind" }, "U-father"), {
      roleStore: store,
      setup,
    });
    expect(flex.at(-1)).toEqual({ userId: "U-father" });

    // Answers 我是照顧者 → binding moves and the caregiver menu is linked.
    await handleInbound(
      msg({ kind: "postback", data: "action=bind&role=caregiver" }, "U-father"),
      { roleStore: store, setup },
    );
    expect(await store.get("U-father")).toMatchObject({ role: "caregiver" });
    expect(links.at(-1)).toEqual({ userId: "U-father", richMenuId: "rm-caregiver" });
  });

  it("rebind stays reachable even from a menu that is already wrong", async () => {
    // 切換身分 is handled before the role/action whitelist, because a menu
    // showing the wrong role is exactly when the escape hatch is needed.
    const { setup, flex } = fakeSetup();
    await store.put({
      channelUserId: "U-father",
      role: "elder",
      subjectId: "subj-father",
      boundAt: AT,
    });

    await handleInbound(msg({ kind: "postback", data: "action=rebind" }, "U-father"), {
      roleStore: store,
      setup,
    });
    expect(flex).toHaveLength(1);
  });
});

describe("actions the two menus now carry", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_DEMO_ELDER_USER_ID", "U-father");
    vi.stubEnv("LINE_DEMO_CAREGIVER_USER_ID", "U-daughter");
  });

  it("用藥提醒 says there is no schedule rather than inventing one", async () => {
    // The hazard this avoids: 「早上一顆、晚上一顆」 assembled from nothing is
    // the product writing a prescription, and he would follow it.
    const { delivery, calls } = fakeDelivery();
    const { setup } = fakeSetup();
    await store.put({
      channelUserId: "U-father",
      role: "elder",
      subjectId: "subj-father",
      boundAt: AT,
    });

    await handleInbound(msg({ kind: "postback", data: "action=schedule" }, "U-father"), {
      roleStore: store,
      delivery,
      setup,
    });

    expect(calls).toHaveLength(1);
    const text = calls[0].message.text;
    expect(text).toContain("還沒");
    // No time of day, no count, no meal relation — nothing that could be
    // mistaken for an instruction.
    for (const invented of ["早上", "中午", "晚上", "睡前", "一顆", "兩顆"]) {
      expect(text, invented).not.toContain(invented);
    }
  });

  it("紀錄用藥 answers that bag OCR is not open yet", async () => {
    const { delivery, calls } = fakeDelivery();
    const { setup } = fakeSetup();
    await store.put({
      channelUserId: "U-daughter",
      role: "caregiver",
      subjectId: "subj-father",
      boundAt: AT,
    });

    await handleInbound(msg({ kind: "postback", data: "action=log_meds" }, "U-daughter"), {
      roleStore: store,
      delivery,
      setup,
    });

    // A press that produces nothing reads as the user's own mistake.
    expect(calls).toHaveLength(1);
    expect(calls[0].message.text).toContain("還沒開放");
  });

  it("an elder may generate the summary QR himself", async () => {
    // The caregiver may have forgotten and he is already in the room.
    const { setup } = fakeSetup();
    await store.put({
      channelUserId: "U-father",
      role: "elder",
      subjectId: "subj-father",
      boundAt: AT,
    });

    // Reaches the handler rather than being refused by the role whitelist;
    // delivery itself needs network, so only the absence of a refusal is
    // asserted here.
    const errors: unknown[][] = [];
    vi.mocked(console.error).mockImplementation((...args) => void errors.push(args));

    await handleInbound(msg({ kind: "postback", data: "action=summary" }, "U-father"), {
      roleStore: store,
      setup,
    });

    const refused = errors.some((e) => String(e[0]).includes("outside bound role"));
    expect(refused).toBe(false);
  });
});
