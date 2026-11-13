import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const DIST_ASSETS = resolve(import.meta.dirname, "../dist/assets");
const MAX_BUDGET_KB = 250;
const MAX_BUDGET_BYTES = MAX_BUDGET_KB * 1024;

console.log(`[NFR-11] Checking Web Production Bundle Budget (< ${MAX_BUDGET_KB} kB gzip)...`);

let files;
try {
  files = readdirSync(DIST_ASSETS).filter((file) => file.endsWith(".js"));
} catch {
  console.error(`Error reading dist directory (${DIST_ASSETS}). Did you run 'pnpm --filter web build' first?`);
  process.exit(1);
}

if (!files || files.length === 0) {
  console.error(`No JS assets found in ${DIST_ASSETS}.`);
  process.exit(1);
}

let totalGzipBytes = 0;
let totalRawBytes = 0;

console.log("\nAssets breakdown:");
for (const file of files) {
  const filePath = join(DIST_ASSETS, file);
  const content = readFileSync(filePath);
  const rawSize = statSync(filePath).size;
  const gzipSize = gzipSync(content).length;

  totalRawBytes += rawSize;
  totalGzipBytes += gzipSize;

  const rawKb = (rawSize / 1024).toFixed(2);
  const gzipKb = (gzipSize / 1024).toFixed(2);
  console.log(`  • ${file.padEnd(35)} raw: ${rawKb.padStart(7)} kB │ gzip: ${gzipKb.padStart(7)} kB`);
}

const totalGzipKb = (totalGzipBytes / 1024).toFixed(2);
const totalRawKb = (totalRawBytes / 1024).toFixed(2);
const budgetPercent = ((totalGzipBytes / MAX_BUDGET_BYTES) * 100).toFixed(1);

console.log("─".repeat(65));
console.log(`Total Raw Size:  ${totalRawKb} kB`);
console.log(`Total Gzip Size: ${totalGzipKb} kB / ${MAX_BUDGET_KB} kB budget (${budgetPercent}%)`);

if (totalGzipBytes > MAX_BUDGET_BYTES) {
  console.error(`\n❌ FAILED: Bundle budget exceeded by ${((totalGzipBytes - MAX_BUDGET_BYTES) / 1024).toFixed(2)} kB!`);
  process.exit(1);
} else {
  console.log(`\n✅ PASSED: Web bundle conforms to NFR-11 performance budget.`);
  process.exit(0);
}
