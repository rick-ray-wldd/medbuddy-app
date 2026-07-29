import { describe, expect, it } from "vitest";
import type { LogStore, SubjectLog } from "../log/types";
import type { RoleBinding, RoleStore } from "../roles/types";
import { loadHubStatus } from "./status";

const pair = {
  subjectId: "subj-father",
  elderUserId: "U-elder",
  caregiverUserId: "U-caregiver",
};

function roles(bindings: Record<string, RoleBinding>): RoleStore {
  return {
    get: async (userId) => bindings[userId] ?? null,
    put: async () => undefined,
  };
}

function logs(value: SubjectLog): LogStore {
  return {
    read: async () => value,
    appendSnapshot: async () => undefined,
    appendObservation: async () => undefined,
    appendObservations: async () => undefined,
  };
}

describe("loadHubStatus", () => {
  it("reports two linked phones without exposing either LINE user id", async () => {
    const status = await loadHubStatus(
      pair,
      roles({
        "U-elder": {
          channelUserId: "U-elder",
          role: "elder",
          subjectId: "subj-father",
          boundAt: "2026-07-29T01:00:00.000Z",
        },
        "U-caregiver": {
          channelUserId: "U-caregiver",
          role: "caregiver",
          subjectId: "subj-father",
          boundAt: "2026-07-29T01:01:00.000Z",
        },
      }),
      logs({
        subjectId: "subj-father",
        snapshots: [
          { capturedAt: "2026-07-29T02:00:00.000Z" } as SubjectLog["snapshots"][number],
        ],
        observations: [
          { observedAt: "2026-07-29T03:00:00.000Z" } as SubjectLog["observations"][number],
        ],
      }),
    );

    expect(status).toEqual({
      elder: "linked",
      caregiver: "linked",
      sharedRecord: "ready",
      snapshotCount: 1,
      observationCount: 1,
      lastActivityAt: "2026-07-29T03:00:00.000Z",
    });
    expect(JSON.stringify(status)).not.toContain("U-elder");
    expect(JSON.stringify(status)).not.toContain("U-caregiver");
  });

  it("distinguishes deployment configuration from completed role binding", async () => {
    const status = await loadHubStatus(
      { ...pair, elderUserId: null, caregiverUserId: null },
      roles({}),
      logs({ subjectId: "subj-father", snapshots: [], observations: [] }),
    );

    expect(status.elder).toBe("not_configured");
    expect(status.caregiver).toBe("not_configured");
  });

  it("degrades visibly when a backing store cannot be read", async () => {
    const failingRoles: RoleStore = {
      get: async () => {
        throw new Error("offline");
      },
      put: async () => undefined,
    };
    const failingLogs: LogStore = {
      read: async () => {
        throw new Error("offline");
      },
      appendSnapshot: async () => undefined,
      appendObservation: async () => undefined,
    appendObservations: async () => undefined,
    };

    const status = await loadHubStatus(pair, failingRoles, failingLogs);

    expect(status).toMatchObject({
      elder: "unavailable",
      caregiver: "unavailable",
      sharedRecord: "unavailable",
      snapshotCount: 0,
      observationCount: 0,
      lastActivityAt: null,
    });
  });
});
