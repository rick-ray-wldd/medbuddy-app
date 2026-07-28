import { describe, expect, it } from "vitest";
import { parseObservations, type ObservationExtractor } from "./parse";

/** What a caregiver actually types: one paragraph, four separate things. */
const PARAGRAPH =
  "他這兩週晚上腰痛睡不著,自己拿櫃子裡的止痛藥吃,大概三四次。" +
  "最近也比較常喝酒。上禮拜有一天早上的血壓藥忘記吃。";

function stub(rows: { kind: string; note: string }[]): ObservationExtractor {
  return { async extract() { return rows; } };
}

describe("splitting one paragraph into what a clinician reads separately", () => {
  it("keeps each note as the caregiver's own words", async () => {
    const result = await parseObservations(
      PARAGRAPH,
      stub([
        { kind: "symptom", note: "這兩週晚上腰痛睡不著" },
        { kind: "self_medication", note: "自己拿櫃子裡的止痛藥吃,大概三四次" },
        { kind: "alcohol", note: "最近也比較常喝酒" },
        { kind: "missed_dose", note: "上禮拜有一天早上的血壓藥忘記吃" },
      ]),
    );

    expect(result.usedFallback).toBe(false);
    expect(result.observations).toHaveLength(4);
    expect(result.observations.map((o) => o.kind)).toEqual([
      "symptom",
      "self_medication",
      "alcohol",
      "missed_dose",
    ]);
    // Every note is still a span the caregiver wrote.
    for (const o of result.observations) {
      expect(PARAGRAPH.replace(/\s/g, "")).toContain(o.note.replace(/\s/g, ""));
    }
  });

  it("tolerates whitespace differing between input and echo", async () => {
    const result = await parseObservations(
      "他 最近 比較常喝酒",
      stub([{ kind: "alcohol", note: "最近比較常喝酒" }]),
    );
    expect(result.usedFallback).toBe(false);
    expect(result.observations[0].note).toBe("最近比較常喝酒");
  });
});

describe("what the verbatim check throws away", () => {
  it("a note the caregiver never wrote", async () => {
    // The failure this file exists to prevent: a symptom nobody reported,
    // arriving on a sheet a doctor will read.
    const result = await parseObservations(
      PARAGRAPH,
      stub([
        { kind: "symptom", note: "這兩週晚上腰痛睡不著" },
        { kind: "symptom", note: "也有胸悶和呼吸困難" },
      ]),
    );

    expect(result.observations).toHaveLength(1);
    expect(result.rejected).toEqual([
      { kind: "symptom", note: "也有胸悶和呼吸困難", reason: "not_verbatim" },
    ]);
  });

  it("a tidied-up rewrite of something that was said", async () => {
    // Smoothing is invention too: 「比較常」 is not a quantity, and a clinician
    // reading "每週三到四次" would be reading the model, not the family.
    const result = await parseObservations(
      "最近也比較常喝酒",
      stub([{ kind: "alcohol", note: "飲酒頻率增加至每週三到四次" }]),
    );

    expect(result.usedFallback).toBe(true);
    expect(result.observations[0].note).toBe("最近也比較常喝酒");
    expect(result.rejected[0].reason).toBe("not_verbatim");
  });

  it("a kind that is not in the vocabulary", async () => {
    const result = await parseObservations(
      PARAGRAPH,
      stub([
        { kind: "diagnosis", note: "這兩週晚上腰痛睡不著" },
        { kind: "symptom", note: "最近也比較常喝酒" },
      ]),
    );
    expect(result.rejected[0].reason).toBe("unknown_kind");
    expect(result.observations).toHaveLength(1);
  });
});

describe("falling back to the caregiver's paragraph", () => {
  it("with no model configured", async () => {
    const result = await parseObservations(PARAGRAPH, null);
    expect(result.usedFallback).toBe(true);
    expect(result.observations).toEqual([{ kind: "other", note: PARAGRAPH }]);
  });

  it("when the model throws", async () => {
    const broken: ObservationExtractor = {
      async extract() {
        throw new Error("network");
      },
    };
    const result = await parseObservations(PARAGRAPH, broken);
    expect(result.usedFallback).toBe(true);
    expect(result.observations[0].note).toBe(PARAGRAPH);
  });

  it("when nothing the model returned survived the check", async () => {
    // Keeping the paragraph whole beats keeping nothing, and beats keeping
    // whichever fragments happened to survive a broken response.
    const result = await parseObservations(
      PARAGRAPH,
      stub([
        { kind: "symptom", note: "完全沒說過的事" },
        { kind: "alcohol", note: "也沒說過這個" },
      ]),
    );
    expect(result.usedFallback).toBe(true);
    expect(result.observations).toEqual([{ kind: "other", note: PARAGRAPH }]);
    expect(result.rejected).toHaveLength(2);
  });

  it("returns nothing at all for an empty input, rather than an empty note", async () => {
    for (const empty of ["", "   ", "\n"]) {
      const result = await parseObservations(empty, null);
      expect(result.observations).toEqual([]);
    }
  });
});
