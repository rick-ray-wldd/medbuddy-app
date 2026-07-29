/**
 * The granddaughter's voice, in words as well as sound.
 *
 * ## What this changes and what it does not
 *
 * A reminder is the rule-produced elder narration with a greeting before it
 * and a sign-off after it. **The medical sentences are untouched** — they come
 * from `narrate(verdict)` and this file never sees a medicine name, a dose, or
 * a time. It writes the frame, not the picture.
 *
 * That boundary is the whole reason a casual register is safe here. 「阿公,吃
 * 藥時間到了」 is a greeting; it would read identically to someone taking
 * nothing at all. Everything that could be mistaken for instruction is still
 * the rules' own words.
 *
 * ## A rule this deliberately relaxes
 *
 * LINE-UX-SPEC §3 forbids 疊字 and 「囉」「喔」, on the argument that a product
 * treating an older adult as declining may help make that true. That argument
 * was written for a bot addressing him. This is a granddaughter, in her actual
 * voice, and the register a family uses with each other is not the register a
 * product should use — 「阿公」 from Serin is warmth; 「使用者您好」 from a
 * system is distance.
 *
 * Ray asked for this explicitly after the constraint was raised with him, and
 * it is his family and his product. Recorded here rather than quietly done, so
 * the earlier argument is available to whoever revisits it.
 *
 * What is NOT relaxed, because these are about him rather than about tone:
 *   - never ask whether he took it (§3) — no 「吃了嗎」 anywhere below
 *   - never say what he did or did not do — no 「昨天忘記」
 *   - no streak, no count, no praise for compliance
 *
 * A reminder tells him it is time. It does not grade him.
 */

/**
 * Openings, chosen by slot rather than at random.
 *
 * Deterministic on purpose: the same slot says the same thing every day, so
 * the pre-rendered audio for it stays valid, and he hears something familiar
 * rather than a system performing variety at him.
 */
const OPENINGS = [
  "阿公,吃藥時間到了。",
  "阿公,該吃藥囉。",
  "阿公,時間到了,先把藥吃一吃。",
  "阿公,吃藥時間。",
];

const CLOSINGS = [
  "吃完就好,不用回我。",
  "就這樣,不用特別跟我說。",
  "好,吃完就可以繼續忙了。",
  "這樣就好囉。",
];

/**
 * Which opening this slot uses.
 *
 * Keyed off the slot id so it is stable across days and differs between the
 * morning and the evening — the same sentence four times a day is a machine,
 * four different ones at random is a machine trying not to sound like one.
 */
function pick(list: string[], key: string): string {
  // FNV-1a rather than the 31-multiplier: four slot ids differing in one
  // character collided on the same opening three times out of four, which is
  // a machine repeating itself while appearing to vary.
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return list[Math.abs(hash) % list.length];
}

/**
 * Strip the narration's own greeting when a reminder supplies one.
 *
 * The rules open with 「父親好,」 because the same narration is used when he
 * asks a question and there is no greeting before it. In a reminder there is
 * one, and 「阿公,吃藥時間到了。父親好,…」 is two people talking.
 *
 * Only the salutation goes. The sentence it was attached to is kept, because
 * it is the rules' sentence.
 */
function dropLeadingSalutation(narration: string): string {
  return narration.replace(/^[^\n,,]{1,6}好[,,]\s*/u, "");
}

export type Framing = "reminder" | "plain";

/**
 * Wrap rule-produced narration in a reminder's greeting and sign-off.
 *
 * `narration` is passed through byte for byte. Everything added is furniture:
 * it names nothing, claims nothing, and asks nothing.
 */
export function frameReminder(narration: string, slotKey: string): string {
  const opening = pick(OPENINGS, slotKey);
  const closing = pick(CLOSINGS, `${slotKey}-close`);
  return `${opening}\n\n${dropLeadingSalutation(narration)}\n\n${closing}`;
}

/** The rules this file must not break, as a check rather than a comment. */
export function assertNoSelfReport(text: string): void {
  const forbidden = [
    "吃了嗎",
    "有沒有吃",
    "記得吃了",
    "昨天",
    "連續",
    "第幾天",
    "沒吃",
    "忘記吃",
  ];
  for (const phrase of forbidden) {
    if (text.includes(phrase)) {
      throw new Error(`reminder must not report on him or ask him: ${phrase}`);
    }
  }
}
