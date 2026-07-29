import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendSnapshot: vi.fn(async () => undefined),
  narrate: vi.fn(async (_verdict: unknown, audience: "caregiver" | "elder") => ({
    narration: { audience, segments: [{ kind: "plain", text: `${audience}-copy` }] },
    usedFallback: false,
  })),
}));

vi.mock("@/lib/registry", () => ({
  getRegistry: () => ({
    resolver: { resolveAll: (items: unknown) => items },
    ruleSets: [],
    classes: {},
    knownMedicines: {},
    logStore: { appendSnapshot: mocks.appendSnapshot },
  }),
}));
vi.mock("@/lib/verdict/build", () => ({
  buildVerdict: () => ({
    subject: { id: "subj-father", displayName: "爸爸" },
    items: [],
    findings: [],
  }),
}));
vi.mock("@/lib/narration/narrate", () => ({ narrate: mocks.narrate }));

import { POST } from "./route";

describe("POST /api/check", () => {
  beforeEach(() => {
    mocks.appendSnapshot.mockClear();
    mocks.narrate.mockClear();
  });

  it("persists one clinical snapshot and returns both audience projections", async () => {
    const response = await POST(
      new Request("http://localhost/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: "subj-father",
          items: [{ text: "普拿疼膜衣錠500毫克", source: "otc" }],
          audience: "elder",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.appendSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.narrate).toHaveBeenCalledTimes(2);
    expect(mocks.narrate).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "caregiver",
      null,
      expect.anything(),
    );
    expect(mocks.narrate).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "elder",
      null,
      expect.anything(),
    );

    await expect(response.json()).resolves.toMatchObject({
      narrations: {
        caregiver: { audience: "caregiver" },
        elder: { audience: "elder" },
      },
    });
  });
});
