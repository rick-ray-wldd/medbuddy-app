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

/**
 * 我的藥, in her voice.
 *
 * He pressed a button asking what he is taking, so this answers that — and
 * because he pressed it, this is a reply rather than an interruption, which
 * is why a greeting belongs here and would not belong on an unrequested push.
 *
 * Three parts, in the order he needs them:
 *   1. a greeting that fits the hour
 *   2. the rules' own narration, untouched
 *   3. the times his family set, if they set any
 *
 * ## The greeting is bounded to three, on purpose
 *
 * Audio is keyed by the hash of its text, so every distinct greeting is a
 * distinct clip to synthesise and store. Three buys "早/午/晚 安" — enough
 * that it fits the day — and a fourth would buy nothing he would notice.
 */
/**
 * A warmer opening, still bounded.
 *
 * Audio is keyed by the hash of its text, so every distinct greeting is a
 * distinct clip. Three buys 早/午/晚 — enough that it fits the day — and a
 * fourth buys nothing he would notice.
 */
const GREETINGS: { untilMinutes: number; text: string }[] = [
  { untilMinutes: 11 * 60, text: "阿公早!今天還好嗎?先來看一下今天要吃的藥。" },
  { untilMinutes: 18 * 60, text: "阿公午安!來看一下今天的藥。" },
  { untilMinutes: 24 * 60, text: "阿公晚安!今天的藥在這裡。" },
];

/**
 * What we know about taking one item, when a bag actually said so.
 *
 * Every field optional and every one silent when absent. Bag OCR fills these
 * (`ocr/types.ts`); nothing else in the product knows them, because the drug
 * register holds indications rather than instructions.
 */
export type IntakeDetail = {
  name: string;
  /** "飯前" / "飯後" / "睡前" — copied from the bag, never inferred. */
  mealRelation?: string;
  /** "1 顆" — the bag's own words. */
  dose?: string;
  /**
   * Position in a sequence the BAG printed, e.g. a numbered row.
   *
   * ⚠️ Never derived. Nothing in this product knows which medicine to take
   * first, and an order assembled from a list is the product writing a
   * prescription — he would follow it, and it would be ours rather than his
   * doctor's.
   */
  printedOrder?: number;
};

function intakeLines(items: IntakeDetail[]): string {
  const known = items.filter((i) => i.mealRelation || i.dose);
  if (known.length === 0) return "";

  // Ordered only when the bag numbered them. Otherwise printed order is the
  // bag's own layout, which is not a clinical sequence either — so the list
  // simply reads as a list.
  const ordered = known.every((i) => i.printedOrder !== undefined)
    ? [...known].sort((a, b) => (a.printedOrder ?? 0) - (b.printedOrder ?? 0))
    : known;

  const lines = ordered.map((i) => {
    const parts = [i.mealRelation, i.dose].filter(Boolean).join(" ");
    return `・${i.name}${parts ? ` —— ${parts}` : ""}`;
  });

  return `\n\n藥袋上是這樣寫的:\n${lines.join("\n")}`;
}

/**
 * A granddaughter's aside, and the one condition that removes it.
 *
 * 「起來走一走」 is ordinary family talk and it is also, said by a system to a
 * 72-year-old alongside his medication, unsolicited health advice. For most
 * people that is harmless warmth. For someone whose record carries
 * `recurrent_falls` it is not — encouraging more walking is precisely the
 * thing a fall-risk assessment exists to qualify, and this product does not
 * have one.
 *
 * So it is warmth by default and silence where the record says otherwise,
 * which is the same shape as every other decision here: the system may say
 * something general, and stops as soon as the general stops being safe.
 */
const MOVEMENT_ASIDE = "有空的話起來走一走,不要坐太久。";

const NO_MOVEMENT_ADVICE: string[] = ["recurrent_falls"];

export function movementAsideFor(conditions: readonly string[]): string {
  return conditions.some((c) => NO_MOVEMENT_ADVICE.includes(c)) ? "" : MOVEMENT_ASIDE;
}

