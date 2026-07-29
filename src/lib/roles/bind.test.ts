import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindRole, parseRoleFromPostback } from "./bind";
import { InMemoryRoleStore } from "./stores";

const AT = "2026-07-28T17:00:00.000Z";

let store: InMemoryRoleStore;
beforeEach(() => {
  store = new InMemoryRoleStore();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("asking once", () => {
  it("binds a new user", async () => {
    const out = await bindRole(store, "Uaaa", "elder", "subj-father", AT);
    expect(out.ok).toBe(true);
    expect(out.ok && out.changed).toBe(true);
    expect(await store.get("Uaaa")).toMatchObject({
      role: "elder",
      subjectId: "subj-father",
    });
  });

  it("re-pressing the same choice is not a change", async () => {
    await bindRole(store, "Uaaa", "caregiver", "subj-father", AT);
    const again = await bindRole(store, "Uaaa", "caregiver", "subj-father", AT);
    expect(again.ok && again.changed).toBe(false);
  });
});

describe("an elder binding is terminal", () => {
  it("refuses a postback moving an elder to caregiver", async () => {
    // The failure this rule exists to prevent: the older adult reaching a
    // surface that shows what his family wrote about him.
    await bindRole(store, "Uelder", "elder", "subj-father", AT);
    const out = await bindRole(store, "Uelder", "caregiver", "subj-father", AT);

    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toBe("elder_binding_is_terminal");
    // And the stored binding is untouched.
    expect(await store.get("Uelder")).toMatchObject({ role: "elder" });
  });

  it("still allows an elder to be re-bound as an elder", async () => {
    // Re-running setup on the same phone must not be a refusal.
    await bindRole(store, "Uelder", "elder", "subj-father", AT);
    const out = await bindRole(store, "Uelder", "elder", "subj-mother", AT);
    expect(out.ok).toBe(true);
    expect(await store.get("Uelder")).toMatchObject({ subjectId: "subj-mother" });
  });

  it("lets a caregiver become an elder, which is the recoverable direction", async () => {
    // Setup has one person holding two phones (spec §4); getting them the wrong
    // way round is the obvious mistake, so this direction stays open.
    await bindRole(store, "Uphone", "caregiver", "subj-father", AT);
    const out = await bindRole(store, "Uphone", "elder", "subj-father", AT);
    expect(out.ok).toBe(true);
    expect(await store.get("Uphone")).toMatchObject({ role: "elder" });
  });
});

describe("postback data is client input", () => {
  it("reads a role we drew", () => {
    expect(parseRoleFromPostback("action=bind&role=elder")).toBe("elder");
    expect(parseRoleFromPostback("action=bind&role=caregiver")).toBe("caregiver");
  });

  it("refuses anything else", () => {
    for (const data of [
      "action=bind&role=clinician", // not a role in this product
      "action=bind&role=admin",
      "action=bind", // no role at all
      "action=repeat&role=elder", // a different action wearing a role
      "role=elder", // no action
      "",
      "action=bind&role=ELDER", // case is not normalised on purpose
    ]) {
      expect(parseRoleFromPostback(data), data).toBeNull();
    }
  });
});

describe("MEDBUDDY_ALLOW_ROLE_SWITCH", () => {
  const ON = { MEDBUDDY_ALLOW_ROLE_SWITCH: "true" };

  it("lets an elder become a caregiver when the flag is on", async () => {
    // What this unblocks: someone who tapped the wrong card on the right
    // phone, and had no way back from inside LINE.
    await bindRole(store, "Uphone", "elder", "subj-father", AT, ON);
    const out = await bindRole(store, "Uphone", "caregiver", "subj-father", AT, ON);

    expect(out.ok).toBe(true);
    expect(await store.get("Uphone")).toMatchObject({ role: "caregiver" });
  });

  it("switches back and forth without getting stuck", async () => {
    for (const role of ["elder", "caregiver", "elder", "caregiver"] as const) {
      const out = await bindRole(store, "Uphone", role, "subj-father", AT, ON);
      expect(out.ok, role).toBe(true);
      expect(await store.get("Uphone")).toMatchObject({ role });
    }
  });

  it("still refuses when the flag is absent", async () => {
    // Default-off is the point: an unset variable gives the safe behaviour,
    // and a real deployment leaves it unset.
    await bindRole(store, "Uphone", "elder", "subj-father", AT, {});
    const out = await bindRole(store, "Uphone", "caregiver", "subj-father", AT, {});
    expect(out.ok).toBe(false);
  });

  it("refuses for any value that is not exactly \"true\"", async () => {
    for (const value of ["1", "yes", "TRUE", "on", ""]) {
      const fresh = new InMemoryRoleStore();
      const env = { MEDBUDDY_ALLOW_ROLE_SWITCH: value };
      await bindRole(fresh, "Uphone", "elder", "subj-father", AT, env);
      const out = await bindRole(fresh, "Uphone", "caregiver", "subj-father", AT, env);
      expect(out.ok, value).toBe(false);
    }
  });
});
