/**
 * Inbound seam: the LINE adapter hands every normalised inbound event here.
 *
 * ⚠️ OWNERSHIP: Ray owns this file (spec §3, §5). The adapter only ever calls
 * `handleInbound(msg)` and decides nothing about what it means.
 *
 * ## What arrives, and what each thing means
 *
 * | kind | meaning | answer |
 * | --- | --- | --- |
 * | `follow` | someone added the bot; we do not yet know which of the two people they are | the role card, once (spec §1) |
 * | `postback` | a press on a card or menu **we drew** — but the data comes from the client | re-checked, never trusted |
 * | `text` from an elder | he is naming a medicine | pipeline → narration |
 * | `text` from a caregiver | they are reporting an observation | segmented into the log, in their own words |
 * | `audio` | recorded, never answered | nothing, until STT is a product decision |
 *
 * ## The one asymmetry worth stating
 *
 * The same sentence means different things depending on who typed it, and the
 * role binding is what distinguishes them. 「普拿疼」 from the elder is a
 * question about a pill in his hand. From his daughter it is a note about what
 * her father is taking. Guessing between those would put a clinical answer in
 * front of the wrong person, so an **unbound** sender gets the role card rather
 * than an answer.
 */

import type { Delivery } from "./types";
import { bindRole, parseRoleFromPostback } from "../roles/bind";
import type { Role, RoleStore } from "../roles/types";
import {
  canClaimDemoRole,
  getDemoLinePair,
  recipientForDemoRole,
} from "./line/demo-pair";

export type InboundMessage = {
  channelUserId: string;
  receivedAt: string; // ISO 8601
  providerMessageId: string; // for idempotency
  body:
    | { kind: "text"; text: string }
    | { kind: "audio"; audio: Uint8Array; format: string; durationMs?: number }
    | { kind: "follow" }
    | { kind: "postback"; data: string };
};

/**
 * DEMO mapping: which subject a LINE user may ask about, for users bound
 * before the role store existed. The store is the source of truth; this is the
 * fallback so the original single-elder demo pair keeps working.
 *
 * Real product: this lookup belongs in a store Ray owns, not in env vars.
 */
function seededSubjectIdFor(channelUserId: string): string | null {
  const map = process.env.LINE_USER_SUBJECT_MAP;
  if (map) {
    for (const pair of map.split(",")) {
      const [userId, subjectId] = pair.split(":").map((s) => s.trim());
      if (userId && subjectId && userId === channelUserId) return subjectId;
    }
  }
  if (
    process.env.LINE_ELDER_USER_ID &&
    channelUserId === process.env.LINE_ELDER_USER_ID
  ) {
    return process.env.LINE_ELDER_SUBJECT_ID ?? "subj-father";
  }
  return null;
}

/** Who to ping when the older adult presses 找家人. Demo-level, same as above. */
function caregiverUserIdFor(subjectId: string): string | null {
  const demoCaregiver = recipientForDemoRole("caregiver");
  if (demoCaregiver && subjectId === getDemoLinePair().subjectId) {
    return demoCaregiver;
  }

  const map = process.env.LINE_SUBJECT_CAREGIVER_MAP;
  if (!map) return null;
  for (const pair of map.split(",")) {
    const [subj, userId] = pair.split(":").map((s) => s.trim());
    if (subj === subjectId && userId) return userId;
  }
  return null;
}

export type InboundDeps = {
  /** injectable so tests run offline; defaults to the LINE adapter */
  delivery?: Delivery;
  /** injectable; defaults to the registry's store */
  roleStore?: RoleStore;
  /** injectable; defaults to the real LINE setup client */
  setup?: {
    pushFlex(userId: string, message: unknown): Promise<{ ok: boolean }>;
    linkRichMenu(userId: string, richMenuId: string): Promise<{ ok: boolean }>;
  };
};

