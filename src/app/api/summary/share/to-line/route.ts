/**
 * POST /api/summary/share/to-line — send the QR to the older adult's LINE.
 *
 * This is the case the product exists for: the caregiver cannot come to the
 * appointment, so the record travels in the elder's pocket instead of in the
 * caregiver's head.
 *
 * The QR goes as an **image**. `LINE-ADAPTER-SPEC` §6.1 forbids sending him a
 * tappable link, because he taps links without checking — and an image is not
 * a link. He does not open it; he holds it up to a doctor.
 */

import { NextResponse } from "next/server";
import {
  deliverSummaryQrToLine,
  type SummaryQrDeliveryResult,
} from "@/lib/summary/deliver-qr-to-line";

function statusFor(result: Extract<SummaryQrDeliveryResult, { ok: false }>): number {
  switch (result.code) {
    case "unknown-subject":
    case "outside-demo-pair":
    case "missing-elder-recipient":
      return 400;
    case "share-secret-unconfigured":
      return 503;
    case "elder-delivery-failed":
      return 502;
  }
}

export async function POST(request: Request) {
  let body: { subjectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const result = await deliverSummaryQrToLine({
    subjectId: body.subjectId ?? "",
    // The request tells us which deployment is serving this action. A public
    // env var can be stale or belong to another Vercel project.
    baseUrl: new URL(request.url).origin,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: statusFor(result) },
    );
  }

  return NextResponse.json(result);
}
