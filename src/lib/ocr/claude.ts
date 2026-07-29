/**
 * Claude Sonnet as a transcriber.
 *
 * It is asked to do one thing: read what is printed on a medication bag and
 * copy it out, field by field, with the quote each value came from. It is told
 * not to identify, infer, or complete anything — and then `validate.ts` checks
 * that rather than believing it, because a prompt is a request and a substring
 * test is a guarantee.
 *
 * ## Why the model is not pinned to a dated snapshot
 *
 * Same reasoning as `observations/gemini.ts`, learned the hard way there: a
 * pinned snapshot was retired, every call 404'd, and every request silently
 * took the fallback. Reproducibility is not lost, because output is checked
 * against the bag's own text rather than trusted.
 *
 * ## Why the image never leaves as anything but bytes
 *
 * No filename, no EXIF stripping claims, no storage. The bytes go to Anthropic
 * for one request and are not persisted here. A medication bag photograph
 * carries a patient's name; the output contract excludes it and this path
 * gives it nowhere to land.
 */

import type {
  ExtractionRequest,
  ExtractionResult,
  MedicationBagExtraction,
  MedicationBagExtractor,
} from "./types";
import { validateExtraction } from "./validate";

const MODEL = "claude-sonnet-5";
const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/** Below this a photograph cannot carry legible 8pt pharmacy print. */
const MIN_BYTES = 20_000;
/** Anthropic's per-image ceiling; also a sane guard against a video frame dump. */
const MAX_BYTES = 5_000_000;

const SYSTEM = `你的任務是**照抄**藥袋上印出來的文字,不是判讀處方。

## 絕對規則

1. 只寫你在圖片上**看得見**的字。看不見就用 null。
2. 每一個欄位都要附上 evidence:圖片上支持這個值的**最短原文片段**。
   value 必須逐字出現在 evidence 裡面。
3. **不可以**從藥丸顏色、形狀、適應症、科別、或旁邊那一列推論藥名。
4. **不可以**用你的醫藥知識補上沒印出來的劑量、頻次、途徑、時間、天數。
5. 看不清楚就用 partially_legible;完全沒印就用 not_visible;
   同一欄位出現兩種不一致的寫法就用 conflicting。
6. **不要**回傳病人姓名、身分證號、病歷號、地址、電話、生日。
   只要回報 patientIdentifyingTextDetected 是 true 還是 false。

## 為什麼

這份輸出會進入一個人的用藥紀錄。補一個看起來合理的值,比留白危險得多 ——
留白會有人去問,補上的值不會。`;

const TOOL = {
  name: "record_medication_bag",
  description: "記錄藥袋上看得見的文字。只照抄,不判讀。",
  input_schema: {
    type: "object" as const,
    properties: {
      rows: {
        type: "array",
        description: "藥袋上每一列藥品,依印出來的順序",
        items: {
          type: "object",
          properties: {
            rowIndex: { type: "integer" },
            printedName: { $ref: "#/$defs/field" },
            strength: { $ref: "#/$defs/field" },
            dosePerAdministration: { $ref: "#/$defs/field" },
            frequency: { $ref: "#/$defs/field" },
            route: { $ref: "#/$defs/field" },
            timing: { $ref: "#/$defs/field" },
            durationDays: { $ref: "#/$defs/field" },
            quantity: { $ref: "#/$defs/field" },
          },
          required: [
            "rowIndex",
            "printedName",
            "strength",
            "dosePerAdministration",
            "frequency",
            "route",
            "timing",
            "durationDays",
            "quantity",
          ],
        },
      },
      provenance: {
        type: "object",
        properties: {
          institution: { $ref: "#/$defs/field" },
          department: { $ref: "#/$defs/field" },
          dispensedOn: { $ref: "#/$defs/field" },
        },
        required: ["institution", "department", "dispensedOn"],
      },
      patientIdentifyingTextDetected: {
        type: "boolean",
        description: "圖片上是否出現姓名/身分證號/病歷號等。只回 true 或 false,不要回傳內容。",
      },
      isMedicationBag: {
        type: "boolean",
        description: "這張圖是不是藥袋或處方箋。不是的話其餘欄位留空。",
      },
    },
    required: ["rows", "provenance", "patientIdentifyingTextDetected", "isMedicationBag"],
    $defs: {
      field: {
        type: "object",
        properties: {
          value: { type: ["string", "null"], description: "逐字照抄,或 null" },
          status: {
            type: "string",
            enum: ["observed", "partially_legible", "not_visible", "conflicting"],
          },
          evidence: {
            type: ["string", "null"],
            description: "圖片上支持這個值的最短原文片段。value 必須出現在裡面。",
          },
          locationHint: {
            type: ["string", "null"],
            description: "粗略位置,例如「藥品表格第 2 列」。不要編造精確座標。",
          },
        },
        required: ["value", "status", "evidence", "locationHint"],
      },
    },
  },
};

