import type { DemoLinePair } from "../delivery/line/demo-pair";
import type { LogStore } from "../log/types";
import type { Role, RoleStore } from "../roles/types";

export type ChannelLinkState =
  | "not_configured"
  | "awaiting_role"
  | "linked"
  | "mismatch"
  | "unavailable";

export type HubStatus = {
  elder: ChannelLinkState;
  caregiver: ChannelLinkState;
  sharedRecord: "ready" | "unavailable";
  snapshotCount: number;
  observationCount: number;
  lastActivityAt: string | null;
};

async function readLink(
  channelUserId: string | null,
  expectedRole: Role,
  subjectId: string,
  roleStore: RoleStore,
): Promise<ChannelLinkState> {
  if (!channelUserId) return "not_configured";

  try {
    const binding = await roleStore.get(channelUserId);
    if (!binding) return "awaiting_role";
    return binding.role === expectedRole && binding.subjectId === subjectId
      ? "linked"
      : "mismatch";
  } catch {
    return "unavailable";
  }
}

/**
 * Read-only projection of the two LINE endpoints and their shared log.
 * The dashboard receives states and counts, never the opaque LINE user ids.
 */
export async function loadHubStatus(
  pair: DemoLinePair,
  roleStore: RoleStore,
  logStore: LogStore,
): Promise<HubStatus> {
  const [elder, caregiver, logResult] = await Promise.all([
    readLink(pair.elderUserId, "elder", pair.subjectId, roleStore),
    readLink(pair.caregiverUserId, "caregiver", pair.subjectId, roleStore),
    logStore.read(pair.subjectId).then(
      (log) => ({ ok: true as const, log }),
      () => ({ ok: false as const }),
    ),
  ]);

  if (!logResult.ok) {
    return {
      elder,
      caregiver,
      sharedRecord: "unavailable",
      snapshotCount: 0,
      observationCount: 0,
      lastActivityAt: null,
    };
  }

  const activityTimes = [
    ...logResult.log.snapshots.map((snapshot) => snapshot.capturedAt),
    ...logResult.log.observations.map((observation) => observation.observedAt),
  ].sort();

  return {
    elder,
    caregiver,
    sharedRecord: "ready",
    snapshotCount: logResult.log.snapshots.length,
    observationCount: logResult.log.observations.length,
    lastActivityAt: activityTimes.at(-1) ?? null,
  };
}
