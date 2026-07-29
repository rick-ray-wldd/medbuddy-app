import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeMedicationBagExtractor } from "./claude";
import type { ExtractionRequest } from "./types";

/** Big enough to pass the size gate; contents irrelevant to a faked fetch. */
const BYTES = new Uint8Array(30_000).fill(7);

function request(): ExtractionRequest {
  return {
    requestId: "r1",
    subjectId: "subj-father",
    submittedByCarerId: "carer-demo",
    images: [{ imageId: "i1", bytes: BYTES, mediaType: "image/jpeg" }],
  };
}

function field(value: string | null, evidence: string | null = value) {
  return { value, status: "observed" as const, evidence, locationHint: "row 1" };
}

function toolResponse(input: unknown): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        content: [{ type: "tool_use", name: "record_medication_bag", input }],
      }),
      { status: 200 },
    )) as unknown as typeof fetch;
}

const ONE_GOOD_ROW = {
  isMedicationBag: true,
  patientIdentifyingTextDetected: false,
  provenance: {
    institution: field("某某醫院"),
    department: field("家醫科"),
    dispensedOn: field("2026-07-20"),
  },
  rows: [
    {
      rowIndex: 0,
      printedName: field("普拿疼膜衣錠500毫克"),
      printedNameZh: field("普拿疼膜衣錠500毫克"),
      strength: field("500毫克"),
      dosePerAdministration: field("1 顆"),
      frequency: field("每日三次"),
      route: field("口服"),
      timing: field("飯後"),
      durationDays: field("7"),
      quantity: field("21"),
    },
  ],
};

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the quality gate runs before any request is spent", () => {
  it("refuses an image too small to hold pharmacy print", async () => {
    let called = false;
    const extractor = new ClaudeMedicationBagExtractor({
      fetchImpl: (async () => {
        called = true;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });

    const result = await extractor.extract({
      ...request(),
      images: [{ imageId: "i1", bytes: new Uint8Array(500), mediaType: "image/jpeg" }],
    });

    expect(result).toMatchObject({ ok: false, failure: "image_too_small" });
    // A tiny photo produces a confident transcription of noise; not asking is
    // cheaper and safer than asking and discarding.
    expect(called).toBe(false);
  });

  it("refuses to guess without an API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const result = await new ClaudeMedicationBagExtractor().extract(request());
    expect(result).toMatchObject({ ok: false, failure: "model_unavailable" });
  });
});

describe("a clean bag", () => {
  it("returns every row and still demands human review", async () => {
    const extractor = new ClaudeMedicationBagExtractor({
      fetchImpl: toolResponse(ONE_GOOD_ROW),
    });
    const result = await extractor.extract(request());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.rows).toHaveLength(1);
    expect(result.extraction.rows[0].printedName.value).toBe("普拿疼膜衣錠500毫克");
    // Not a threshold that can be crossed: review is unconditional in v1, even
    // when every field was crisp.
    expect(result.extraction.needsHumanReview).toBe(true);
    expect(result.extraction.reviewReasons).toEqual([]);
  });
});

describe("what the adapter refuses to pass on", () => {
  it("blanks a drug name the model inferred rather than read", async () => {
    // The bag says what it treats; the model returns what treats it. This is
    // the failure the whole module is built around.
    const extractor = new ClaudeMedicationBagExtractor({
      fetchImpl: toolResponse({
        ...ONE_GOOD_ROW,
        rows: [
          {
            ...ONE_GOOD_ROW.rows[0],
            printedName: field("AMLODIPINE", "降血壓 每日一次"),
          },
        ],
      }),
    });

    const result = await extractor.extract(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.rows[0].printedName.value).toBeNull();
    expect(result.extraction.reviewReasons.join()).toContain("printedName");
    // The rest of the row survives — dropping it would throw away good fields.
    expect(result.extraction.rows[0].strength.value).toBe("500毫克");
  });

  it("reports identifying text as a boolean and never carries it", async () => {
    const extractor = new ClaudeMedicationBagExtractor({
      fetchImpl: toolResponse({ ...ONE_GOOD_ROW, patientIdentifyingTextDetected: true }),
    });
    const result = await extractor.extract(request());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.patientIdentifyingTextDetected).toBe(true);
    // No field anywhere holds a name. The output contract has nowhere to put
    // one, which is the point.
    expect(JSON.stringify(result.extraction)).not.toMatch(/身分證|病歷號/);
  });

  it("says a photo is not a bag rather than transcribing whatever is in it", async () => {
    const extractor = new ClaudeMedicationBagExtractor({
      fetchImpl: toolResponse({ ...ONE_GOOD_ROW, isMedicationBag: false }),
    });
    expect(await extractor.extract(request())).toMatchObject({
      ok: false,
      failure: "not_a_medication_bag",
    });
  });

  it("reports an empty read rather than an empty success", async () => {
    const extractor = new ClaudeMedicationBagExtractor({
      fetchImpl: toolResponse({ ...ONE_GOOD_ROW, rows: [] }),
    });
    expect(await extractor.extract(request())).toMatchObject({
      ok: false,
      failure: "no_rows_found",
    });
  });
});

describe("when the model is not there", () => {
  it("reports a transport failure rather than a blank bag", async () => {
    const extractor = new ClaudeMedicationBagExtractor({
      fetchImpl: (async () => new Response("nope", { status: 529 })) as unknown as typeof fetch,
    });
    expect(await extractor.extract(request())).toMatchObject({
      ok: false,
      failure: "model_unavailable",
    });
  });

  it("survives a response with no tool call in it", async () => {
    const extractor = new ClaudeMedicationBagExtractor({
      fetchImpl: (async () =>
        new Response(JSON.stringify({ content: [{ type: "text" }] }), {
          status: 200,
        })) as unknown as typeof fetch,
    });
    expect(await extractor.extract(request())).toMatchObject({
      ok: false,
      failure: "model_returned_unusable_output",
    });
  });

  it("survives a network throw", async () => {
    const extractor = new ClaudeMedicationBagExtractor({
      fetchImpl: (async () => {
        throw new Error("ECONNRESET");
      }) as unknown as typeof fetch,
    });
    expect(await extractor.extract(request())).toMatchObject({
      ok: false,
      failure: "model_unavailable",
    });
  });
});

describe("row numbers are ours, not the pharmacy's", () => {
  it("renumbers from array position", async () => {
    // A real bag came back as one row carrying rowIndex 2 — the number printed
    // on the bag. The review reason then read 「第 3 列」 to a caregiver
    // looking at a single row. Position is the only thing that can point at
    // something on screen.
    const extractor = new ClaudeMedicationBagExtractor({
      fetchImpl: toolResponse({
        ...ONE_GOOD_ROW,
        rows: [
          { ...ONE_GOOD_ROW.rows[0], rowIndex: 2 },
          { ...ONE_GOOD_ROW.rows[0], rowIndex: 7 },
        ],
      }),
    });

    const result = await extractor.extract(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.rows.map((r) => r.rowIndex)).toEqual([0, 1]);
  });
});
