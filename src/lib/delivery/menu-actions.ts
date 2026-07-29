/**
 * What a menu press does.
 *
 * ## The line this file walks
 *
 * Spec §6.4 forbids the bot composing text, and every handler below returns
 * text. The rule it is actually protecting is narrower and absolute: **the bot
 * must never compose an answer about medication.** Anything a person could
 * mistake for clinical content has to come from the pipeline — grounding,
 * rules, verdict, narration — or not be sent.
 *
 * So the strings here are of exactly two kinds, and they are kept separate on
 * purpose:
 *
 * - **Furniture** — 「拿起藥,直接打字說名字就好」. Interface instruction. It
 *   names no medicine, makes no claim, and would read identically for a person
 *   taking nothing at all. Composed here, and that is fine.
 * - **Content** — everything about what he is taking. Always `narrate(verdict)`.
 *   Never assembled in this file, not even by concatenation.
 *
 * A handler that ever interpolates a medicine name into a furniture string has
 * crossed the line, and the test file asserts against exactly that.
 *
 * ## What the elder is never offered
 *
 * No cell reports on him and none asks him a question about himself (§3). The
 * caregiver's surface holds what the family observed; his does not, and
 * `roles/bind.ts` is what stops him reaching it.
 */

import type { Role } from "../roles/types";

export type ActionReply = {
  /** Sent verbatim by the adapter. */
  text: string;
  /** True when `text` came out of the pipeline rather than this file. */
  fromPipeline: boolean;
};

/** Interface instruction. Names nothing, claims nothing. */
const FURNITURE: Record<string, string> = {
  how_to_ask:
    "想知道哪一顆,直接打字說名字就好。\n\n藥袋上、或藥盒上的字都可以。\n\n打錯了也沒關係,認不出來我會說認不出來,不會亂猜。",
  note_prompt:
    "直接打一段話就好,不用分項。\n\n例如:「他這兩週晚上腰痛睡不著,自己拿櫃子裡的止痛藥吃,大概三四次。最近也比較常喝酒。」\n\n我會拆成幾筆記下來,每一筆都保留您原本的說法。",
  nothing_yet:
    "還沒有核對過的紀錄。\n\n請照顧者先在網頁上核對一次,之後這裡就看得到。",
  reached_family: "好,我跟家人說了。",
  no_family: "還沒有設定家人的帳號,所以沒有送出去。",
};

export function furniture(key: keyof typeof FURNITURE | string): ActionReply {
  return { text: FURNITURE[key] ?? "", fromPipeline: false };
}

/**
 * The subject's most recent check, re-narrated for whoever is asking.
 *
 * Re-narrated rather than replayed from a stored string: narration depends on
 * the role, and the same verdict says different things to a man about himself
 * and to his daughter about her father. Storing the sentence would freeze one
 * of those.
 */
export async function lastCheckNarration(
  subjectId: string,
  role: Role,
): Promise<ActionReply> {
  const [{ getRegistry }, { narrate }] = await Promise.all([
    import("../registry"),
    import("../narration/narrate"),
  ]);
  const { logStore, knownMedicines } = getRegistry();
  const log = await logStore.read(subjectId);
  const latest = log.snapshots.at(-1);
  if (!latest) return furniture("nothing_yet");

  const outcome = await narrate(latest.verdict, role, null, knownMedicines);
  const text = outcome.narration.segments.map((s) => s.text).join("\n");
  // VOICE-DELIVERY-SPEC §5 — an empty narration is sent as nothing, never as a
  // default sentence.
  return { text: text.trim(), fromPipeline: true };
}

/** Who a caregiver is currently responsible for. Names only; no findings. */
export async function subjectRoster(): Promise<ActionReply> {
  const { DEMO_SUBJECT } = await import("../subjects");
  return {
    text:
      `目前照顧的對象:\n\n・${DEMO_SUBJECT.displayName}(${DEMO_SUBJECT.ageYears} 歲)` +
      "\n\n這次示範固定一位長者,不需要切換。",
    fromPipeline: false,
  };
}

/**
 * What the older adult has asked lately.
 *
 * His questions, not a report on his behaviour — 「他問了什麼」 is a different
 * object from 「他做了什麼」, and only the first one is his to share. Nothing
 * here says whether he took anything.
 */
export async function recentQuestions(subjectId: string): Promise<ActionReply> {
  const { getRegistry } = await import("../registry");
  const { logStore } = getRegistry();
  const log = await logStore.read(subjectId);
  const asked = log.observations
    .filter((o) => o.reportedByCarerId === "elder-asked")
    .slice(-5);

  if (asked.length === 0) {
    return { text: "最近沒有提問紀錄。", fromPipeline: false };
  }
  const lines = asked.map((o) => `・${o.note}`);
  return { text: `最近問過:\n\n${lines.join("\n")}`, fromPipeline: false };
}
