import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import {
  LINE_BOT_BASIC_ID,
  lineAddFriendUrl,
} from "@/lib/delivery/line/bot-identity";
import { qrGeometry } from "@/lib/qr/module-path";

describe("line add-friend URL", () => {
  it("points at the checked-in Basic ID with the @ percent-encoded", () => {
    expect(lineAddFriendUrl()).toBe("https://line.me/R/ti/p/%40134cwbvt");
  });

  it("refuses an ID that would scan cleanly and land nowhere", () => {
    for (const bad of ["134cwbvt", "@", "@no", "@Has-Caps", "@with space"]) {
      expect(() => lineAddFriendUrl(bad)).toThrow(/not a LINE Basic ID/);
    }
  });

  it("keeps the checked-in ID in the shape LINE issues", () => {
    expect(LINE_BOT_BASIC_ID).toMatch(/^@[a-z0-9]{3,20}$/);
  });
});

describe("the QR actually decodes back to the invitation", () => {
  /**
   * The point of this test: every other assertion here could pass while the
   * rendered symbol is unscannable. This one paints the geometry the component
   * renders into a bitmap and reads it back with a decoder that knows nothing
   * about how it was produced.
   */
  it("round-trips through a real decoder", () => {
    const url = lineAddFriendUrl();
    const { size, path } = qrGeometry(url);

    const dark = new Set(
      [...path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(
        (m) => `${m[1]},${m[2]}`,
      ),
    );

    // A quiet zone is required by the spec; without it decoders reject the
    // symbol, so the bitmap must include what the component's viewBox padding
    // provides on the page.
    const quiet = 4;
    const side = size + quiet * 2;
    const scale = 4;
    const px = side * scale;
    const rgba = new Uint8ClampedArray(px * px * 4).fill(255);

    for (let y = 0; y < px; y += 1) {
      for (let x = 0; x < px; x += 1) {
        const mx = Math.floor(x / scale) - quiet;
        const my = Math.floor(y / scale) - quiet;
        if (!dark.has(`${mx},${my}`)) continue;
        const i = (y * px + x) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
      }
    }

    expect(jsQR(rgba, px, px)?.data).toBe(url);
  });
});
