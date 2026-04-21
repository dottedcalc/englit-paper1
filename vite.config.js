import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PART_FILES = [
  "client.js",  // API key storage + callApi (Gemini + Claude)
  "app.js",     // classifier, criterion stubs, moderation, boot
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
      return chunks.join("\n");
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

// GitHub project page: set at build time, e.g. VITE_BASE=/ib-paper1-analyzer/ npm run build
// (GitHub Actions workflow sets this from the repository name.) Local dev: omit → "/".
const base = process.env.VITE_BASE?.trim() || "/";

export default {
  base,
  plugins: [ibPaperConcatPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: join(__dirname, "index.html"),
      },
    },
  },
};
