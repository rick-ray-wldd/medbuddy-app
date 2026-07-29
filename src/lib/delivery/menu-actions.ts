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
    "讀完只是草稿,不會自動存進紀錄;請核對後回工作台輸入。",
};

export function furniture(
  key: keyof typeof FURNITURE | string,
  webBaseUrl?: string,
): ActionReply {
  const text = FURNITURE[key] ?? "";
  if (!text.includes("{{BASE}}")) return { text, fromPipeline: false };

  // The webhook injects the deployment origin that actually received the
  // postback. An env URL may still name an older Vercel project, which would
  // split the two LINE phones from the record they are meant to share.
  const base = webBaseUrl?.trim().replace(/\/$/, "");
  if (!base) {
    return {
      text: "拍藥袋網頁暫時無法開啟,請從照顧者工作台進入。",
      fromPipeline: false,
    };
  }
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
  const narration = outcome.narration.segments.map((s) => s.text).join("\n");

  // The elder pressed a button asking what he is taking, so he gets it in his
  // granddaughter's register, with the times his family set. The caregiver
  // reading the same verdict gets it plain — the framing is for him.
  let text = narration;
  if (role === "elder" && narration.trim()) {
    const { frameMyMedsWarm } = await import("./reminder-framing");
    const { BlobScheduleStore, InMemoryScheduleStore } = await import(
      "../schedule/store"
    );
    const { findSubject } = await import("../subjects");
    const store = process.env.BLOB_READ_WRITE_TOKEN
      ? new BlobScheduleStore()
      : new InMemoryScheduleStore();
    const schedule = await store.get(subjectId).catch(() => null);

    // Built from the verdict rather than by filtering narration prose: the
    // indication text is omitted, and omitting is not the same as rewording.
    // A finding, however, travels verbatim — it is the one thing he needs.
    text = frameMyMedsWarm({
      items:
        latest.intake ??
        latest.verdict.items
          .filter((item) => item.resolved)
          .map((item) => ({ name: item.nameZh ?? item.inputText })),
      // `verbatim` is the source's own wording, carried through untouched —
      // the only string in this message the product did not choose.
      warnings: latest.verdict.findings.map((f) => f.verbatim).filter(Boolean),
      slotTimes: (schedule?.slots ?? [])
        .filter((slot) => slot.enabled)
        .map((slot) => slot.timeOfDay),
      conditions: findSubject(subjectId)?.conditions ?? [],
    });
  }

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
 * Reads the schedule the caregiver configured, which is the only place a
 * dosing time exists in this product — the register holds indications, not
 * schedules.
 *
 * ## This used to read somewhere else, and showed him nothing
 *
 * The first version read a `dosing` field on the medication snapshot, on the
 * plan that bag OCR would populate it. The caregiver's reminder feature landed
 * meanwhile and put its times in `SubjectSchedule`. Both shipped, neither was
 * wrong on its own, and 用藥提醒 answered 「還沒有用藥時間的資料」 while the
 * caregiver was looking at four slots she had just set.
 *
 * Two writers, two readers, no overlap. The fix is to read what is actually
 * written.
 *
 * **It still does not invent a schedule.** No slots configured means no slots
 * shown — 「早上一顆、晚上一顆」 assembled from nothing is the product writing
 * a prescription, and he would follow it.
 */
export async function dosingSchedule(subjectId: string): Promise<ActionReply> {
  const { BlobScheduleStore, InMemoryScheduleStore } = await import("../schedule/store");
  const { ELDER_ADDRESS, greetingForHour, taipeiMinutesOfDay } = await import(
    "./reminder-framing"
  );
  const store = process.env.BLOB_READ_WRITE_TOKEN
    ? new BlobScheduleStore()
    : new InMemoryScheduleStore();

  const schedule = await store.get(subjectId).catch(() => null);
  const slots = (schedule?.slots ?? []).filter((s) => s.enabled);

  if (slots.length === 0) {
    return {
      text:
        `${ELDER_ADDRESS},您的吃藥時間還沒設定好。\n\n` +
        "等家人設定好,我就會在時間到的時候提醒您。\n\n" +
        "還沒設定的話,我不會自己排一個時間。",
      fromPipeline: false,
    };
  }

  const times = [...slots].map((s) => s.timeOfDay).sort();
  const minutesNow = taipeiMinutesOfDay(new Date());
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const upcoming = times.findIndex((t) => toMinutes(t) > minutesNow);
  const nextLine =
    upcoming === -1
      ? `明天${times[0]} 的時候我會再叫您一次。`
      : `等等${times[upcoming]} 的時候我會叫您。`;

  // The greeting is shared with 我的藥 so the two buttons sound like the same
  // person — pressing one and then the other used to change who he was.
  const greeting = greetingForHour(minutesNow);

  return {
    text:
      `${greeting}\n\n` +
      `${ELDER_ADDRESS}每天吃藥的時間是這幾個:\n${times.map((t) => `・${t}`).join("\n")}\n\n` +
      `${nextLine}\n\n` +
      "要改時間的話跟家人說一聲就好,不用自己弄。",
    fromPipeline: false,
  };
}
