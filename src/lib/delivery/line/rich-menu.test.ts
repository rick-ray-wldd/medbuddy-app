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
  const menu = caregiverRichMenu();

  it("gives four targets and tiles the menu", () => {
    // Was 2×3. 他問了什麼, 照顧對象 and 開啟網頁 came off: a subject switcher
    // over a roster of one is a control with nothing to control, and cells
    // kept on "might be useful" take size from the ones that are.
    expect(menu.areas).toHaveLength(4);
    const covered = menu.areas.reduce((sum, a) => sum + a.bounds.width * a.bounds.height, 0);
    expect(covered).toBe(2500 * 1686);
  });

  it("carries no link now that the webview cell is gone", () => {
    expect(menu.areas.every((a) => a.action.type === "postback")).toBe(true);
  });

  it("offers exactly the four features the demo implements", () => {
    expect(CAREGIVER_CELLS.map((c) => c.label)).toEqual([
      "記一件事",
      "產生回診單",
      "紀錄用藥",
      "切換身分",
    ]);
  });
});

describe("both menus can leave the role they are on", () => {
  it("each has 切換身分, so neither phone can be stranded", () => {
    // The failure this prevents: tapping the wrong card on the right phone
    // and having no way back from inside LINE. The terminal rule used to make
    // that unrecoverable without an operator.
    for (const cells of [ELDER_CELLS, CAREGIVER_CELLS]) {
      expect(cells.map((c) => c.data)).toContain("action=rebind");
    }
  });

  it("does so through a postback, never a uri", () => {
    // assertNoLinksForElder still holds: he is not taught to tap links, and
    // the escape hatch does not become one.
    const rebind = elderRichMenu().areas.find(
      (a) => a.action.type === "postback" && a.action.data === "action=rebind",
    );
    expect(rebind?.action.type).toBe("postback");
    expect(() => assertNoLinksForElder(elderRichMenu())).not.toThrow();
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

  it("names the role in the heading and the intention underneath", () => {
    // A reversal from the first version, which used intentions only. A
    // reviewer meeting this card for ninety seconds has to see at a glance
    // that the interface forks here; an intention-framed heading is kinder
    // and slower to read, and slower loses when the reader is evaluating.
    expect(json).toContain("我是長輩");
    expect(json).toContain("我是照顧者");
    // The intention is not dropped, only demoted to the second line — it is
    // what he is actually choosing.
    expect(json).toContain("看我自己在吃的藥");
    expect(json).toContain("幫家人核對用藥");
  });

  it("leaves no utterance in his thread", () => {
    // displayText would echo the choice back as a message from him, which he
    // would then scroll past forever.
    expect(json).not.toContain("displayText");
  });

  it("carries an altText that stands alone in a notification", () => {
    // For a recipient on a lock screen, or using a screen reader, this IS the
    // card — so it has to carry the question and both answers, not a label.
    expect(card.altText).toContain("我是長輩");
    expect(card.altText).toContain("我是照顧者");
  });

  it("binds through postback data the server re-checks", () => {
    expect(json).toContain("action=bind&role=elder");
    expect(json).toContain("action=bind&role=caregiver");
  });
});
