import { describe, expect, it } from "vitest";
import { assertNoSelfReport, frameReminder } from "./reminder-framing";

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
