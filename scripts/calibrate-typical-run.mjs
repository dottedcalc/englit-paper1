/**
 * Recompute TYPICAL_RUN_PROFILE numbers: loads client+app in a VM (no boot), appends measurement
 * helpers that use **26** equal word chunks. Paste JSON fields into src/parts/app.js if prompts change.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let code =
  readFileSync(join(root, "src/parts/client.js"), "utf8") +
  readFileSync(join(root, "src/parts/app.js"), "utf8");

code = code.replace(/\nboot\(\);\s*$/, "\n");
code += readFileSync(join(root, "scripts/typical-run-measure-append.js"), "utf8");

const localStorageMock = {
  _m: new Map(),
  getItem(k) {
    return this._m.has(k) ? this._m.get(k) : null;
  },
  setItem(k, v) {
    this._m.set(k, String(v));
  },
};

const ctx = vm.createContext({
  console,
  localStorage: localStorageMock,
  fetch: () => {
    throw new Error("fetch stub");
  },
  window: {},
});

vm.runInContext(code, ctx, { filename: "ib-calib.js" });
console.log(JSON.stringify(ctx.__CAL, null, 2));
