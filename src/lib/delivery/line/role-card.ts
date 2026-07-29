/**
 * The one question this product asks about the person rather than the medicine
 * (LINE-UX-SPEC §1).
 *
 * ## Three decisions are visible in this JSON
 *
 * **The label names the role; the line under it names the intention.**
 *
 * This is a reversal, and it is worth recording rather than quietly shipping.
 * The first version used only intentions — 「我要看我自己的藥」 rather than
 * 「我是長輩」 — because asking a 72-year-old to tap a button that files him
 * under the old people is a small humiliation on the first screen, and the
 * first screen is where products lose people.
 *
 * That reasoning still holds for the product. It lost to a different need: a
 * reviewer meeting this card for ninety seconds has to see *immediately* that
 * the product has two audiences and that the whole interface forks here. An
 * intention-framed label is kinder and slower to read, and slower to read is
 * fatal when the reader is evaluating rather than using.
 *
 * So both are carried: 「我是長輩」 as the heading a stranger parses at a
 * glance, 「看我自己在吃的藥」 underneath as what he is actually choosing. If
 * this ever ships to real families, the heading should go back — and the
 * reason it was changed should not have to be reconstructed, which is why it
 * is written here.
 *
 * **No `displayText` on either action.** A postback with `displayText` echoes
 * the choice into the thread as a message from him. He would then have that
 * sentence about himself sitting in his own conversation, and would scroll past
 * it every time afterwards. The choice is a setting, so it leaves no utterance.
 *
 * **Sizes are set explicitly and large.** LINE's defaults are tuned for a
 * thread read at desk distance. `size: "giga"` plus explicit `xl`/`xxl` text is
 * the difference between a card that is read and one that is squinted at —
 * Q8 from the source interview: 有老花,字要很大.
 */

/** LINE Flex is a JSON dialect; this file is the only place its shape is written. */
export type FlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};

function choice(label: string, sub: string, role: "elder" | "caregiver") {
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    paddingAll: "20px",
    margin: "md",
    backgroundColor: "#F4F6F8",
    cornerRadius: "12px",
    // The whole box is the target, not a word inside it: a thumb at arm's
    // length is wider than a label.
    action: { type: "postback", label, data: `action=bind&role=${role}` },
    contents: [
      { type: "text", text: label, size: "xl", weight: "bold", color: "#111111", wrap: true },
      { type: "text", text: sub, size: "md", color: "#5A6472", wrap: true },
    ],
  };
}

export function roleSelectionCard(): FlexMessage {
  return {
    type: "flex",
    // Shown in the notification and by screen readers. It has to stand alone,
    // because for some recipients it is the whole message.
    altText: "請問您是?我是長輩,或我是照顧者",
    contents: {
      type: "bubble",
      size: "giga",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        contents: [
          { type: "text", text: "MedBuddy", size: "xxl", weight: "bold", color: "#111111" },
          { type: "text", text: "幫忙看懂家裡的藥", size: "lg", color: "#5A6472", margin: "sm", wrap: true },
          { type: "text", text: "請問您是?", size: "md", color: "#5A6472", margin: "md", wrap: true },
          { type: "separator", margin: "lg" },
          choice("我是長輩", "看我自己在吃的藥", "elder"),
          choice("我是照顧者", "幫家人核對用藥、產生回診單", "caregiver"),
        ],
      },
    },
  };
}
