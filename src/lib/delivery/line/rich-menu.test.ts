import { describe, expect, it } from "vitest";
import {
  assertNoLinksForElder,
  caregiverRichMenu,
  elderRichMenu,
  ELDER_CELLS,
  CAREGIVER_CELLS,
} from "./rich-menu";
import { roleSelectionCard } from "./role-card";

describe("the elder's menu", () => {
  const menu = elderRichMenu();

  it("contains no link, in any cell", () => {
    // The rule this file enforces: a rich menu cell is a link nailed to the
    // wall, and LINE-ADAPTER-SPEC §6.1 refuses to send him one.
    expect(() => assertNoLinksForElder(menu)).not.toThrow();
    expect(menu.areas.every((a) => a.action.type === "postback")).toBe(true);
  });

  it("is caught if a link is ever added", () => {
    const withLink = elderRichMenu();
    withLink.areas[0].action = { type: "uri", label: "開啟網頁", uri: "https://example.com" };
    expect(() => assertNoLinksForElder(withLink)).toThrow(/must not contain a uri/);
  });

  it("gives four targets, each a thumb wide", () => {
    expect(menu.areas).toHaveLength(4);
    for (const a of menu.areas) {
      expect(a.bounds.width).toBe(1250);
      expect(a.bounds.height).toBe(843);
    }
  });

  it("tiles the menu without gaps or overlaps", () => {
    const covered = menu.areas.reduce((sum, a) => sum + a.bounds.width * a.bounds.height, 0);
    expect(covered).toBe(2500 * 1686);
  });

  it("asks him for nothing", () => {
    // Spec §3: never ask whether he took something, never have him report on
    // himself. Every cell has to give rather than take.
    const labels = ELDER_CELLS.map((c) => `${c.label}${c.sub}`).join(" ");
    for (const taken of ["吃了嗎", "有沒有", "confirm", "回報", "打卡", "連續"]) {
      expect(labels).not.toContain(taken);
    }
  });
});

describe("the caregiver's menu", () => {
  const menu = caregiverRichMenu("https://medbuddy-app.vercel.app");

  it("gives six targets and tiles the menu", () => {
    expect(menu.areas).toHaveLength(6);
    const covered = menu.areas.reduce((sum, a) => sum + a.bounds.width * a.bounds.height, 0);
    // 2500 / 3 floors to 833, so three columns cover 2499 of 2500 px.
    expect(covered).toBe(833 * 3 * 843 * 2);
  });

  it("is allowed exactly one link, and it points at our own base URL", () => {
    const uris = menu.areas.filter((a) => a.action.type === "uri");
    expect(uris).toHaveLength(1);
    expect(uris[0].action.type === "uri" && uris[0].action.uri).toBe(
      "https://medbuddy-app.vercel.app/",
    );
  });

  it("does not offer bag OCR, which is specified and not built", () => {
    expect(CAREGIVER_CELLS.map((c) => c.label)).not.toContain("拍藥袋");
  });
});

describe("every cell is wired to something", () => {
  it("carries either a postback or a uri, never neither", () => {
    for (const cell of [...ELDER_CELLS, ...CAREGIVER_CELLS]) {
      const wired = Boolean(cell.data) || cell.uri !== undefined;
      expect(wired, cell.label).toBe(true);
    }
  });
});

describe("the role card", () => {
  const card = roleSelectionCard();
  const json = JSON.stringify(card);

  it("frames both options as an intention rather than a category", () => {
    expect(json).toContain("我要看我自己的藥");
    expect(json).toContain("我要幫家人看藥");
    // The humiliation this avoids: a button that files him under the old ones.
    expect(json).not.toContain("我是長輩");
  });

  it("leaves no utterance in his thread", () => {
    // displayText would echo the choice back as a message from him, which he
    // would then scroll past forever.
    expect(json).not.toContain("displayText");
  });

  it("carries an altText that stands alone in a notification", () => {
    expect(card.altText.length).toBeGreaterThan(10);
    expect(card.altText).toContain("我要");
  });

  it("binds through postback data the server re-checks", () => {
    expect(json).toContain("action=bind&role=elder");
    expect(json).toContain("action=bind&role=caregiver");
  });
});