export function greetingForHour(minutesOfDay: number): string {
  return (
    GREETINGS.find((g) => minutesOfDay < g.untilMinutes)?.text ?? GREETINGS[2].text
  );
}

/**
 * Minutes since midnight in Taipei.
 *
 * His day, not the server's. A lambda in Washington greeting him 早安 at nine
 * in the evening is a product talking past him.
 */
export function taipeiMinutesOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function frameMyMeds(
  narration: string,
  options: {
    slotTimes: string[];
    now?: Date;
    /** Filled by bag OCR. Absent means the frame says nothing about intake. */
    intake?: IntakeDetail[];
    /** Drives the movement aside; see movementAsideFor. */
    conditions?: readonly string[];
  },
): string {
  const greeting = greetingForHour(taipeiMinutesOfDay(options.now ?? new Date()));
  const body = dropLeadingSalutation(narration);
  const intake = intakeLines(options.intake ?? []);

  const times =
    options.slotTimes.length > 0
      ? `\n\n每天吃藥的時間:\n${[...options.slotTimes]
          .sort()
          .map((t) => `・${t}`)
          .join("\n")}\n時間到我會提醒您。`
      : "";

  const aside = movementAsideFor(options.conditions ?? []);
  const closing = aside
    ? `\n\n${aside}有想問的再跟我說一聲就好。`
    : "\n\n有想問的再跟我說一聲就好。";

  return `${greeting}\n\n${body}${intake}${times}${closing}`;
}

/**
 * The version he actually listens to.
 *
 * ## Why the long one was wrong
 *
 * The full narration reads 「成人和兒童（包含足月新生兒）的流行性感冒之治療」
 * aloud to a 72-year-old. That sentence is the regulator's approved indication
 * text — it exists so the product never paraphrases what a drug is for, and it
 * is written for a pharmacist. Spoken to him it is noise, and noise is how a
 * person stops listening to the part that matters.
 *
 * ## What is dropped, and why that is not paraphrasing
 *
 * Indication text is **omitted, never reworded.** The distinction is the whole
 * argument: rewriting 「緩解發炎及因發炎反應引起之疼痛」 into 「消炎止痛」 would
 * be the product making a clinical claim in its own words. Leaving it out says
 * nothing at all, and it remains verbatim on the caregiver's dashboard and the
 * clinician's sheet, where a reader who needs it will look.
 *
 * **Findings are never dropped.** A warning is the one thing he needs from
 * this message, and it travels verbatim.
 *
 * ## What is never added
 *
 * No colour, no shape, no 「藍色那顆」. Appearance is not captured anywhere —
 * `MEDICATION-BAG-OCR-MIGRATION.md` forbids inferring from it — so naming one
 * would send him looking for a pill by a property nobody recorded.
 */

/** Strength and form, as printed after a Chinese product name. */
const NAME_TAIL = /(\d+(\.\d+)?\s*(毫克|公絲|mg|MG|克|ml|ML|IU)?\s*)?(膜衣錠|糖衣錠|膠囊|錠|顆粒|口服液|懸液|注射劑|粉|散)?\s*$/u;

/**
 * The name he is asked to look for.
 *
 * A prefix of the printed name with the strength and dosage form removed —
 * derived, not rewritten, the same discipline as `printedNameZh` being a
 * substring of the cell it came from. 「克他服寧」 is what he will find on the
 * bag; 「克他服寧２５毫克糖衣錠」 is what he will stop listening to.
 *
 * Falls back to the full name whenever stripping would leave too little to
 * identify — a name is not worth shortening into ambiguity.
 */
export function spokenName(printed: string): string {
  const short = printed.replace(NAME_TAIL, "").trim();
  return short.length >= 2 ? short : printed;
}

