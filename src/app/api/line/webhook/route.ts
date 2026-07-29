import { handleLineWebhookRequest } from "@/lib/delivery/line/webhook";
import { handleInbound } from "@/lib/delivery/inbound";
import { deliverSummaryQrToLine } from "@/lib/summary/deliver-qr-to-line";

/**
 * POST /api/line/webhook — thin transport shell.
 *
 * Transport normalisation lives in src/lib/delivery/line/webhook.ts so it can
 * be tested offline. This shell only composes the current request origin into
 * the in-process summary-QR dependency.
 *
 * Reads the RAW body before anything parses it — the signature is computed
 * over raw bytes (§7).
 */
// Voice replies run pipeline + Fish synthesis + Blob inside this invocation;
// the platform default duration can kill them mid-work, which surfaces as a
// reply that never arrives (LINE's retry is then deduped by design).
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");
  const baseUrl = new URL(req.url).origin;

  const { status } = await handleLineWebhookRequest(rawBody, signature, {
    onInbound: (msg) =>
      handleInbound(msg, {
        webBaseUrl: baseUrl,
        summaryQrDelivery: (subjectId) =>
          deliverSummaryQrToLine({ subjectId, baseUrl }),
      }),
  });

  // §6.3 / §6.4 — the adapter never composes user-facing content, including
  // in error paths: HTTP status codes only, no reply bodies, no LINE replies
  // generated here.
  return new Response(null, { status });
}
