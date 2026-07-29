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
import QRCode from "qrcode";
import { findSubject } from "@/lib/subjects";
import { createShareToken, shareUrl } from "@/lib/summary/share-token";
import { getLineConfig } from "@/lib/delivery/line/config";
import { LineDelivery } from "@/lib/delivery/line/LineDelivery";
import {
  getDemoLinePair,
  recipientForDemoRole,
} from "@/lib/delivery/line/demo-pair";

export async function POST(request: Request) {
  let body: { subjectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const subject = findSubject(body.subjectId ?? "");
  if (!subject) return NextResponse.json({ error: "unknown subject" }, { status: 400 });

  if (subject.id !== getDemoLinePair().subjectId) {
    return NextResponse.json(
      { error: "the demo supports one fixed care subject" },
      { status: 400 },
    );
  }

  const to = recipientForDemoRole("elder");
  if (!to) {
    // No binding, no delivery. Never guess which LINE account belongs to which
    // person — a record sent to the wrong one is the worst error here.
    return NextResponse.json(
      { error: `no LINE account is bound to ${subject.displayName}` },
      { status: 400 },
    );
  }

  const token = createShareToken(subject.id, Date.now());
  if (!token) {
    return NextResponse.json(
      { error: "SUMMARY_SHARE_SECRET is not configured; refusing to mint a link" },
      { status: 503 },
    );
  }

  const origin = process.env.NEXT_PUBLIC_BASE_URL?.trim() || new URL(request.url).origin;
  const url = shareUrl(`${origin.replace(/\/$/, "")}/summary`, token);
  const png = await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 2, width: 512 });

  const { put } = await import("@vercel/blob");
  const stored = await put(`summary-qr/${token.slice(0, 24)}.png`, png as unknown as Blob, {
    // Public because LINE fetches it to render the image, and it carries no
    // health information itself — only the short-lived token, which is
    // already in the QR the family is holding up in a waiting room.
    access: "public",
    addRandomSuffix: false,
    contentType: "image/png",
  });

  const delivery = new LineDelivery({
    channelAccessToken: getLineConfig().channelAccessToken,
  });

  // The text is written here rather than by the rules because it carries no
  // clinical content: it tells him what the picture is and what to do with it.
  const result = await delivery.send(
    {
      channelUserId: to,
      role: "elder",
      subject: { id: subject.id, displayName: subject.displayName },
    },
    {
      text:
        `${subject.displayName},這是這次回診要給醫師看的單子。\n` +
        `到診間的時候,把下面這張圖拿給醫師掃一下就好,不用做別的。\n` +
        `今天之內有效。`,
      imageUrl: stored.url,
    },
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  return NextResponse.json({ ok: true, deliveredAt: new Date().toISOString() });
}
