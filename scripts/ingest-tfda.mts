/**
 * Build the grounding tables from Taiwan FDA open data.
 *
 *   npm run ingest            # uses cached downloads if present
 *   npm run ingest -- --fresh # re-download
 *
 * Run occasionally, not at build or request time. The derived tables are
 * committed, so a reviewer cloning the repo never needs network access — and
 * so that a change to what the product considers a known medication shows up
 * as a reviewable diff rather than as a silent difference between machines.
 *
 * Sources, both under 政府資料開放授權條款-第1版 (Taiwan Government Open Data
 * Licence, which permits commercial use with attribution):
 *
 *   全部藥品許可證資料集      data.gov.tw dataset 9122
 *   健康食品資料集            data.gov.tw dataset 6951
 *
 * Note the endpoints are named .../json but serve a ZIP for the larger set.
 */
import AdmZip from "adm-zip";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  classifyDispensing,
  isActivePermit,
  normalizeProductName,
  parseIngredients,
} from "../src/lib/grounding/normalize.ts";

const DRUG_URL = "https://data.fda.gov.tw/data/opendata/export/36/json";
const HEALTH_FOOD_URL = "https://data.fda.gov.tw/data/opendata/export/19/json";

const CACHE = path.join(process.cwd(), ".cache");
const OUT = path.join(process.cwd(), "data");

const LICENCE = "政府資料開放授權條款-第1版 (Taiwan Open Government Data Licence v1)";

type RawDrug = Record<string, string | null>;
type RawHealthFood = Record<string, string | null>;

async function fetchCached(url: string, filename: string, fresh: boolean): Promise<Buffer> {
  const cached = path.join(CACHE, filename);
  if (!fresh && existsSync(cached)) {
    console.log(`  cached  ${filename}`);
    return readFile(cached);
  }
  console.log(`  GET     ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(CACHE, { recursive: true });
  await writeFile(cached, buf);
  console.log(`  saved   ${filename} (${(buf.length / 1e6).toFixed(1)} MB)`);
  return buf;
}

/**
 * The drug endpoint claims JSON and returns a ZIP containing one JSON file.
 * The health-food endpoint returns JSON directly. Sniff rather than assume, so
 * this keeps working if either side changes.
 */
function readJson<T>(buf: Buffer): T {
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // "PK"
  if (!isZip) return JSON.parse(buf.toString("utf8")) as T;
  const entry = new AdmZip(buf).getEntries().find((e) => e.entryName.endsWith(".json"));
  if (!entry) throw new Error("ZIP contained no .json entry");
  return JSON.parse(entry.getData().toString("utf8")) as T;
}

async function main() {
  const fresh = process.argv.includes("--fresh");
  const retrievedAt = new Date().toISOString().slice(0, 10);
  console.log("Ingesting TFDA open data\n");

  // ---- medicines -----------------------------------------------------------
  const rawDrugs = readJson<RawDrug[]>(
    await fetchCached(DRUG_URL, "tfda-drugs.zip", fresh),
  );

  let revoked = 0;
  let notDispensed = 0;
  let noIngredients = 0;

  const drugs = [];
  for (const r of rawDrugs) {
    if (!isActivePermit(r["註銷狀態"])) {
      revoked++;
      continue;
    }
    const dispensing = classifyDispensing(r["藥品類別"]);
    if (dispensing === "not_dispensed") {
      notDispensed++;
      continue;
    }
    const nameZh = (r["中文品名"] ?? "").trim();
    if (!nameZh) continue;

    const ingredients = parseIngredients(r["主成分略述"]);
    // Kept, not dropped: a product we can name but whose composition we do not
    // know is exactly the case the product must surface rather than hide.
    if (ingredients.length === 0) noIngredients++;

    drugs.push({
      permit: (r["許可證字號"] ?? "").trim(),
      nameZh,
      nameEn: (r["英文品名"] ?? "").trim() || undefined,
      key: normalizeProductName(nameZh),
      ingredients,
      // The register's own words for what the medicine is for. This is what
      // answers "what is this white one for?" — an official answer, not a
      // generated one.
      indications: (r["適應症"] ?? "").trim() || undefined,
      form: (r["劑型"] ?? "").trim() || undefined,
      dispensing,
    });
  }

  // ---- health foods --------------------------------------------------------
  const rawFoods = readJson<RawHealthFood[]>(
    await fetchCached(HEALTH_FOOD_URL, "tfda-health-foods.json", fresh),
  );

  const healthFoods = rawFoods
    .filter((r) => (r["證況"] ?? "").includes("核可"))
    .map((r) => ({
      permit: (r["許可證字號"] ?? "").trim(),
      nameZh: (r["中文品名"] ?? "").trim(),
      key: normalizeProductName(r["中文品名"] ?? ""),
      functionalIngredients: (r["保健功效相關成分"] ?? "").trim() || undefined,
      claim: (r["保健功效"] ?? "").trim() || undefined,
      // Approved by the regulator, quoted verbatim, never paraphrased by us or
      // by a model. This is the strongest kind of grounded text we have.
      warning: (r["警語"] ?? "").trim() || undefined,
      precautions: (r["注意事項"] ?? "").trim() || undefined,
    }))
    .filter((r) => r.nameZh.length > 0);

  await mkdir(OUT, { recursive: true });

  await writeFile(
    path.join(OUT, "tfda-drugs.json"),
    JSON.stringify(
      {
        source: "全部藥品許可證資料集 · data.gov.tw dataset 9122 · 衛生福利部食品藥物管理署",
        licence: LICENCE,
        retrievedAt,
        recordCount: drugs.length,
        drugs,
      },
      null,
      0,
    ),
  );

  await writeFile(
    path.join(OUT, "tfda-health-foods.json"),
    JSON.stringify(
      {
        source: "健康食品資料集 · data.gov.tw dataset 6951 · 衛生福利部食品藥物管理署",
        licence: LICENCE,
        retrievedAt,
        recordCount: healthFoods.length,
        healthFoods,
      },
      null,
      0,
    ),
  );

  console.log(`
medicines
  in register        ${rawDrugs.length}
  revoked            ${revoked}
  not dispensed      ${notDispensed}   (raw materials)
  kept               ${drugs.length}
  of which no stated ingredients  ${noIngredients}

health foods
  in register        ${rawFoods.length}
  kept (核可)        ${healthFoods.length}

written to data/
`);

  // 健康食品 is a licensed category, not a synonym for "supplement". Most of
  // what a family actually buys is ordinary food and appears in no register at
  // all — which is why the blind spot exists.
  console.log(
    "note: 健康食品 covers only licensed products. Most supplements in a\n" +
      "      Taiwanese home are not in any register, by design of the law.\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
