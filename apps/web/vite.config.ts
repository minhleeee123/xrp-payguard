import { defineConfig } from "vite";

const base = process.env.GITHUB_ACTIONS === "true" ? "/xrp-payguard/" : "/";

export default defineConfig({
  build: { target: "es2022" },
  base,
  server: { host: "127.0.0.1", port: 4173 },
});
