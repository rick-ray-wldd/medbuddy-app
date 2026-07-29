import { describe, expect, it } from "vitest";
import {
  canClaimDemoRole,
  getDemoLinePair,
  hasExplicitDemoPair,
  recipientForDemoRole,
} from "./demo-pair";

describe("the two-phone demo pair", () => {
  it("binds both roles to one fixed subject and resolves their recipients", () => {
    const env = {
      LINE_DEMO_SUBJECT_ID: "subj-mother",
      LINE_DEMO_ELDER_USER_ID: " U-father ",
      LINE_DEMO_CAREGIVER_USER_ID: " U-daughter ",
    };

    expect(getDemoLinePair(env)).toEqual({
      subjectId: "subj-father",
      elderUserId: "U-father",
      caregiverUserId: "U-daughter",
    });
    expect(recipientForDemoRole("elder", env)).toBe("U-father");
    expect(recipientForDemoRole("caregiver", env)).toBe("U-daughter");
    expect(hasExplicitDemoPair(env)).toBe(true);
  });

  it("cannot be redirected to another seeded subject through environment config", () => {
    expect(getDemoLinePair({ LINE_DEMO_SUBJECT_ID: "subj-mother" }).subjectId).toBe(
      "subj-father",
    );
  });

  it("accepts only the configured phone for each role", () => {
    const env = {
      LINE_DEMO_ELDER_USER_ID: "U-father",
      LINE_DEMO_CAREGIVER_USER_ID: "U-daughter",
    };

    expect(canClaimDemoRole("U-father", "elder", env)).toBe(true);
    expect(canClaimDemoRole("U-daughter", "caregiver", env)).toBe(true);
    expect(canClaimDemoRole("U-father", "caregiver", env)).toBe(false);
    expect(canClaimDemoRole("U-third-phone", "elder", env)).toBe(false);
  });

  it("keeps local development usable until the two LINE ids are configured", () => {
    expect(getDemoLinePair({})).toEqual({
      subjectId: "subj-father",
      elderUserId: null,
      caregiverUserId: null,
    });
    expect(canClaimDemoRole("U-local", "elder", {})).toBe(true);
    expect(canClaimDemoRole("U-local", "caregiver", {})).toBe(true);
  });

  it("supports the existing elder env name during migration", () => {
    const env = { LINE_ELDER_USER_ID: "U-existing-elder" };
    expect(recipientForDemoRole("elder", env)).toBe("U-existing-elder");
    expect(hasExplicitDemoPair(env)).toBe(false);
  });

  it("fails closed when only half of the explicit pair is configured", () => {
    expect(() =>
      getDemoLinePair({ LINE_DEMO_ELDER_USER_ID: "U-father" }),
    ).toThrow(/both demo LINE accounts/);
    expect(() =>
      getDemoLinePair({ LINE_DEMO_CAREGIVER_USER_ID: "U-daughter" }),
    ).toThrow(/both demo LINE accounts/);
  });

  it("fails closed when both roles point at the same phone", () => {
    expect(() =>
      getDemoLinePair({
        LINE_DEMO_ELDER_USER_ID: "U-same",
        LINE_DEMO_CAREGIVER_USER_ID: "U-same",
      }),
    ).toThrow(/different LINE accounts/);
  });
});
