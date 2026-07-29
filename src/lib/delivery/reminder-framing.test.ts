import { describe, expect, it } from "vitest";
import {
  assertNoSelfReport,
  frameMyMeds,
  frameReminder,
  greetingForHour,
  movementAsideFor,
  taipeiMinutesOfDay,
} from "./reminder-framing";

const NARRATION = "父親好,這是您現在在吃的藥。\n【普拿疼膜衣錠500毫克】:\n退燒、止痛。";

describe("the frame goes around the narration, never through it", () => {
  it("passes the rules' sentences through, minus their salutation", () => {
    // Byte-for-byte except the leading 「父親好,」 — a reminder supplies its
    // own greeting, and two greetings is two people talking. Every sentence
    // that carries meaning is untouched.
    const framed = frameReminder(NARRATION, "slot-1");
    expect(framed).toContain("這是您現在在吃的藥。");
    expect(framed).toContain("【普拿疼膜衣錠500毫克】:");
    expect(framed).toContain("退燒、止痛。");
  });

  it("adds only a greeting and a sign-off", () => {
    const framed = frameReminder(NARRATION, "slot-1");
    const [opening, ...rest] = framed.split("\n\n");
    expect(opening).toContain("阿公");
    expect(rest.at(-1)).toBeTruthy();
    // Nothing medical was invented around it: strip every line the rules
    // produced and what is left must name nothing.
    const added = framed
      .split("\n")
      .filter((line) => !NARRATION.includes(line.replace(/^[^,,]{1,6}好[,,]\s*/u, "")))
      .join("");
    for (const invented of ["毫克", "顆", "飯前", "飯後", "普拿疼"]) {
      expect(added, invented).not.toContain(invented);
    }
  });

  it("greets the same way for the same slot every day", () => {
    // Deterministic so the pre-rendered audio for a slot stays valid, and so
    // he hears something familiar rather than a system performing variety.
    expect(frameReminder(NARRATION, "slot-1")).toBe(frameReminder(NARRATION, "slot-1"));
  });

  it("does not give every slot the same opening", () => {
    // The first hash gave three of four slots the same sentence. Asserted
    // across a spread rather than on one pair, so a future hash change that
    // reintroduces clustering fails here.
    const openings = ["a", "b", "c", "d", "e", "f"].map(
      (k) => frameReminder(NARRATION, `slot-${k}`).split("\n\n")[0],
    );
    expect(new Set(openings).size).toBeGreaterThanOrEqual(3);
  });
});

describe("what a reminder may never say", () => {
  it("refuses anything that asks him or reports on him", () => {
    // §3 is relaxed for register, not for this: being asked whether you took
    // your medicine is being asked to confess.
    for (const bad of [
      "阿公,今天吃了嗎?",
      "阿公,昨天忘記吃了喔",
      "阿公,連續 7 天了!",
      "阿公,有沒有吃?",
    ]) {
      expect(() => assertNoSelfReport(bad), bad).toThrow();
    }
  });

  it("allows a plain reminder", () => {
    expect(() => assertNoSelfReport(frameReminder(NARRATION, "slot-1"))).not.toThrow();
  });
});

describe("one voice, not two", () => {
  it("drops the narration's own salutation when a reminder supplies one", () => {
    // 「阿公,吃藥時間到了。父親好,這是您現在在吃的藥。」 is two people
    // talking. The rules greet because their narration is also used when he
    // asks a question, with nothing before it.
    const framed = frameReminder(NARRATION, "slot-1");
    expect(framed).not.toContain("父親好");
    // The sentence itself survives — only the salutation went.
    expect(framed).toContain("這是您現在在吃的藥");
  });

  it("leaves narration alone when it has no salutation", () => {
    const plain = "【普拿疼膜衣錠500毫克】:\n退燒、止痛。";
    expect(frameReminder(plain, "slot-1")).toContain(plain);
  });

  it("varies the opening across four real slot ids", () => {
    // Four slots differing in one character collided three ways out of four
    // under the first hash: a machine repeating itself while appearing to vary.
    const openings = ["slot-1", "slot-2", "slot-3", "slot-4"].map(
      (k) => frameReminder(NARRATION, k).split("\n\n")[0],
    );
    expect(new Set(openings).size).toBeGreaterThan(1);
  });
});

