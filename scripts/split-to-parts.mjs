/**
 * Reads a monolithic app.js and writes `src/parts/*.js` slices (functional filenames).
 * Line ranges must stay in order and non-overlapping.
 *
 *   node scripts/split-to-parts.mjs
 *   node scripts/split-to-parts.mjs /path/to/app.js
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const monolithPath = process.argv[2] || join(root, "app.js");
let src;
try {
  src = readFileSync(monolithPath, "utf8");
} catch {
  console.error(
    `Could not read monolith at ${monolithPath}. Restore a single app.js or pass its path:\n  node scripts/split-to-parts.mjs /path/to/app.js`
  );
  process.exit(1);
}
const lines = src.split(/\r?\n/);

/** Inclusive 1-based line numbers [start, end] — same conventions as sed -n 'start,endp' */
const SLICES = [
  { start: 1, end: 908, file: "criteria-a-b-config-and-prompts.js" },
  { start: 910, end: 1359, file: "criterion-c-gemini-schemas.js" },
  { start: 1361, end: 2459, file: "criterion-d-schemas-prompts-and-highlights.js" },
  { start: 2460, end: 3618, file: "criterion-c-messages-scoring-and-highlighting.js" },
  { start: 3619, end: 4456, file: "criterion-c-detail-views-and-run.js" },
  { start: 4457, end: 5411, file: "criterion-d-pipeline-dashboard-and-bundles.js" },
  { start: 5412, end: 6464, file: "shell-dom-criterion-ab-ui.js" },
  { start: 6465, end: lines.length, file: "gemini-client-criteria-runs-and-boot.js" },
];

const outDir = join(root, "src", "parts");
mkdirSync(outDir, { recursive: true });

for (const { start: a, end: b, file: name } of SLICES) {
  const chunk = lines.slice(a - 1, b).join("\n") + "\n";
  writeFileSync(join(outDir, name), chunk, "utf8");
  const n = b - a + 1;
  if (n > 1500) {
    console.warn(`WARN: ${name} has ${n} lines (>1500)`);
  } else {
    console.log(`${name}: ${n} lines`);
  }
}
