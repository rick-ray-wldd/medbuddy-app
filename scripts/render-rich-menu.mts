/**
 * Draw the rich menu images.
 *
 * LINE will not accept a menu definition without a bitmap: the areas are
 * invisible hit targets, and everything the user actually sees is this PNG. So
 * the labels exist twice — once as `action.label` in the definition, and once
 * as pixels here — and they have to agree. `rich-menu.ts` is the single list
 * both read from, which is the only reason they can.
 *
 * ## The type sizes are the point
 *
 * 96px on a 2500px-wide image lands at roughly 24pt on a phone. Q8 from the
 * source interview was 有老花,字要很大, and the usual failure is a designer
 * checking it at 100% zoom on a laptop. These are set from the cell height
 * rather than by eye.
 *
 * ## Why not emoji for the icons
 *
 * Colour-emoji fonts rasterise inconsistently through librsvg — sometimes as
 * tofu, sometimes monochrome, depending on the machine that runs this. A menu
 * whose icons are missing on the build box is worse than one with no icons, so
 * these are drawn as paths and cannot go missing.
 *
 * Usage: node scripts/render-rich-menu.mts
 * Writes: public/rich-menu-elder.png, public/rich-menu-caregiver.png
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  CAREGIVER_CELLS,
  ELDER_CELLS,
  type Cell,
  type IconName,
} from "../src/lib/delivery/line/rich-menu.ts";

const WIDTH = 2500;
const HEIGHT = 1686;

/** Muted, high-contrast. Nothing here should read as a game or a badge. */
const PALETTE = {
  ink: "#111111",
  sub: "#5A6472",
  line: "#D8DEE6",
  tints: ["#EAF2FB", "#F1EEF9", "#EAF6EF", "#FDF3E7", "#F3F1EC", "#EFF3F6"],
  accent: "#2F6FB5",
};

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}

/**
 * One glyph per cell, drawn rather than typed, and selected by NAME.
 *
 * Keyed by meaning rather than grid position: the first version indexed by
 * position and produced a pill beside 記一件事 and a magnifier beside
 * 產生回診單. An icon that contradicts its label costs more than no icon,
 * because the reason for having one is that it is read faster than the words.
 */
function icon(name: IconName, cx: number, cy: number, r: number): string {
  const s = PALETTE.accent;
  const shapes: Record<IconName, string> = {
    pill: `<rect x="${cx - r}" y="${cy - r * 0.45}" width="${r * 2}" height="${r * 0.9}" rx="${r * 0.45}" fill="none" stroke="${s}" stroke-width="${r * 0.22}"/>
     <line x1="${cx}" y1="${cy - r * 0.45}" x2="${cx}" y2="${cy + r * 0.45}" stroke="${s}" stroke-width="${r * 0.22}"/>`,

    magnifier: `<circle cx="${cx - r * 0.2}" cy="${cy - r * 0.2}" r="${r * 0.62}" fill="none" stroke="${s}" stroke-width="${r * 0.22}"/>
     <line x1="${cx + r * 0.28}" y1="${cy + r * 0.28}" x2="${cx + r * 0.85}" y2="${cy + r * 0.85}" stroke="${s}" stroke-width="${r * 0.26}" stroke-linecap="round"/>`,

    speaker: `<path d="M ${cx - r * 0.75} ${cy - r * 0.3} h ${r * 0.4} l ${r * 0.5} -${r * 0.5} v ${r * 1.6} l -${r * 0.5} -${r * 0.5} h -${r * 0.4} z" fill="${s}"/>
     <path d="M ${cx + r * 0.35} ${cy - r * 0.4} a ${r * 0.5} ${r * 0.5} 0 0 1 0 ${r * 0.8}" fill="none" stroke="${s}" stroke-width="${r * 0.18}" stroke-linecap="round"/>`,

    people: `<circle cx="${cx - r * 0.42}" cy="${cy - r * 0.35}" r="${r * 0.3}" fill="${s}"/>
     <circle cx="${cx + r * 0.42}" cy="${cy - r * 0.35}" r="${r * 0.3}" fill="${s}"/>
     <path d="M ${cx - r * 0.95} ${cy + r * 0.7} a ${r * 0.55} ${r * 0.5} 0 0 1 ${r * 1.06} 0 z" fill="${s}"/>
     <path d="M ${cx - r * 0.11} ${cy + r * 0.7} a ${r * 0.55} ${r * 0.5} 0 0 1 ${r * 1.06} 0 z" fill="${s}"/>`,

    pencil: `<path d="M ${cx - r * 0.7} ${cy + r * 0.7} l ${r * 0.28} -${r * 0.75} l ${r * 1.05} -${r * 1.05} l ${r * 0.47} ${r * 0.47} l -${r * 1.05} ${r * 1.05} z" fill="none" stroke="${s}" stroke-width="${r * 0.2}" stroke-linejoin="round"/>
     <line x1="${cx + r * 0.1}" y1="${cy - r * 0.62}" x2="${cx + r * 0.57}" y2="${cy - r * 0.15}" stroke="${s}" stroke-width="${r * 0.2}"/>`,

    document: `<rect x="${cx - r * 0.62}" y="${cy - r * 0.85}" width="${r * 1.24}" height="${r * 1.7}" rx="${r * 0.12}" fill="none" stroke="${s}" stroke-width="${r * 0.2}"/>
     <line x1="${cx - r * 0.3}" y1="${cy - r * 0.32}" x2="${cx + r * 0.3}" y2="${cy - r * 0.32}" stroke="${s}" stroke-width="${r * 0.17}" stroke-linecap="round"/>
     <line x1="${cx - r * 0.3}" y1="${cy + r * 0.04}" x2="${cx + r * 0.3}" y2="${cy + r * 0.04}" stroke="${s}" stroke-width="${r * 0.17}" stroke-linecap="round"/>
     <line x1="${cx - r * 0.3}" y1="${cy + r * 0.4}" x2="${cx + r * 0.06}" y2="${cy + r * 0.4}" stroke="${s}" stroke-width="${r * 0.17}" stroke-linecap="round"/>`,

    question: `<path d="M ${cx - r * 0.9} ${cy - r * 0.75} h ${r * 1.8} v ${r * 1.2} h -${r * 1.05} l -${r * 0.45} ${r * 0.5} v -${r * 0.5} h -${r * 0.3} z" fill="none" stroke="${s}" stroke-width="${r * 0.2}" stroke-linejoin="round"/>
     <path d="M ${cx - r * 0.2} ${cy - r * 0.36} a ${r * 0.22} ${r * 0.22} 0 1 1 ${r * 0.22} ${r * 0.34} v ${r * 0.12}" fill="none" stroke="${s}" stroke-width="${r * 0.17}" stroke-linecap="round"/>
     <circle cx="${cx + r * 0.02}" cy="${cy + r * 0.28}" r="${r * 0.09}" fill="${s}"/>`,

    window: `<rect x="${cx - r * 0.85}" y="${cy - r * 0.7}" width="${r * 1.7}" height="${r * 1.4}" rx="${r * 0.14}" fill="none" stroke="${s}" stroke-width="${r * 0.2}"/>
     <line x1="${cx - r * 0.85}" y1="${cy - r * 0.28}" x2="${cx + r * 0.85}" y2="${cy - r * 0.28}" stroke="${s}" stroke-width="${r * 0.2}"/>`,

    swap: `<path d="M ${cx - r * 0.7} ${cy - r * 0.25} h ${r * 1.4} l -${r * 0.4} -${r * 0.4}" fill="none" stroke="${s}" stroke-width="${r * 0.2}" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M ${cx + r * 0.7} ${cy + r * 0.25} h -${r * 1.4} l ${r * 0.4} ${r * 0.4}" fill="none" stroke="${s}" stroke-width="${r * 0.2}" stroke-linecap="round" stroke-linejoin="round"/>`,
  };
  return shapes[name];
}