const ROLE_ACTIONS: Record<Role, ReadonlySet<string>> = {
  elder: new Set(["my_meds", "repeat", "how_to_ask", "reach_family"]),
  caregiver: new Set(["note", "summary", "recent_questions", "subjects"]),
};

/**
 * Resolved separately, and lazily, on purpose.
 *
 * Constructing the setup client reads LINE credentials from env, so building
 * it on a path that only needs the role store makes an offline test fail — and
 * fail *quietly*, because the throw lands in the outer catch and looks like a
 * message that simply produced no reply. That is exactly how this went wrong
 * once already.
 */
async function getRoleStore(deps: InboundDeps): Promise<RoleStore> {
  return deps.roleStore ?? (await import("../registry")).getRegistry().roleStore;
}

async function getSetup(deps: InboundDeps) {
  if (deps.setup) return deps.setup;
  const { LineSetupClient } = await import("./line/setup-client");
  const { getLineConfig } = await import("./line/config");
  return new LineSetupClient({
    channelAccessToken: getLineConfig().channelAccessToken,
  });
}

/** Rich menu ids come from registration (scripts/register-rich-menus.mts). */
function richMenuIdFor(role: Role): string | null {
  const id =
    role === "elder"
      ? process.env.LINE_RICH_MENU_ELDER_ID
      : process.env.LINE_RICH_MENU_CAREGIVER_ID;
  return id?.trim() || null;
}

