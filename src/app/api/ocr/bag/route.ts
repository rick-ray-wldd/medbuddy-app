/**
 * Read a medication bag.
 *
 * Returns a **draft**, never a record. Nothing here writes to the log, and
 * that is the design rather than an omission: the contract makes human review
 * unconditional, so the write happens after a caregiver confirms, through the
 * ordinary check path where grounding and the rules apply.
 *
 * Accepts multipart so the same endpoint serves a file picked from the camera
 * roll and one taken on the spot — on a phone those are the same `<input>`
 * with a different attribute, and they should not be two APIs.
 */

import { NextResponse } from "next/server";
import { findSubject } from "@/lib/subjects";
import { medicationBagExtractor } from "@/lib/ocr/claude";
import type { MedicationBagImage } from "@/lib/ocr/types";

const ACCEPTED: MedicationBagImage["mediaType"][] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const subjectId = String(form.get("subjectId") ?? "");
  const subject = findSubject(subjectId);
  if (!subject) return NextResponse.json({ error: "unknown subject" }, { status: 400 });

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }

  // Kept as the arbitrary string it is until it is checked. Asserting the
  // narrow type first would make the HEIC branch below unreachable to the
  // compiler — and HEIC is what an iPhone actually sends.
  const mediaType = file.type;
  if (!ACCEPTED.includes(mediaType as MedicationBagImage["mediaType"])) {
    // HEIC is what an iPhone produces by default and Anthropic does not accept
    // it. Saying so beats a generic failure the caregiver cannot act on.
    return NextResponse.json(
      {
        error:
          mediaType === "image/heic" || mediaType === "image/heif"
            ? "iPhone 的 HEIC 格式不支援,請在拍照設定改成「相容性最佳」或先轉存成 JPEG"
            : `不支援的圖片格式:${file.type || "未知"}`,
      },
      { status: 415 },
    );
  }

  const extractor = medicationBagExtractor();
  if (!extractor) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured; refusing to guess a bag's contents" },
      { status: 503 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const requestId = `bag-${subject.id}-${Date.now()}`;

  const result = await extractor.extract({
    requestId,
    // Resolved here from the caller, never chosen by OCR. A row attached to
    // the wrong person is the worst error this product can make.
    subjectId: subject.id,
    submittedByCarerId: String(form.get("carerId") ?? "carer-demo"),
    images: [
      { imageId: requestId, bytes, mediaType: mediaType as MedicationBagImage["mediaType"] },
    ],
  });

  if (!result.ok) {
    // Ids and the failure kind only — never the image, never its text.
    console.error("[medbuddy] bag extraction failed", {
      requestId,
      failure: result.failure,
    });
    return NextResponse.json(
      { error: result.failure, detail: result.detail },
      { status: result.failure === "model_unavailable" ? 502 : 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    subject: { id: subject.id, displayName: subject.displayName },
    extraction: result.extraction,
  });
}
