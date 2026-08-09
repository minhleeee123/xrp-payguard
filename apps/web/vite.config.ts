import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "es2022" },
  // Vercel serves this shell from the origin root. Keep asset URLs origin-relative
  // so a deployment cannot accidentally retain a repository-specific subpath.
  base: "/",
  server: { host: "127.0.0.1", port: 4173 },
});
