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
 * "I did it wrong".
 *
 * Every cell below therefore answers. Two of them answer by saying the feature
 * is not ready yet (紀錄用藥, 用藥提醒), which is a worse product than having
 * them work and a much better one than a button that swallows a press: he
 * learns the state of the system rather than doubting his own aim.
 *
 * ## Four cells each
 *
 * Six targets on a 2500×1686 menu are 833px wide; four are 1250px. At the
 * distance a phone is held by someone with presbyopia, that difference is
 * whether a thumb lands where it aimed — so the caregiver's menu gave up its
 * third column too.
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
  | "swap"
  | "clock"
  | "camera";

export type Cell = {
  label: string;
  sub: string;
  icon: IconName;
  data?: string;
  uri?: string;
};

/**
 * Both menus are 2×2 now, four cells each.
 *
 * The caregiver's was 2×3 and lost 他問了什麼, 照顧對象 and 開啟網頁 — not
 * because they were bad, but because a subject switcher over a roster of one
 * is a control with nothing to control, and a cell kept on "might be useful"
 * takes size from the ones that are. Four 1250×843 targets beat six 833×843
 * ones on a phone held at arm's length.
 *
 * ## 切換身分 is on the elder's menu, and that is a reversal
 *
 * §1b said an elder binding is terminal and he must never reach the caregiver
 * surface. That rule was written when any phone could claim any role, and it
 * was the only thing between a crafted postback and what his family wrote
 * about him. `canClaimDemoRole` now refuses every phone but the two the
 * deployment names, so the gate does that work — and the terminal rule was
 * left stranding whoever tapped the wrong card on the right phone, with no
 * way back from inside LINE.
 *
 * The cell is a `postback`, never a `uri`: `assertNoLinksForElder` still
 * holds and he is still never taught to tap a link. What changed is only
 * whether a second answer is possible, and that is gated on
 * MEDBUDDY_ALLOW_ROLE_SWITCH, which a real deployment leaves off.
 */
export const ELDER_CELLS: Cell[] = [
  { label: "我的藥", sub: "照顧者記錄的用藥", icon: "pill", data: "action=my_meds" },
  { label: "產生回診單", sub: "帶去給醫師掃", icon: "document", data: "action=summary" },
  { label: "用藥提醒", sub: "什麼時候吃、飯前飯後", icon: "clock", data: "action=schedule" },
  { label: "切換身分", sub: "重新選擇", icon: "swap", data: "action=rebind" },
];

export const CAREGIVER_CELLS: Cell[] = [
  { label: "記一件事", sub: "打一段話就好", icon: "pencil", data: "action=note" },
  { label: "紀錄用藥", sub: "拍藥袋照片", icon: "camera", data: "action=log_meds" },
  { label: "產生回診單", sub: "兩邊都收到 QR", icon: "document", data: "action=summary" },
  // In-LINE schedule editing + the caregiver-initiated send (§6.2) — the two
  // outbound controls live on the phone as well as the web dashboard.
  { label: "服藥提醒", sub: "固定時間自動傳語音", icon: "clock", data: "action=reminders" },
  // A link, which only the caregiver may have: §6.1 refuses an older adult one
  // because he taps without checking. Everything a caregiver needs depth for
  // — the running record, the elder's screen, the QR — is on one page, and
  // rebuilding that out of LINE messages would be strictly worse.
  { label: "儀表板", sub: "看紀錄與回診單", icon: "window", uri: "" },
  { label: "切換身分", sub: "重新選擇", icon: "swap", data: "action=rebind" },
];

function grid(cells: Cell[], cols: number, rows: number): RichMenuArea[] {
  // Edges land on floor(k·size/n) so the tiling is exact for any n — a plain
  // floor(size/n) cell width loses pixels when n does not divide the canvas
  // (2500/3), and the tiling test rightly refuses gaps.
  const xEdge = (k: number) => Math.floor((k * FULL.width) / cols);
  const yEdge = (k: number) => Math.floor((k * FULL.height) / rows);
  return cells.map((cell, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return {
      bounds: {
        x: xEdge(c),
        y: yEdge(r),
        width: xEdge(c + 1) - xEdge(c),
        height: yEdge(r + 1) - yEdge(r),
      },
      action: cell.uri !== undefined
        ? { type: "uri" as const, label: cell.label, uri: cell.uri }
        : { type: "postback" as const, label: cell.label, data: cell.data! },
    };
  });
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

export function caregiverRichMenu(
  baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() ?? "",
): RichMenuDefinition {
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
