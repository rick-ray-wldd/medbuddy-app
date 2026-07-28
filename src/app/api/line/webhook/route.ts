import { handleLineWebhookRequest } from "@/lib/delivery/line/webhook";

/**
 * POST /api/line/webhook — thin transport shell.
 *
 * All logic lives in src/lib/delivery/line/webhook.ts so it can be tested
 * offline without booting Next (spec §8: `npm test` must pass on a clean
 * clone with no credentials).
 *
 * Reads the RAW body before anything parses it — the signature is computed
 * over raw bytes (§7).
 */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  const { status } = await handleLineWebhookRequest(rawBody, signature);

  // §6.3 / §6.4 — the adapter never composes user-facing content, including
  // in error paths: HTTP status codes only, no reply bodies, no LINE replies
  // generated here.
  return new Response(null, { status });
}
