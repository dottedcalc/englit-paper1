import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Concatenation order — each slice is one functional area of the former monolith. */
const PART_FILES = [
  "criteria-a-b-config-and-prompts.js",
  "criterion-c-gemini-schemas.js",
  "criterion-d-schemas-prompts-and-highlights.js",
  "criterion-c-messages-scoring-and-highlighting.js",
  "criterion-c-detail-views-and-run.js",
  "criterion-d-pipeline-dashboard-and-bundles.js",
  "shell-dom-criterion-ab-ui.js",
  "paragraph-essay-classifier.js",
  "grading-preflight-and-progress-ui.js",
  "gemini-client-criteria-runs-and-boot.js",
  "ib-full-report-pdf.js",
];

function ibPaperConcatPlugin() {
  const partsDir = join(__dirname, "src", "parts");
  const partAbsPaths = PART_FILES.map((f) => join(partsDir, f));
  const VIRTUAL_ID = "virtual:ib-app";
  const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;
  /** @type {import("vite").ViteDevServer | null} */
  let devServer = null;
  return {
    name: "ib-paper1-concat-parts",
    configureServer(server) {
      devServer = server;
      for (const p of partAbsPaths) server.watcher.add(p);
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      const chunks = PART_FILES.map((f) => readFileSync(join(partsDir, f), "utf8"));
      return `import { jsPDF } from "jspdf";\n${chunks.join("\n")}`;
    },
    handleHotUpdate(ctx) {
      const changed = ctx.file.replace(/\\/g, "/");
      const isPart = partAbsPaths.some((p) => p.replace(/\\/g, "/") === changed);
      if (!isPart || !devServer) return;
      const mod = devServer.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
      if (mod) devServer.moduleGraph.invalidateModule(mod);
      devServer.ws.send({ type: "full-reload", path: "*" });
      return [];
    },
  };
}

/** GitHub project Pages: set VITE_BASE=/repo-name/ in CI (see .github/workflows). */
const base = process.env.VITE_BASE?.trim() || "/";

export default {
  base,
  plugins: [ibPaperConcatPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: join(__dirname, "index.html"),
        criterionA: join(__dirname, "criterion-a-detail.html"),
        criterionB: join(__dirname, "criterion-b-detail.html"),
        criterionC: join(__dirname, "criterion-c-detail.html"),
        criterionD: join(__dirname, "criterion-d-detail.html"),
      },
    },
  },
};
