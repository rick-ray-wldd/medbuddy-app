/**
 * The binding rule.
 *
 * ## Why this is not a setter
 *
 * Postback data arrives from the client. LINE signs the *webhook envelope*, not
 * the intent inside it — a signed request proves the events came from LINE, not
 * that the user pressed a button we drew. So `action=bind&role=caregiver` is an
 * assertion by whoever sent it, and the rule that decides whether to honour it
 * belongs on the server.
 *
 * ## The rule
 *
 * An elder binding is **terminal**. Once a LINE user is bound as an elder, no
 * postback can move them to `caregiver`, because the caregiver surface shows
 * what the family has reported about him — 「他最近比較常喝酒」, 「上禮拜血壓藥
 * 忘記吃」 — written in his children's words, about him, without his being
 * asked. That surface existing at all depends on his never reaching it. A
 * design that merely omits the button relies on the button being the only way
 * in; this does not.
 *
 * A caregiver binding is changeable. The setup flow (spec §4) has one person
 * holding two phones, and getting the two the wrong way round is the obvious
 * mistake — so the recoverable direction stays recoverable.
 *
 * ## The gap this leaves, stated rather than hidden
 *
 * A caregiver who binds their *own* phone as elder by mistake is stuck: they
 * cannot undo it from LINE. Recovery needs an operator, and there is no
 * operator surface in this build. That is a real hole, and it is the correct
 * side to fail on — the alternative is an escape hatch on the elder's side,
 * which is the one thing this rule exists to prevent.
 */

import type { Role, RoleBinding, RoleStore } from "./types";

export type BindOutcome =
  | { ok: true; binding: RoleBinding; changed: boolean }
  | { ok: false; reason: "elder_binding_is_terminal"; binding: RoleBinding };

export async function bindRole(
  store: RoleStore,
  channelUserId: string,
  role: Role,
  subjectId: string,
  boundAt: string,
): Promise<BindOutcome> {
  const existing = await store.get(channelUserId);

  if (existing?.role === "elder" && role !== "elder") {
    // Refused, and loudly — a legitimate user cannot produce this, so it is
    // either a crafted postback or a bug in our own menu wiring.
    console.error("[medbuddy] refused rebind away from elder", {
      channelUserId,
      attemptedRole: role,
    });
    return { ok: false, reason: "elder_binding_is_terminal", binding: existing };
  }

  if (existing?.role === role && existing.subjectId === subjectId) {
    return { ok: true, binding: existing, changed: false };
  }

  const binding: RoleBinding = { channelUserId, role, subjectId, boundAt };
  await store.put(binding);
  return { ok: true, binding, changed: true };
}

/** Postback payloads are strings from the client; nothing else may be trusted. */
export function parseRoleFromPostback(data: string): Role | null {
  const params = new URLSearchParams(data);
  if (params.get("action") !== "bind") return null;
  const role = params.get("role");
  return role === "elder" || role === "caregiver" ? role : null;
}
