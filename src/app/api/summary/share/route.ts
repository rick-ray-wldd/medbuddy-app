/**
 * POST /api/summary/share — mint a short-lived link to the clinician sheet,
 * and render it as a QR code the older adult can hold up.
 *
 * The QR is the distribution channel the product has been arguing for: a
 * physician seeing forty to sixty patients in a session will not install
 * anything, so the family carries the record in and the doctor points a camera
 * at it.
 *
 * The link is deliberately not `/summary/<subjectId>`. This page is reached by
 * photographing a phone screen, so the URL names nobody and stops working the
 * same day.
 */

import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { findSubject } from "@/lib/subjects";
import { createShareToken, shareUrl } from "@/lib/summary/share-token";

function summaryBase(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  const origin = configured || new URL(request.url).origin;
  return `${origin.replace(/\/$/, "")}/summary`;
}

export async function POST(request: Request) {
  let body: { subjectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const subject = findSubject(body.subjectId ?? "");
  if (!subject) return NextResponse.json({ error: "unknown subject" }, { status: 400 });

  const token = createShareToken(subject.id, Date.now());
  if (!token) {
    // No secret configured means any token would be forgeable. Refuse rather
    // than hand out something that looks like protection.
    return NextResponse.json(
      { error: "SUMMARY_SHARE_SECRET is not configured; refusing to mint a link" },
      { status: 503 },
    );
  }

  const url = shareUrl(summaryBase(request), token);

  // Rendered server-side and returned as a data URL: the QR is an image the
  // family shows, and generating it on the client would put the token through
  // one more place it does not need to be.
  const qrDataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    // Chunky and high-contrast: this gets scanned off a phone screen, at
    // arm's length, under fluorescent light, by someone in a hurry.
    margin: 2,
    width: 512,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return NextResponse.json({
    url,
    qrDataUrl,
    subjectName: subject.displayName,
  });
}