export async function handleInbound(
  msg: InboundMessage,
  deps: InboundDeps = {},
): Promise<void> {
  // Logging rule: ids and kinds only — never message text or audio.
  console.log("[medbuddy] inbound", {
    channelUserId: msg.channelUserId,
    kind: msg.body.kind,
    providerMessageId: msg.providerMessageId,
  });

  try {
    switch (msg.body.kind) {
      case "audio":
        // Received and recorded; answering requires transcription, which is
        // upstream's decision. Never a substitute reply (§6.6/§6.3).
        console.log("[medbuddy] audio inbound recorded, no STT wired — not answered", {
          providerMessageId: msg.providerMessageId,
        });
        return;

      case "follow":
        return await sendRoleCard(msg.channelUserId, deps);

      case "postback":
        return await handlePostback(
          msg.channelUserId,
          msg.receivedAt,
          msg.body.data,
          deps,
        );

      case "text":
        return await handleText(msg, msg.body.text, deps);
    }
  } catch (err) {
    // §6.6 — loud in the logs, silent to the user: no substitute messages.
    console.error("[medbuddy] inbound handling failed", {
      providerMessageId: msg.providerMessageId,
      kind: msg.body.kind,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}

async function sendRoleCard(channelUserId: string, deps: InboundDeps): Promise<void> {
  const setup = await getSetup(deps);
  const { roleSelectionCard } = await import("./line/role-card");
  const result = await setup.pushFlex(channelUserId, roleSelectionCard());
  console.log("[medbuddy] role card sent", { channelUserId, ok: result.ok });
}

async function handlePostback(
  channelUserId: string,
  receivedAt: string,
  data: string,
  deps: InboundDeps,
): Promise<void> {
  const roleStore = await getRoleStore(deps);

  // ── binding
  const claimedRole = parseRoleFromPostback(data);
  if (claimedRole) {
    if (!canClaimDemoRole(channelUserId, claimedRole)) {
      console.error("[medbuddy] refused role claim from non-demo phone", {
        channelUserId,
        claimedRole,
      });
      return;
    }

    const subjectId = getDemoLinePair().subjectId;

    const outcome = await bindRole(
      roleStore,
      channelUserId,
      claimedRole,
      subjectId,
      receivedAt,
    );
    if (!outcome.ok) {
      // Refused. Silence rather than an explanation: the only way to produce
      // this is a crafted postback, and there is nobody legitimate to explain
      // it to.
      return;
    }

    const richMenuId = richMenuIdFor(outcome.binding.role);
    if (richMenuId) {
      const linked = await (await getSetup(deps)).linkRichMenu(channelUserId, richMenuId);
      console.log("[medbuddy] rich menu linked", {
        channelUserId: channelUserId,
        role: outcome.binding.role,
        ok: linked.ok,
      });
    } else {
      console.error("[medbuddy] no rich menu id configured for role", {
        role: outcome.binding.role,
      });
    }
    return;
  }

  // ── menu presses
  const action = new URLSearchParams(data).get("action");
  if (!action) return;

  if (action === "rebind") return await sendRoleCard(channelUserId, deps);

  const binding = await roleStore.get(channelUserId);
  const subjectId = binding?.subjectId ?? seededSubjectIdFor(channelUserId);
  const role: Role = binding?.role ?? "elder";
  // An unbound sender gets the card, never an answer (§6.5).
  if (!binding || !subjectId) return await sendRoleCard(channelUserId, deps);

  // A rich menu hides the other role's buttons; it is not an authorisation
  // boundary. Postback data is client input, so re-check the action against the
  // stored role before invoking anything that could expose caregiver context.
  if (!ROLE_ACTIONS[role].has(action)) {
    console.error("[medbuddy] refused action outside bound role", {
      channelUserId,
      role,
      action,
    });
    return;
  }

  const actions = await import("./menu-actions");
  let reply: { text: string; fromPipeline: boolean } | null = null;

  switch (action) {
    case "my_meds":
    case "repeat":
      reply = await actions.lastCheckNarration(subjectId, role);
      break;
    case "how_to_ask":
      reply = actions.furniture("how_to_ask");
      break;
    case "note":
      reply = actions.furniture("note_prompt");
      break;
    case "subjects":
      reply = await actions.subjectRoster();
      break;
    case "recent_questions":
      reply = await actions.recentQuestions(subjectId);
      break;
    case "reach_family":
      return await reachFamily(channelUserId, subjectId, deps);
    case "summary":
      return await sendSummaryQr(subjectId, deps);
    default:
      // A press we do not recognise. Silence (§3) — it can only be a stale
      // menu or a crafted payload.
      console.error("[medbuddy] unknown postback action", { action });
      return;
  }

  if (!reply?.text.trim()) return;
  await push(channelUserId, role, subjectId, reply.text, deps);
}

async function handleText(
  msg: InboundMessage,
  text: string,
  deps: InboundDeps,
): Promise<void> {
  const roleStore = await getRoleStore(deps);
  const binding = await roleStore.get(msg.channelUserId);
  const subjectId = binding?.subjectId ?? seededSubjectIdFor(msg.channelUserId);

  if (!subjectId) {
    // Unknown sender: never a guessed subject (§6.5), never a composed
    // "who are you?" (§6.4). The card is the one thing it is safe to send.
    return await sendRoleCard(msg.channelUserId, deps);
  }

  // A caregiver typing prose is reporting an observation, not asking about a
  // pill in their hand. Same words, different act — see the header table.
  if (binding?.role === "caregiver") {
    const [{ parseObservations }, { observationExtractor }, { getRegistry }] =
      await Promise.all([
        import("../observations/parse"),
        import("../observations/gemini"),
        import("../registry"),
      ]);
    const parsed = await parseObservations(text.trim(), observationExtractor());
    const { logStore } = getRegistry();
    let i = 0;
    for (const o of parsed.observations) {
      await logStore.appendObservation({
        id: `${subjectId}:${msg.receivedAt}:${i++}`,
        subjectId,
        observedAt: msg.receivedAt,
        kind: o.kind,
        note: o.note,
        reportedByCarerId: `line:${msg.channelUserId}`,
      });
    }
    console.log("[medbuddy] observations recorded from LINE", {
      subjectId,
      count: parsed.observations.length,
      usedFallback: parsed.usedFallback,
    });
    return;
  }

  // The elder's message is treated as one cupboard item (he texts a medicine
  // name). Sentence understanding is upstream work, not done here.
  const [{ findSubject }, { getRegistry }, { buildVerdict }, { narrate }] =
    await Promise.all([
      import("../subjects"),
      import("../registry"),
      import("../verdict/build"),
      import("../narration/narrate"),
    ]);

  const subject = findSubject(subjectId);
  if (!subject) {
    console.error("[medbuddy] mapped subject not found", { subjectId });
    return;
  }

  const { resolver, ruleSets, classes, knownMedicines, logStore } = getRegistry();
  const verdict = buildVerdict(
    {
      id: subject.id,
      displayName: subject.displayName,
      ageYears: subject.ageYears,
      conditions: subject.conditions,
    },
    resolver.resolveAll([{ text: text.trim(), source: "unknown" }]),
    ruleSets,
    classes,
  );
  const outcome = await narrate(verdict, "elder", null, knownMedicines);
  const narrated = outcome.narration.segments.map((s) => s.text).join("\n");

  // What he asked, kept so his caregiver can see 他問了什麼 — his question,
  // never a report on what he did.
  await logStore
    .appendObservation({
      id: `${subjectId}:${msg.receivedAt}:asked`,
      subjectId,
      observedAt: msg.receivedAt,
      kind: "other",
      note: text.trim(),
      reportedByCarerId: "elder-asked",
    })
    .catch((err) => {
      // Recording his question must never block the answer to it.
      console.error("[medbuddy] could not record question", {
        error: err instanceof Error ? err.message : "unknown",
      });
    });

  // VOICE-DELIVERY-SPEC §5: empty narration → send NOTHING (no default).
  if (!narrated.trim()) {
    console.error("[medbuddy] empty narration — nothing sent", {
      providerMessageId: msg.providerMessageId,
    });
    return;
  }
  await push(msg.channelUserId, "elder", subject.id, narrated, deps);
}

/** Tells the family he wants them. Carries no content about him. */
async function reachFamily(
  channelUserId: string,
  subjectId: string,
  deps: InboundDeps,
): Promise<void> {
  const actions = await import("./menu-actions");
  const caregiverUserId = caregiverUserIdFor(subjectId);
  if (!caregiverUserId) {
    const reply = actions.furniture("no_family");
    return await push(channelUserId, "elder", subjectId, reply.text, deps);
  }

  const { findSubject } = await import("../subjects");
  const name = findSubject(subjectId)?.displayName ?? "家人";
  await push(
    caregiverUserId,
    "caregiver",
    subjectId,
    `${name}按了「找家人」,想找您。`,
    deps,
  );
  const ack = actions.furniture("reached_family");
  await push(channelUserId, "elder", subjectId, ack.text, deps);
}

/** Builds the clinician summary QR and sends it to the elder as an image. */
async function sendSummaryQr(subjectId: string, deps: InboundDeps): Promise<void> {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (!base) {
    console.error("[medbuddy] NEXT_PUBLIC_BASE_URL unset — cannot mint share QR");
    return;
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/api/summary/share/to-line`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subjectId }),
  });
  console.log("[medbuddy] summary QR requested", { subjectId, status: res.status });
  void deps;
}

async function push(
  channelUserId: string,
  role: Role,
  subjectId: string,
  text: string,
  deps: InboundDeps,
): Promise<void> {
  const { findSubject } = await import("../subjects");
  const subject = findSubject(subjectId);
  const delivery =
    deps.delivery ??
    new (await import("./line/LineDelivery")).LineDelivery({
      channelAccessToken: (await import("./line/config")).getLineConfig()
        .channelAccessToken,
    });

  // Voice when an exact pre-rendered match exists; text-only otherwise.
  const { findPrerenderedSpeech } = await import("./prerendered-speech");
  const speech = await findPrerenderedSpeech(text);

  const result = await delivery.send(
    {
      channelUserId,
      role,
      subject: {
        id: subjectId,
        displayName: subject?.displayName ?? subjectId,
      },
    },
    speech ? { text, speech } : { text },
  );
  if (!result.ok) {
    console.error("[medbuddy] push failed", { channelUserId, reason: result.reason });
  }
}
