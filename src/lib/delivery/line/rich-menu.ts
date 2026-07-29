/**
 * Two menus, one channel.
 *
 * LINE links a rich menu **per user**, so the same bot presents a different
 * interface to each role without a second channel. That is how "one record,
 * several projections" is expressed in LINE — and the clinician, who never
 * holds a phone here, is simply absent.
 *
 * ## Every cell is wired
 *
 * A rich menu button is drawn by us, so a button that does nothing is our
 * mistake rather than the user's. Spec §3 says the bot must not reply to what
 * it does not understand — silence beats a guess — but silence in answer to a
 * button *we put there* reads as broken, and to an older adult it reads as
 * "I did it wrong". So the menus below carry only actions that exist: the
 * caregiver's 拍藥袋 (bag OCR) is absent, because it is specified
 * (docs/MEDICATION-BAG-OCR-MIGRATION.md) and not built.
 *
 * ## Why the elder gets four cells and the caregiver six
 *
 * Six targets on a 2500×1686 menu are 833px wide; four are 1250px. At the
 * distance a phone is held by someone with presbyopia, that difference is
 * whether a thumb lands where it aimed. Depth is a thing to spend on a
 * caregiver and refuse an elder.
 *
 * Field names verified 2026-07-28 against
 * https://developers.line.biz/en/reference/messaging-api/#rich-menu-object
 */

export type RichMenuArea = {
  bounds: { x: number; y: number; width: number; height: number };
  action:
    | { type: "postback"; label: string; data: string }
    | { type: "uri"; label: string; uri: string };
};

export type RichMenuDefinition = {
  size: { width: number; height: number };
  selected: boolean;
  name: string;
  /** Shown where the keyboard would be. Never 「請選擇」 — it says nothing. */
  chatBarText: string;
  areas: RichMenuArea[];
};

/** LINE's full-size rich menu. The only size with room for 843px-tall cells. */
const FULL = { width: 2500, height: 1686 };

/**
 * Labels are duplicated into the rendered image by scripts/render-rich-menu.mts.
 *
 * `icon` names the glyph rather than positioning it. Drawing by grid position
 * is how the caregiver's menu first came out with a pill beside 記一件事 and a
 * magnifier beside 產生回診單 — and an icon that contradicts its label is worse
 * than no icon at all, because the entire justification for having one is that
 * it is recognised faster than the words next to it.
 */
export type IconName =
  | "pill"
  | "magnifier"
  | "speaker"
  | "people"
  | "pencil"
  | "document"
  | "question"
  | "window"
  | "swap";

export type Cell = {
  label: string;
  sub: string;
  icon: IconName;
  data?: string;
  uri?: string;
};

export const ELDER_CELLS: Cell[] = [
  { label: "我的藥", sub: "今天在吃什麼", icon: "pill", data: "action=my_meds" },
  { label: "這顆是什麼", sub: "用說的或打字", icon: "magnifier", data: "action=how_to_ask" },
  { label: "再唸一次", sub: "剛剛那則語音", icon: "speaker", data: "action=repeat" },
  { label: "找家人", sub: "傳個訊息給他們", icon: "people", data: "action=reach_family" },
];

export const CAREGIVER_CELLS: Cell[] = [
  { label: "記一件事", sub: "打一段話就好", icon: "pencil", data: "action=note" },
  { label: "產生回診單", sub: "QR 傳給長輩", icon: "document", data: "action=summary" },
  { label: "他問了什麼", sub: "最近的提問", icon: "question", data: "action=recent_questions" },
  { label: "我照顧的人", sub: "切換對象", icon: "people", data: "action=subjects" },
  { label: "開啟網頁", sub: "完整介面", icon: "window", uri: "" }, // uri filled below
  { label: "切換身分", sub: "重新選擇", icon: "swap", data: "action=rebind" },
];

function grid(cells: Cell[], cols: number, rows: number): RichMenuArea[] {
  const width = Math.floor(FULL.width / cols);
  const height = Math.floor(FULL.height / rows);
  return cells.map((cell, i) => ({
    bounds: {
      x: (i % cols) * width,
      y: Math.floor(i / cols) * height,
      width,
      height,
    },
    action: cell.uri !== undefined
      ? { type: "uri" as const, label: cell.label, uri: cell.uri }
      : { type: "postback" as const, label: cell.label, data: cell.data! },
  }));
}

export function elderRichMenu(): RichMenuDefinition {
  return {
    size: FULL,
    selected: true,
    name: "medbuddy-elder",
    // Says what pressing it gives him, not what it is.
    chatBarText: "看我的藥",
    areas: grid(ELDER_CELLS, 2, 2),
  };
}

export function caregiverRichMenu(baseUrl: string): RichMenuDefinition {
  const cells = CAREGIVER_CELLS.map((c) =>
    c.uri !== undefined ? { ...c, uri: `${baseUrl.replace(/\/$/, "")}/` } : c,
  );
  return {
    size: FULL,
    selected: true,
    name: "medbuddy-caregiver",
    chatBarText: "照顧工具",
    areas: grid(cells, 3, 2),
  };
}

/**
 * `uri` actions are allowed here and forbidden on the elder's menu.
 *
 * LINE-ADAPTER-SPEC §6.1 refuses to send an older adult a link because he taps
 * links without checking; a rich menu cell is a link that is always on screen,
 * which is the same hazard nailed to the wall. The caregiver does not have that
 * constraint. This function is the enforcement, so the rule is a test rather
 * than a comment.
 */
export function assertNoLinksForElder(menu: RichMenuDefinition): void {
  for (const area of menu.areas) {
    if (area.action.type === "uri") {
      throw new Error(
        `elder rich menu must not contain a uri action: ${area.action.label}`,
      );
    }
  }
}