export type WarmMyMeds = {
  items: { name: string; mealRelation?: string; dose?: string }[];
  /** Verbatim finding text. Never shortened, never omitted. */
  warnings: string[];
  slotTimes: string[];
  conditions?: readonly string[];
  now?: Date;
};

export function frameMyMedsWarm(input: WarmMyMeds): string {
  const greeting = greetingForHour(taipeiMinutesOfDay(input.now ?? new Date()));

  const lines = input.items.map((item) => {
    const how = [item.mealRelation, item.dose].filter(Boolean).join(" ");
    return how ? `・${spokenName(item.name)},${how}` : `・${spokenName(item.name)}`;
  });

  const meds = lines.length > 0 ? `\n\n今天要吃的是:\n${lines.join("\n")}` : "";

  /**
   * A finding is announced, not recited.
   *
   * The rule's `verbatim` is its English statement of why it fired — written
   * for whoever audits the rule set, and it reached him in English before this
   * check existed. Translating it here would be the product writing a medical
   * sentence in its own words, which is the one thing it must never do.
   *
   * So he is told there is something to ask about, and the regulator's actual
   * wording stays where a pharmacist will read it: the caregiver's dashboard
   * and the clinician's sheet. That is the same escalation the whole product
   * is built on — hand it to a person, do not dump it on him.
   *
   * Chinese warning text, when a rule carries it, is spoken as-is.
   */
  const speakable = input.warnings.filter((w) => /[\u4e00-\u9fff]/.test(w));
  const warnings =
    speakable.length > 0
      ? `\n\n這個要特別注意:\n${speakable.join("\n")}`
      : input.warnings.length > 0
        ? "\n\n有一項想請藥師幫忙看一下,家人會陪您一起問。"
        : "";

  const times = nextSlotLine(input.slotTimes, input.now ?? new Date(), input.items);

  // Water is an aside, not an instruction: it applies to essentially every
  // oral medicine and it is the thing a granddaughter would actually say.
  const walk = movementAsideFor(input.conditions ?? []);
  const closing = `\n\n記得配溫開水喝。${walk}有不舒服或想問什麼,跟我說一聲就好。`;

  return `${greeting}${meds}${warnings}${times}${closing}`;
}

/**
 * The next time, not every time.
 *
 * Reading four times aloud gives him a timetable to hold in his head. He needs
 * one thing: the next one. 「等等九點吃完早餐再吃第一包」 is something a person
 * acts on; 「07:15、08:20、15:21、18:25」 is something a person nods at.
 *
 * 「第幾包」 counts the slot's position in the day, which the caregiver's own
 * schedule defines — it is not a claim about which medicine goes in which
 * packet, and it says 包 only because that is how a Taiwanese pharmacy
 * dispenses a timed dose.
 *
 * The meal phrasing comes from the bag via `mealRelation`. Absent, the line
 * simply gives the time — a guessed 「飯後」 is an instruction he would follow.
 */
function nextSlotLine(
  slotTimes: string[],
  now: Date,
  items: { mealRelation?: string }[],
): string {
  if (slotTimes.length === 0) return "";

  const sorted = [...slotTimes].sort();
  const minutesNow = taipeiMinutesOfDay(now);
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const upcomingIndex = sorted.findIndex((t) => toMinutes(t) > minutesNow);
  // Past the last slot: the next one is tomorrow's first, and saying so beats
  // implying he missed something — this product never tells him what he did.
  const index = upcomingIndex === -1 ? 0 : upcomingIndex;
  const when = upcomingIndex === -1 ? "明天" : "等等";
  const time = sorted[index];

  const meal = items.find((i) => i.mealRelation)?.mealRelation;
  const mealPhrase =
    meal === "飯後"
      ? "吃完飯再吃"
      : meal === "飯前"
        ? "先吃藥再吃飯"
        : meal === "睡前"
          ? "睡前吃"
          : "記得吃";

  return `\n\n${when}${time},${mealPhrase}第${
    ["一", "二", "三", "四"][index] ?? String(index + 1)
  }包喔。`;
}
