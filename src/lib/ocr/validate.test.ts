import { describe, expect, it } from "vitest";
import { validateExtraction } from "./validate";
import type { ExtractedField, MedicationBagExtraction } from "./types";

function field(
  value: string | null,
  status: ExtractedField["status"],
  evidence: string | null = value,
): ExtractedField {
  return { value, status, evidence, locationHint: "medication table, row 1" };
}

function extraction(
  overrides: Partial<Record<string, ExtractedField>> = {},
): MedicationBagExtraction {
  return {
    requestId: "r1",
    rows: [
      {
        rowIndex: 0,
        printedName: field("普拿疼膜衣錠500毫克", "observed"),
        strength: field("500毫克", "observed"),
        dosePerAdministration: field("1 顆", "observed"),
        frequency: field("每日三次", "observed"),
        route: field("口服", "observed"),
        timing: field("飯後", "observed"),
        durationDays: field("7", "observed"),
        quantity: field("21", "observed"),
        ...overrides,
      },
    ],
    provenance: {
      institution: field("某某醫院", "observed"),
      department: field("家醫科", "observed"),
      dispensedOn: field("2026-07-20", "observed"),
    },
    patientIdentifyingTextDetected: false,
    needsHumanReview: true,
    reviewReasons: [],
  };
}

describe("a value must be inside the quote it claims to come from", () => {
  it("keeps a field whose value is in its evidence", () => {
    const { rejections } = validateExtraction(extraction());
    expect(rejections).toEqual([]);
  });

  it("rejects a drug name inferred from the indication", () => {
    // The failure this module exists to prevent: the bag says what it treats,
    // the model returns what treats it.
    const { rows, rejections } = validateExtraction(
      extraction({
        printedName: field("AMLODIPINE", "observed", "降血壓 每日一次"),
      }),
    );

    expect(rejections).toEqual([
      { rowIndex: 0, field: "printedName", reason: "value_not_in_evidence" },
    ]);
    // Blanked rather than dropped: the rest of the row is still usable, and a
    // caregiver can see exactly what needs typing.
    expect(rows[0].printedName).toMatchObject({ value: null, status: "not_visible" });
    expect(rows[0].strength.value).toBe("500毫克");
  });

  it("rejects a dose carried over from a neighbouring row", () => {
    const { rejections } = validateExtraction(
      extraction({
        dosePerAdministration: field("2 顆", "observed", "1 顆 每日三次"),
      }),
    );
    expect(rejections[0].reason).toBe("value_not_in_evidence");
  });

  it("rejects an observed field with no quote at all", () => {
    const { rejections } = validateExtraction(
      extraction({ frequency: field("每日三次", "observed", null) }),
    );
    expect(rejections[0].reason).toBe("observed_without_evidence");
  });

  it("rejects a value smuggled in under not_visible", () => {
    const { rows, rejections } = validateExtraction(
      extraction({ timing: field("飯後", "not_visible", null) }),
    );
    expect(rejections[0].reason).toBe("absent_status_with_value");
    expect(rows[0].timing.value).toBeNull();
  });
});

describe("what folding tolerates, and what it does not", () => {
  it("accepts full-width digits echoed as half-width", () => {
    // The bag prints ５００毫克; the model returns 500毫克. Same thing.
    const { rejections } = validateExtraction(
      extraction({ strength: field("500毫克", "observed", "５００毫克") }),
    );
    expect(rejections).toEqual([]);
  });

  it("accepts whitespace differing between print and echo", () => {
    const { rejections } = validateExtraction(
      extraction({ frequency: field("每日三次", "observed", "每日 三 次") }),
    );
    expect(rejections).toEqual([]);
  });

  it("still rejects 5mg quoted from a bag that reads 50mg", () => {
    // Folding must never make two different doses look alike. This is the
    // case that would put a tenfold error into a record.
    const { rejections } = validateExtraction(
      extraction({ strength: field("50毫克", "observed", "5毫克 每日一次") }),
    );
    expect(rejections[0].reason).toBe("value_not_in_evidence");
  });
});

describe("review reasons name the row and the field", () => {
  it("flags a critical field that is not visible", () => {
    const { reviewReasons } = validateExtraction(
      extraction({ timing: field(null, "not_visible", null) }),
    );
    expect(reviewReasons).toHaveLength(1);
    expect(reviewReasons[0]).toContain("第 1 列");
    expect(reviewReasons[0]).toContain("timing");
  });

  it("flags a conflicting critical field differently from a missing one", () => {
    const { reviewReasons } = validateExtraction(
      extraction({ strength: field(null, "conflicting", null) }),
    );
    expect(reviewReasons[0]).toContain("不一致");
  });

  it("says nothing extra when every critical field is clear", () => {
    // needsHumanReview is still true — it is not a threshold — but there is
    // no additional reason to state.
    const { reviewReasons } = validateExtraction(extraction());
    expect(reviewReasons).toEqual([]);
  });

  it("adds a reason for a field it just rejected", () => {
    // A rejected field becomes not_visible, so it must also surface as
    // something the caregiver has to supply.
    const { reviewReasons } = validateExtraction(
      extraction({ printedName: field("AMLODIPINE", "observed", "降血壓") }),
    );
    expect(reviewReasons.some((r) => r.includes("printedName"))).toBe(true);
  });
});
