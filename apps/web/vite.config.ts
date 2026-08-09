import { defineConfig } from "vite";
import { resolve } from "node:path";
import { createPublicWebEvidencePlugin } from "../../tooling/public-web-evidence.mjs";

export default defineConfig({
  build: { target: "es2022" },
  // Vercel serves this shell from the origin root. Keep asset URLs origin-relative
  // so a deployment cannot accidentally retain a repository-specific subpath.
  base: "/",
  plugins: [createPublicWebEvidencePlugin(resolve(import.meta.dirname, "../.."))],
  server: { host: "127.0.0.1", port: 4173 },
});
