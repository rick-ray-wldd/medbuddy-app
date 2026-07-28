/**
 * Gemini as a segmenter.
 *
 * It is asked to do one thing: cut a caregiver's paragraph into spans and
 * label each. It is told, in the prompt, that every span must be copied
 * exactly — and then `parseObservations` checks that rather than believing it,
 * because a prompt is a request and a substring test is a guarantee.
 *
 * Structured output is used so the response is a shape rather than prose to
 * parse out of a paragraph.
 */

import type { ObservationExtractor } from "./parse";

/**
 * Tracks the current flash model rather than pinning one.
 *
 * Pinning is normally right here — this repository records rule set versions
 * precisely so a past check can be reproduced. It is wrong for this call. The
 * first version of this file pinned gemini-2.0-flash, which had already been
 * retired: every request 404'd and every paragraph silently took the fallback.
 * The fallback is safe, so nothing broke loudly; it just quietly stopped
 * segmenting. A pinned model fails that way on somebody else's schedule.
 *
 * Reproducibility is not lost, because segmentation output is checked against
 * the caregiver's own words rather than trusted — see parse.ts.
 */
const MODEL = "gemini-flash-latest";
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SYSTEM = `你的任務是把一段照顧者描述家人狀況的文字,切成幾個獨立的觀察,並為每一段標上類別。

你只做兩件事:切開,和分類。

## 絕對規則
- note 欄位必須是原文的**逐字片段**,一個字都不能改。
- 不可以改寫、潤飾、統一格式、補上單位或次數。
- 不可以加入原文沒有提到的症狀、藥物或事件。
- 不可以推論。原文說「比較常喝酒」就是「比較常喝酒」,不是「每週三次」。
- 原文沒提到的事就不要產生任何一列。

## 類別
- symptom:身體不舒服的描述
- self_medication:自己買的、自己拿的、沒有經過醫囑的用藥
- alcohol:飲酒
- missed_dose:漏吃、忘記吃處方藥
- other:以上都不是,但值得讓醫師知道

一段文字可能包含多個觀察,也可能只有一個。`;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

export class GeminiObservationExtractor implements ObservationExtractor {
  async extract(text: string): Promise<{ kind: string; note: string }[]> {
    const key = process.env.GEMINI_API_KEY?.trim();
    // No key, no request. The caller falls back to keeping the paragraph
    // whole, which is a worse structure and never a wrong one.
    if (!key) throw new Error("GEMINI_API_KEY is not configured");

    const res = await fetch(`${ENDPOINT(MODEL)}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
          // Segmentation is not a creative task; the same paragraph should cut
          // the same way twice.
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                kind: {
                  type: "STRING",
                  enum: ["symptom", "self_medication", "alcohol", "missed_dose", "other"],
                },
                note: { type: "STRING" },
              },
              required: ["kind", "note"],
            },
          },
        },
      }),
    });

    if (!res.ok) throw new Error(`gemini responded ${res.status}`);

    const data = (await res.json()) as GeminiResponse;
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("gemini returned no content");

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("gemini did not return an array");

    return parsed
      .filter(
        (row): row is { kind: string; note: string } =>
          typeof row === "object" &&
          row !== null &&
          typeof (row as { kind?: unknown }).kind === "string" &&
          typeof (row as { note?: unknown }).note === "string",
      )
      .map((row) => ({ kind: row.kind, note: row.note }));
  }
}

/** Configured or not, decided in one place. */
export function observationExtractor(): ObservationExtractor | null {
  return process.env.GEMINI_API_KEY?.trim() ? new GeminiObservationExtractor() : null;
}
