import "server-only";

import QRCode from "qrcode";
import type { Delivery } from "@/lib/delivery/types";
import type { RoleStore } from "@/lib/roles/types";
import { LineDelivery } from "@/lib/delivery/line/LineDelivery";
import { getLineConfig } from "@/lib/delivery/line/config";
import {
  getDemoLinePair,
  recipientForDemoRole,
} from "@/lib/delivery/line/demo-pair";
import { findSubject } from "@/lib/subjects";
import { summaryQrPath } from "./qr-path";
import { createShareToken, shareUrl } from "./share-token";

export type SummaryQrDeliveryRequest = {
  subjectId: string;
  /** Origin of the deployment that received the request, without `/summary`. */
  baseUrl: string;
};

export type SummaryQrDeliveryResult =
  | {
      ok: true;
      deliveredAt: string;
      recipients: { elder: true; caregiver: boolean };
    }
  | {
      ok: false;
      code:
        | "unknown-subject"
        | "outside-demo-pair"
        | "missing-elder-recipient"
        | "share-secret-unconfigured"
        | "elder-delivery-failed";
      reason: string;
    };

export type SummaryQrDeliveryDeps = {
  now?: () => number;
  renderQr?: (url: string) => Promise<Uint8Array>;
  storeQr?: (
    path: string,
    png: Uint8Array,
  ) => Promise<{ url: string }>;
  delivery?: Delivery;
  /** Injectable so offline tests need no store; defaults to the registry's. */
  roleStore?: RoleStore;
};

async function renderQr(url: string): Promise<Uint8Array> {
  return await QRCode.toBuffer(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });
}

async function storeQr(path: string, png: Uint8Array): Promise<{ url: string }> {
  const { put } = await import("@vercel/blob");
  return await put(path, png as unknown as Blob, {
    // LINE must fetch the image. The image carries only the short-lived,
    // signed token already visible in the QR, not clinical content itself.
    access: "public",
    addRandomSuffix: false,
    // The signed token is deterministic for one subject at one millisecond,
    // so a retry may legitimately address this exact pathname again. The QR
    // bytes are identical; overwriting makes that retry idempotent.
    allowOverwrite: true,
    contentType: "image/png",
  });
}

function lineDelivery(): Delivery {
  return new LineDelivery({
    channelAccessToken: getLineConfig().channelAccessToken,
  });
}

/**
 * Creates and sends the clinician-summary QR entirely inside this process.
 *
 * Both callers (the HTTP route and LINE inbound action) supply the deployment
 * origin that received their request. This keeps Blob, LINE credentials, and
 * demo-pair routing in one Vercel project instead of making an HTTP call via a
 * potentially stale public base URL.
 */
export async function deliverSummaryQrToLine(
  request: SummaryQrDeliveryRequest,
  deps: SummaryQrDeliveryDeps = {},
): Promise<SummaryQrDeliveryResult> {
  const subject = findSubject(request.subjectId);
  if (!subject) {
    return { ok: false, code: "unknown-subject", reason: "unknown subject" };
  }

  if (subject.id !== getDemoLinePair().subjectId) {
    return {
      ok: false,
      code: "outside-demo-pair",
      reason: "the demo supports one fixed care subject",
    };
  }

  // Who is the older adult's phone? The role binding knows, because he
  // answered the card. The environment variable is a fallback, not the
  // source: it was empty during the demo — deliberately, so one phone could
  // show both sides — and this failed with "no LINE account is bound to 父親"
  // while his phone had been bound as the elder for twenty minutes.
  //
  // Injectable so the offline tests keep working without a store.
  const roleStore = deps.roleStore ?? (await import("@/lib/registry")).getRegistry().roleStore;
  const boundElder = await roleStore.findByRole(subject.id, "elder").catch(() => null);
  const elderTo = boundElder?.channelUserId ?? recipientForDemoRole("elder");
  if (!elderTo) {
    return {
      ok: false,
      code: "missing-elder-recipient",
      reason: `no LINE account is bound to ${subject.displayName}`,
    };
  }
  const boundCaregiver = await roleStore
    .findByRole(subject.id, "caregiver")
    .catch(() => null);
  const caregiverTo = boundCaregiver?.channelUserId ?? recipientForDemoRole("caregiver");

  const now = deps.now?.() ?? Date.now();
  const token = createShareToken(subject.id, now);
  if (!token) {
    return {
      ok: false,
      code: "share-secret-unconfigured",
      reason: "SUMMARY_SHARE_SECRET is not configured; refusing to mint a link",
    };
  }

  const url = shareUrl(
    `${request.baseUrl.trim().replace(/\/$/, "")}/summary`,
    token,
  );
  const png = await (deps.renderQr ?? renderQr)(url);
  const stored = await (deps.storeQr ?? storeQr)(summaryQrPath(token), png);
  const delivery = deps.delivery ?? lineDelivery();

  const elderResult = await delivery.send(
    {
      channelUserId: elderTo,
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

  if (!elderResult.ok) {
    return {
      ok: false,
      code: "elder-delivery-failed",
      reason: elderResult.reason,
    };
  }

  // The elder's copy is the required delivery. A caregiver copy is useful
  // context, but its failure must not turn a successful appointment handoff
  // into an HTTP failure or trigger a duplicate elder send on retry.
  let caregiverDelivered = false;
  if (caregiverTo) {
    const caregiverResult = await delivery.send(
      {
        channelUserId: caregiverTo,
        role: "caregiver",
        subject: { id: subject.id, displayName: subject.displayName },
      },
      {
        text:
          `已經把${subject.displayName}的回診單傳過去了,同一張也附在下面。\n` +
          `裡面是目前的用藥清單,以及您記下來的觀察。\n` +
          `連結 8 小時後失效:${url}`,
        imageUrl: stored.url,
      },
    );
    caregiverDelivered = caregiverResult.ok;
    if (!caregiverResult.ok) {
      console.error("[medbuddy] caregiver copy of summary QR failed", {
        reason: caregiverResult.reason,
      });
    }
  }

  return {
    ok: true,
    deliveredAt: new Date(now).toISOString(),
    recipients: { elder: true, caregiver: caregiverDelivered },
  };
}
