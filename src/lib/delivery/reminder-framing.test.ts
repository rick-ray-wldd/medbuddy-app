import { describe, expect, it } from "vitest";
import { assertNoSelfReport, frameReminder } from "./reminder-framing";

const NARRATION = "父親好,這是您現在在吃的藥。\n【普拿疼膜衣錠500毫克】:\n退燒、止痛。";

describe("the frame goes around the narration, never through it", () => {
  it("passes the rules' words through byte for byte", () => {
    const framed = frameReminder(NARRATION, "slot-1");
    expect(framed).toContain(NARRATION);
  });

  it("adds only a greeting and a sign-off", () => {
    const framed = frameReminder(NARRATION, "slot-1");
    const [opening, ...rest] = framed.split("\n\n");
    expect(opening).toContain("阿公");
    expect(rest.at(-1)).toBeTruthy();
    // Nothing medical was invented around it.
    for (const invented of ["毫克", "顆", "飯前", "飯後"]) {
      const outsideNarration = framed.replace(NARRATION, "");
      expect(outsideNarration, invented).not.toContain(invented);
    }
  });

  it("greets the same way for the same slot every day", () => {
    // Deterministic so the pre-rendered audio for a slot stays valid, and so
    // he hears something familiar rather than a system performing variety.
    expect(frameReminder(NARRATION, "slot-1")).toBe(frameReminder(NARRATION, "slot-1"));
  });

  it("greets differently for a different slot", () => {
    const morning = frameReminder(NARRATION, "slot-morning").split("\n\n")[0];
    const evening = frameReminder(NARRATION, "slot-evening").split("\n\n")[0];
    // Not guaranteed by the hash, but true for these two — a fixed pair is
    // worth asserting because four identical sentences a day is a machine.
    expect(morning === evening).toBe(false);
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