describe("我的藥, answered in her voice", () => {
  const NOW_MORNING = new Date("2026-07-29T01:00:00Z"); // 09:00 Taipei

  it("greets by the hour where he lives, not where the server is", () => {
    // 09:00 in Taipei is 02:00 in Washington. A lambda greeting him 早安 at
    // nine in the evening is a product talking past him.
    expect(greetingForHour(taipeiMinutesOfDay(NOW_MORNING))).toContain("早");
    expect(greetingForHour(taipeiMinutesOfDay(new Date("2026-07-29T06:00:00Z")))).toContain(
      "午",
    );
    expect(greetingForHour(taipeiMinutesOfDay(new Date("2026-07-29T13:00:00Z")))).toContain(
      "晚",
    );
  });

  it("carries the rules' sentences and the times his family set", () => {
    const framed = frameMyMeds(NARRATION, {
      slotTimes: ["20:00", "08:00"],
      now: NOW_MORNING,
    });

    expect(framed).toContain("【普拿疼膜衣錠500毫克】:");
    // Sorted, because a list of times read aloud out of order is harder to
    // follow than one in order.
    expect(framed.indexOf("08:00")).toBeLessThan(framed.indexOf("20:00"));
  });

  it("says nothing about times when nobody set any", () => {
    const framed = frameMyMeds(NARRATION, { slotTimes: [], now: NOW_MORNING });
    expect(framed).not.toContain("每天吃藥的時間");
    // And still refuses to invent one.
    for (const invented of ["早上", "睡前", "一天三次"]) {
      expect(framed, invented).not.toContain(invented);
    }
  });

  it("asks him nothing and grades him on nothing", () => {
    const framed = frameMyMeds(NARRATION, {
      slotTimes: ["08:00"],
      now: NOW_MORNING,
    });
    expect(() => assertNoSelfReport(framed)).not.toThrow();
    expect(framed).not.toContain("謝謝");
    expect(framed).not.toContain("很棒");
  });
});

describe("what the bag said, and only what it said", () => {
  const MORNING = new Date("2026-07-29T01:00:00Z");

  it("reads out meal relation and dose when a bag printed them", () => {
    const framed = frameMyMeds(NARRATION, {
      slotTimes: [],
      now: MORNING,
      intake: [{ name: "克他服寧", mealRelation: "飯後", dose: "1 粒" }],
    });
    expect(framed).toContain("克他服寧 —— 飯後 1 粒");
  });

  it("says nothing about meals when the bag did not print it", () => {
    // All three real bags left timing not_visible. Silence is the honest
    // answer; 「飯後」 supplied from common practice is the product writing an
    // instruction he would follow.
    const framed = frameMyMeds(NARRATION, { slotTimes: [], now: MORNING });
    for (const invented of ["飯前", "飯後", "睡前", "藥袋上是這樣寫的"]) {
      expect(framed, invented).not.toContain(invented);
    }
  });

  it("orders only when the bag numbered the rows", () => {
    const framed = frameMyMeds(NARRATION, {
      slotTimes: [],
      now: MORNING,
      intake: [
        { name: "B藥", dose: "1 粒", printedOrder: 2 },
        { name: "A藥", dose: "1 粒", printedOrder: 1 },
      ],
    });
    expect(framed.indexOf("A藥")).toBeLessThan(framed.indexOf("B藥"));
  });

  it("does not invent a sequence when the bag numbered nothing", () => {
    // Nothing in this product knows which medicine to take first. A list is a
    // list; presenting it as an order would be ours rather than his doctor's.
    const framed = frameMyMeds(NARRATION, {
      slotTimes: [],
      now: MORNING,
      intake: [
        { name: "先吃的", dose: "1 粒" },
        { name: "後吃的", dose: "1 粒" },
      ],
    });
    // Scoped to the intake list, because the greeting legitimately contains
    // 先 ("先來看一下"). What must not appear is sequencing INSIDE the list.
    const list = framed.split("藥袋上是這樣寫的:")[1]?.split("\n\n")[0] ?? "";
    expect(list).toContain("先吃的");
    for (const sequencing of ["接著", "再吃", "然後", "第一步", "順序"]) {
      expect(list, sequencing).not.toContain(sequencing);
    }
    // And the list keeps the order it was given rather than claiming one.
    expect(list.indexOf("先吃的")).toBeLessThan(list.indexOf("後吃的"));
  });
});

describe("the movement aside", () => {
  const MORNING = new Date("2026-07-29T01:00:00Z");

  it("is there for most people", () => {
    expect(movementAsideFor(["chronic_liver_disease"])).toContain("走一走");
  });

  it("is silent for someone whose record says he falls", () => {
    // Encouraging more walking is exactly what a fall-risk assessment exists
    // to qualify, and this product does not have one.
    expect(movementAsideFor(["recurrent_falls"])).toBe("");
    const framed = frameMyMeds(NARRATION, {
      slotTimes: [],
      now: MORNING,
      conditions: ["recurrent_falls"],
    });
    expect(framed).not.toContain("走一走");
  });
});
