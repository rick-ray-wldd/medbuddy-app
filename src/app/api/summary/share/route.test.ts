import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/summary/share", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the share URL on the deployment receiving the request", async () => {
    vi.stubEnv("SUMMARY_SHARE_SECRET", "test-summary-secret");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://stale-personal-project.vercel.app");

    const response = await POST(
      new Request("https://current-medbuddy.vercel.app/api/summary/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId: "subj-father" }),
      }),
    );
    const body = (await response.json()) as { url: string };

    expect(response.status).toBe(200);
    expect(body.url).toMatch(
      /^https:\/\/current-medbuddy\.vercel\.app\/summary\/s\//,
    );
    expect(body.url).not.toContain("stale-personal-project");
  });
});
