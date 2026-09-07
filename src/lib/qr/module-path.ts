import QRCode from "qrcode";

export type QrGeometry = {
  /** Width of the symbol in modules; also the SVG viewBox extent. */
  size: number;
  /** An SVG path covering every dark module, one `1x1` square each. */
  path: string;
};

/**
 * Turn text into the geometry of its QR symbol.
 *
 * `qrcode` can emit finished SVG markup, but that markup would have to reach
 * the page through `dangerouslySetInnerHTML`. Returning geometry instead lets
 * the component render an ordinary `<svg><path/></svg>`, which React escapes
 * like anything else, and it makes the encoding testable without parsing
 * markup.
 *
 * Error correction stays at `M`. The payloads here are short add-friend URLs,
 * so a lower level buys larger modules rather than a smaller image — and large
 * modules are what makes a code scannable across a room, which is the actual
 * situation: an older adult pointing a phone at someone else's screen.
 */
export function qrGeometry(text: string): QrGeometry {
  const symbol = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { size, data } = symbol.modules;

  const squares: string[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (data[y * size + x]) squares.push(`M${x} ${y}h1v1h-1z`);
    }
  }

  return { size, path: squares.join("") };
}