function renderSvg(cells: Cell[], cols: number, rows: number): string {
  const cw = Math.floor(WIDTH / cols);
  const ch = Math.floor(HEIGHT / rows);
  // Sized from the cell, not chosen by eye: a four-cell menu gets bigger type
  // than a six-cell one because it has the room, and the elder gets the four.
  const labelSize = Math.round(ch * (cols === 2 ? 0.17 : 0.13));
  const subSize = Math.round(labelSize * 0.46);
  const iconR = Math.round(ch * (cols === 2 ? 0.11 : 0.085));

  const parts = cells.map((cell, i) => {
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    const cx = x + cw / 2;
    const iconCy = y + ch * 0.34;
    const labelY = y + ch * 0.63;
    const subY = labelY + subSize * 1.7;

    return `
  <rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${PALETTE.tints[i % PALETTE.tints.length]}"/>
  <rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="none" stroke="${PALETTE.line}" stroke-width="3"/>
  ${icon(cell.icon, cx, iconCy, iconR)}
  <text x="${cx}" y="${labelY}" font-family="PingFang TC, Heiti TC, Noto Sans CJK TC, sans-serif"
        font-size="${labelSize}" font-weight="bold" text-anchor="middle" fill="${PALETTE.ink}">${escapeXml(cell.label)}</text>
  <text x="${cx}" y="${subY}" font-family="PingFang TC, Heiti TC, Noto Sans CJK TC, sans-serif"
        font-size="${subSize}" text-anchor="middle" fill="${PALETTE.sub}">${escapeXml(cell.sub)}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#FFFFFF"/>${parts.join("")}
</svg>`;
}

/**
 * Rasterise, then check that the glyphs actually landed.
 *
 * A missing CJK font produces a valid PNG full of nothing, and it would upload
 * cleanly and reach a phone as six blank boxes. Counting dark pixels is crude
 * and catches exactly that.
 */
async function render(cells: Cell[], cols: number, rows: number, out: string) {
  const svg = renderSvg(cells, cols, rows);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  const { data } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (const v of data) if (v < 100) dark++;
  const expected = cells.length * 400;
  if (dark < expected) {
    throw new Error(
      `${out}: only ${dark} dark pixels — the CJK font did not render. ` +
        `Install a Chinese font or run this on a machine that has one.`,
    );
  }

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, png);
  console.log(`  ✅ ${out}  (${(png.length / 1024).toFixed(0)} KB, ${dark} 深色像素)`);
}

const root = process.cwd();
await render(ELDER_CELLS, 2, 2, path.join(root, "public", "rich-menu-elder.png"));
await render(CAREGIVER_CELLS, 3, 2, path.join(root, "public", "rich-menu-caregiver.png"));
