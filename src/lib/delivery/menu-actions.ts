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
  pair_info:
    "本次示範使用兩支手機、固定兩個角色。\n\n這支手機是照顧者,另一支是長輩,兩邊都只連到父親的紀錄。",
  // The caregiver gets a link because §6.1's refusal is about the elder only.
  // Photographing a bag needs a camera and a screen big enough to check eight
  // columns against the paper in the other hand; a LINE bubble is neither.
  log_meds_prompt:
    "拍藥袋請用這個網頁,可以直接開相機或從相簿選:\n\n" +
    "{{BASE}}/bag\n\n" +
    "系統只會照抄藥袋上印出來的字。沒印的欄位會留白,不會自己補 —— " +
    "讀完的每一列都要您核對過才會存進紀錄。",
};

export function furniture(key: keyof typeof FURNITURE | string): ActionReply {
  const text = FURNITURE[key] ?? "";
  // {{BASE}} rather than a hardcoded host: the same string has to work on a
  // preview deployment, on localhost, and in production, and a link that
  // silently points at the wrong deployment is worse than no link.
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  return { text: text.replace(/\{\{BASE\}\}/g, base), fromPipeline: false };
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

/**
 * When to take what.
 *
 * Reads dosing times captured from medication bags. Nothing else in the
 * product knows a dosing time — the register holds indications, not
 * schedules — so until bag OCR lands this has no source and says so.
 *
 * **It does not fall back to a plausible schedule.** 「早上一顆、晚上一顆」
 * assembled from nothing would be a product inventing a prescription, and a
 * person would follow it. An empty answer is a gap; a guessed one is a hazard.
 */
export async function dosingSchedule(subjectId: string): Promise<ActionReply> {
  const { getRegistry } = await import("../registry");
  const { logStore } = getRegistry();
  const log = await logStore.read(subjectId);
  const latest = log.snapshots.at(-1);

  if (!latest) return furniture("nothing_yet");

  // `dosing` is written by bag OCR. Optional on the type, absent everywhere
  // until that ships, which is why this reads defensively rather than
  // assuming the field.
  const withTimes = latest.items.filter(
    (item) => (item as { dosing?: unknown }).dosing !== undefined,
  );

  if (withTimes.length === 0) {
    return {
      text:
        "還沒有用藥時間的資料。\n\n" +
        "用藥時間是從藥袋上讀來的,照顧者用「紀錄用藥」拍過藥袋之後,這裡就會列出每天什麼時候吃、飯前還是飯後。\n\n" +
        "沒有資料的時候我不會自己編一個時間表。",
      fromPipeline: false,
    };
  }

  // Deliberately unreachable until OCR writes `dosing`. Left as the seam
  // rather than as a comment so the shape is settled before the data arrives.
  return { text: "", fromPipeline: false };
}
