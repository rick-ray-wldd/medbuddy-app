import { DEMO_SUBJECT_ID } from "../../subjects";
import type { Role } from "../../roles/types";

type DemoEnv = Record<string, string | undefined>;

export type DemoLinePair = {
  subjectId: string;
  elderUserId: string | null;
  caregiverUserId: string | null;
};

function value(env: DemoEnv, name: string): string | null {
  return env[name]?.trim() || null;
}

/**
 * The deployment contract for the challenge demo: two LINE accounts, one
 * clinical subject. `LINE_ELDER_USER_ID` remains a read-only compatibility
 * fallback so the existing deployment does not lose its elder recipient while
 * the clearer demo-specific variable names are being configured.
 */
export function getDemoLinePair(env: DemoEnv = process.env): DemoLinePair {
  const explicitElder = value(env, "LINE_DEMO_ELDER_USER_ID");
  const explicitCaregiver = value(env, "LINE_DEMO_CAREGIVER_USER_ID");
  if ((explicitElder === null) !== (explicitCaregiver === null)) {
    throw new Error("configure both demo LINE accounts or neither");
  }

  const elderUserId = explicitElder ?? value(env, "LINE_ELDER_USER_ID");
  const caregiverUserId = explicitCaregiver;

  if (elderUserId && caregiverUserId && elderUserId === caregiverUserId) {
    throw new Error("the elder and caregiver must use different LINE accounts");
  }

  return {
    subjectId: DEMO_SUBJECT_ID,
    elderUserId,
    caregiverUserId,
  };
}

export function hasExplicitDemoPair(env: DemoEnv = process.env): boolean {
  const pair = getDemoLinePair(env);
  return pair.elderUserId !== null && pair.caregiverUserId !== null;
}

export function recipientForDemoRole(
  role: Role,
  env: DemoEnv = process.env,
): string | null {
  const pair = getDemoLinePair(env);
  return role === "elder" ? pair.elderUserId : pair.caregiverUserId;
}

/**
 * Once a recipient is configured for a role, only that phone may claim it.
 * With neither id configured we keep local/offline setup usable; production
 * acceptance requires both ids and is documented in the demo contract.
 */
export function canClaimDemoRole(
  channelUserId: string,
  role: Role,
  env: DemoEnv = process.env,
): boolean {
  const configuredRecipient = recipientForDemoRole(role, env);
  return configuredRecipient === null || configuredRecipient === channelUserId;
}