type AnthropicResponse = {
  content?: { type: string; name?: string; input?: unknown }[];
};

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export class ClaudeMedicationBagExtractor implements MedicationBagExtractor {
  private readonly fetchImpl: typeof fetch;

  constructor(deps: { fetchImpl?: typeof fetch } = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) return { ok: false, failure: "model_unavailable", detail: "no api key" };

    const image = request.images[0];
    if (!image) return { ok: false, failure: "image_unreadable", detail: "no image" };

    // Quality gate before spending a request: a photograph too small to hold
    // pharmacy print will produce a confident-looking transcription of noise.
    if (image.bytes.byteLength < MIN_BYTES) {
      return { ok: false, failure: "image_too_small" };
    }
    if (image.bytes.byteLength > MAX_BYTES) {
      return { ok: false, failure: "image_unreadable", detail: "over 5MB" };
    }

    let res: Response;
    try {
      res = await this.fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": API_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system: SYSTEM,
          // Forced through the tool so the response is a shape rather than
          // prose to parse a shape out of.
          tools: [TOOL],
          tool_choice: { type: "tool", name: TOOL.name },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: image.mediaType,
                    data: toBase64(image.bytes),
                  },
                },
                {
                  type: "text",
                  text: "請照抄這張藥袋上看得見的文字。看不見的欄位用 null,不要推論。",
                },
              ],
            },
          ],
        }),
      });
    } catch (err) {
      return {
        ok: false,
        failure: "model_unavailable",
        detail: err instanceof Error ? err.message : "network",
      };
    }

    if (!res.ok) {
      return { ok: false, failure: "model_unavailable", detail: `http ${res.status}` };
    }

    let parsed: Record<string, unknown>;
    try {
      const body = (await res.json()) as AnthropicResponse;
      const call = body.content?.find((c) => c.type === "tool_use" && c.name === TOOL.name);
      if (!call?.input) {
        return { ok: false, failure: "model_returned_unusable_output" };
      }
      parsed = call.input as Record<string, unknown>;
    } catch {
      return { ok: false, failure: "model_returned_unusable_output" };
    }

    if (parsed.isMedicationBag === false) {
      return { ok: false, failure: "not_a_medication_bag" };
    }

    const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];
    if (rawRows.length === 0) return { ok: false, failure: "no_rows_found" };

    const draft: MedicationBagExtraction = {
      requestId: request.requestId,
      // Renumbered from the array, not taken from the model.
      //
      // Asked for a row index, it returns the number printed on the bag — a
      // real bag came back as a single row with rowIndex 2, and the review
      // reason then read 「第 3 列」 to a caregiver looking at one row. The
      // printed number is the pharmacy's; the position is ours, and only ours
      // can be used to point at something on screen.
      rows: (rawRows as MedicationBagExtraction["rows"]).map((row, i) => ({
        ...row,
        rowIndex: i,
      })),
      provenance: parsed.provenance as MedicationBagExtraction["provenance"],
      patientIdentifyingTextDetected: parsed.patientIdentifyingTextDetected === true,
      needsHumanReview: true,
      reviewReasons: [],
    };

    // The guarantee. Everything above this line is what the model said.
    const checked = validateExtraction(draft);
    if (checked.rejections.length > 0) {
      console.error("[medbuddy] ocr fields rejected", {
        requestId: request.requestId,
        rejections: checked.rejections,
      });
    }

    return {
      ok: true,
      extraction: {
        ...draft,
        rows: checked.rows,
        reviewReasons: checked.reviewReasons,
      },
    };
  }
}

/** Configured or not, decided in one place. */
export function medicationBagExtractor(): MedicationBagExtractor | null {
  return process.env.ANTHROPIC_API_KEY?.trim()
    ? new ClaudeMedicationBagExtractor()
    : null;
}
