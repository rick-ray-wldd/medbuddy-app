/**
 * Read a real medication bag. Skipped without credentials.
 *
 * Unit tests prove the validator rejects an inferred value; they cannot prove
 * the model reads 8pt pharmacy print off a kitchen-table photograph. Only a
 * real bag shows that — and shows what it fails on, which is the more useful
 * half.
 *
 * Written as a test rather than a script because `src/` uses bundler
 * resolution and does not run under plain Node. A probe that has to import the
 * code it probes belongs in the test runner.
 *
 * The photographs live outside the repository (`../medbuddy-private-images/`).
 * They carry a patient's name and dispensing date; five were committed once by
 * accident and had to be purged with filter-branch. Nothing here writes one.
 *
 *   ANTHROPIC_API_KEY=… MEDBUDDY_BAG_IMAGE=../medbuddy-private-images/x.jpg \
 *     npx vitest run src/lib/ocr/bag.live.test.ts
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ClaudeMedicationBagExtractor } from "./claude";
import type { ExtractedField } from "./types";

const image = process.env.MEDBUDDY_BAG_IMAGE;
const configured = Boolean(process.env.ANTHROPIC_API_KEY?.trim() && image);

function show(label: string, f: ExtractedField): void {
  if (f.value === null) {
    console.log(`      ${label}: —  (${f.status})`);
    return;
  }
  console.log(
    `      ${label}: ${f.value}${f.status === "observed" ? "" : ` [${f.status}]`}`,
  );
}

describe.skipIf(!configured)("a real medication bag", () => {
  it("is transcribed, and says what it could not read", async () => {
    const bytes = new Uint8Array(await readFile(image!));
    const ext = path.extname(image!).toLowerCase();
    const mediaType =
      ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

    const started = Date.now();
    const result = await new ClaudeMedicationBagExtractor().extract({
      requestId: "probe",
      subjectId: "subj-father",
      submittedByCarerId: "probe",
      images: [{ imageId: "probe", bytes, mediaType }],
    });
    const ms = Date.now() - started;

    console.log(`\n  ${path.basename(image!)}  ${(bytes.byteLength / 1024).toFixed(0)} KB  ${ms} ms`);

    if (!result.ok) {
      console.log(`  ❌ ${result.failure}${result.detail ? ` — ${result.detail}` : ""}`);
      expect(result.failure).toBeTruthy();
      return;
    }

    const { extraction } = result;
    console.log(`  ${extraction.rows.length} 列\n`);

    for (const row of extraction.rows) {
      console.log(`    ── 第 ${row.rowIndex + 1} 列 ──`);
      show("藥品", row.printedName);
      show("含量", row.strength);
      show("每次", row.dosePerAdministration);
      show("頻次", row.frequency);
      show("時間", row.timing);
      show("途徑", row.route);
      show("天數", row.durationDays);
    }

    console.log("\n    ── 來源 ──");
    show("院所", extraction.provenance.institution);
    show("科別", extraction.provenance.department);
    show("調劑日", extraction.provenance.dispensedOn);
    console.log(
      `\n    含個資: ${extraction.patientIdentifyingTextDetected ? "是(未讀取內容)" : "否"}`,
    );
    console.log(`    需人工複核: ${extraction.needsHumanReview}`);
    for (const r of extraction.reviewReasons) console.log(`      ・${r}`);

    // Review is unconditional in v1, and no field may carry a value that is
    // not inside its own evidence — the validator already enforced that, this
    // asserts it survived the round trip.
    expect(extraction.needsHumanReview).toBe(true);
    expect(extraction.rows.length).toBeGreaterThan(0);
  }, 120_000);
});
