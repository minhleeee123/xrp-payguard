import { createLiveRelayServer } from "./live-http.js";
import { Coston2LiveRelayRuntime } from "./live-runtime.js";
import type { Hex } from "viem";

const privateKey = process.env.PAYGUARD_EXECUTOR_PRIVATE_KEY;
const rpcUrl = process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc";
const port = Number(process.env.PORT ?? "8080");
const allowedOrigins = (process.env.PAYGUARD_WEB_ORIGINS ?? "https://xrp-payguard.vercel.app,http://localhost:5173")
  .split(",").map((item) => item.trim()).filter(Boolean);

if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? "") || !Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
  throw new Error("PayGuard live relay runtime configuration is missing or malformed");
}

const runtime = new Coston2LiveRelayRuntime({
  rpcUrl,
  executorPrivateKey: privateKey as Hex,
  ...(process.env.COSTON2_EXPLORER_API_URL ? { explorerApiUrl: process.env.COSTON2_EXPLORER_API_URL } : {}),
});
const server = createLiveRelayServer(runtime, { allowedOrigins });
server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ status: "listening", service: "payguard-live-fcc-relay", port, privateMaterialLogged: false }));
});
