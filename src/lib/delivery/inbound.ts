/**
 * ⚠️ OWNERSHIP: Ray owns this file (spec §3, §5).
 *
 * Stubbed per spec §9: "`handleInbound` may not exist yet — stub it and carry
 * on." If Ray's version already exists in the repo, KEEP RAY'S VERSION AND
 * DELETE THIS ONE — never overwrite.
 *
 * Decision to flag to Ray: `InboundMessage` lives here (next to its consumer)
 * rather than inside the line module, so Ray never has to import from
 * `delivery/line/**`. Move it if Ray prefers it elsewhere.
 */

export type InboundMessage = {
  channelUserId: string;
  receivedAt: string; // ISO 8601
  providerMessageId: string; // for idempotency
  body:
    | { kind: "text"; text: string }
    | { kind: "audio"; audio: Uint8Array; format: string; durationMs?: number };
};

/**
 * STUB — Ray will replace this. The LINE adapter hands every normalised
 * inbound message here and does nothing else with it: no interpretation,
 * no transcription (spec §5 — transcription is a product decision upstream).
 */
export async function handleInbound(msg: InboundMessage): Promise<void> {
  console.log("[medbuddy] handleInbound stub received", {
    channelUserId: msg.channelUserId,
    kind: msg.body.kind,
    providerMessageId: msg.providerMessageId,
  });
}
