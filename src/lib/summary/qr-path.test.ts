import { describe, expect, it } from "vitest";
import { summaryQrPath } from "./qr-path";

describe("summary QR blob path", () => {
  it("is different for two tokens that share the same long prefix", () => {
    const prefix = "eyJzdWJqZWN0SWQiOiJzdWJqLWZhdGhlciIsImV4cCI6";
    const first = `${prefix}MTc1MDAwMDAwMH0.signature-one`;
    const second = `${prefix}MTc1MDAwMzYwMH0.signature-two`;

    expect(summaryQrPath(first)).not.toBe(summaryQrPath(second));
  });

  it("does not expose the signed token in the public blob pathname", () => {
    const token = "header.payload.sensitive-signature";
    const path = summaryQrPath(token);

    expect(path).toMatch(/^summary-qr\/[a-f0-9]{40}\.png$/);
    expect(path).not.toContain(token);
  });
});
