import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { createLiveRelayServer } from "../src/live-http.js";
import { LIVE_FCC_MODE, type LiveFccConfig, type LiveRelayRuntime } from "../src/live-types.js";

const address = (suffix: string) => `0x${suffix.padStart(40, "0")}` as Address;
const hex = (suffix: string) => `0x${suffix.padStart(64, "0")}` as Hex;
const config: LiveFccConfig = {
  schemaVersion: 1,
  mode: LIVE_FCC_MODE,
  status: "ready",
  chainId: 114,
  extensionId: hex("101f5"),
  deploymentBlock: "1",
  operator: address("77"),
  registryVersion: "V2",
  deploymentProfile: "COSTON2_SIMULATED_V2",
  fallback: { strategy: "RAILWAY_ROLLBACK_TO_V1", registry: address("7"), vault: address("8"), router: address("9") },
  contracts: { registry: address("1"), vault: address("2"), router: address("3"), dispatcher: address("4"), manager: address("5"), asset: address("6") },
  machines: [1, 2, 3].map((index) => ({
    index: index as 1 | 2 | 3,
    teeId: address(`${index}1`), proxyId: address(`${index}2`), origin: `https://machine-${index}.example.test`,
    machineId: hex(`${index}1`), keyFingerprint: hex(`${index}2`), signer: address(`${index}1`),
    publicKey: { x: hex(`${index}3`), y: hex(`${index}4`) }, codeHash: hex("aa"), platform: hex("bb"), status: 2,
  })) as LiveFccConfig["machines"],
  assertions: {
    registeredMachinesVerified: true, stableHttpsOriginsVerified: true,
    authenticatedPrivateIngressVerified: true, simulatedTee: true,
    hardwareTeeVerified: false, v2LiveCandidateVerified: true, v2ReleaseVerified: false, verifiedPayGuardRelease: false,
  },
};

const servers: Array<ReturnType<typeof createLiveRelayServer>> = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

async function start(
  runtime: LiveRelayRuntime,
  limits: { rateLimit?: { maxRequests: number; windowMs: number }; requesterRateLimit?: { maxRequests: number; windowMs: number } } = {},
): Promise<string> {
  const server = createLiveRelayServer(runtime, {
    allowedOrigins: ["https://xrp-payguard.vercel.app"],
    rateLimit: limits.rateLimit ?? { maxRequests: 2, windowMs: 60_000 },
    ...(limits.requesterRateLimit ? { requesterRateLimit: limits.requesterRateLimit } : {}),
    nowMs: () => 1,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const bound = server.address();
  if (!bound || typeof bound === "string") throw new Error("test server unavailable");
  return `http://127.0.0.1:${bound.port}`;
}

describe("live FCC relay HTTP boundary", () => {
  it("serves only explicit simulated-TEE configuration with exact CORS", async () => {
    const runtime = { config: vi.fn(async () => config), ingress: vi.fn(), evaluate: vi.fn() } as unknown as LiveRelayRuntime;
    const origin = await start(runtime);
    const response = await fetch(`${origin}/v1/config`, { headers: { Origin: "https://xrp-payguard.vercel.app" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://xrp-payguard.vercel.app");
    expect(await response.json()).toMatchObject({ mode: LIVE_FCC_MODE, assertions: { simulatedTee: true, hardwareTeeVerified: false, verifiedPayGuardRelease: false } });
    expect((await fetch(`${origin}/v1/config`, { headers: { Origin: "https://evil.example" } })).status).toBe(403);
  });

  it("forwards opaque ingress and rejects decision-bearing evaluation bodies", async () => {
    const ingress = vi.fn(async (_index: number, value: unknown) => ({ accepted: Boolean(value) }));
    const evaluate = vi.fn(async () => ({ schemaVersion: 1, mode: LIVE_FCC_MODE, status: "threshold-submitted", requestId: hex("9"), routerStatus: 2, decision: "ALLOW", publicReasonClass: "OK", transactions: { submit: [] }, assertions: {} }));
    const runtime = { config: vi.fn(async () => config), ingress, evaluate } as unknown as LiveRelayRuntime;
    const origin = await start(runtime);
    const headers = { Origin: "https://xrp-payguard.vercel.app", "Content-Type": "application/json" };
    const accepted = await fetch(`${origin}/v1/ingress/2`, { method: "POST", headers, body: JSON.stringify({ ciphertext: "opaque" }) });
    expect(accepted.status).toBe(200);
    expect(ingress).toHaveBeenCalledWith(2, { ciphertext: "opaque" });
    const rejected = await fetch(`${origin}/v1/requests/${hex("9")}/evaluate`, { method: "POST", headers, body: JSON.stringify({ decision: "ALLOW" }) });
    expect(rejected.status).toBe(422);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("accepts request-id-only evaluation and rate limits fail closed", async () => {
    const evaluate = vi.fn(async (requestId: Hex) => ({ schemaVersion: 1, mode: LIVE_FCC_MODE, status: "already-finalized", requestId, routerStatus: 3, decision: "DENY", publicReasonClass: "CAP_EXCEEDED", transactions: { submit: [] }, assertions: {} }));
    const runtime = { config: vi.fn(async () => config), ingress: vi.fn(), evaluate } as unknown as LiveRelayRuntime;
    const origin = await start(runtime);
    const headers = {
      "Content-Type": "application/json",
      "x-payguard-requester": address("77"),
      "x-payguard-issued-at": "1",
      "x-payguard-expiry": "2",
      "x-payguard-authorization": `0x${"11".repeat(65)}`,
    };
    const first = await fetch(`${origin}/v1/requests/${hex("9")}/evaluate`, { method: "POST", headers, body: "{}" });
    expect(first.status).toBe(200);
    expect(evaluate).toHaveBeenCalledWith(hex("9"), {
      requester: address("77"), issuedAt: 1n, expiry: 2n, signature: `0x${"11".repeat(65)}`,
    });
    await fetch(`${origin}/v1/requests/${hex("8")}/evaluate`, { method: "POST", headers, body: "{}" });
    expect((await fetch(`${origin}/v1/requests/${hex("7")}/evaluate`, { method: "POST", headers, body: "{}" })).status).toBe(429);
  });

  it("rate limits evaluation per requester and caller-address pair", async () => {
    const evaluate = vi.fn(async (requestId: Hex) => ({ schemaVersion: 1, mode: LIVE_FCC_MODE, status: "already-finalized", requestId, routerStatus: 3, decision: "DENY", publicReasonClass: "CAP_EXCEEDED", transactions: { submit: [] }, assertions: {} }));
    const runtime = { config: vi.fn(async () => config), ingress: vi.fn(), evaluate } as unknown as LiveRelayRuntime;
    const origin = await start(runtime, {
      rateLimit: { maxRequests: 10, windowMs: 60_000 },
      requesterRateLimit: { maxRequests: 1, windowMs: 60_000 },
    });
    const headers = (requester: Address) => ({
      "Content-Type": "application/json",
      "x-payguard-requester": requester,
      "x-payguard-issued-at": "1",
      "x-payguard-expiry": "2",
      "x-payguard-authorization": `0x${"11".repeat(65)}`,
    });
    expect((await fetch(`${origin}/v1/requests/${hex("9")}/evaluate`, { method: "POST", headers: headers(address("77")), body: "{}" })).status).toBe(200);
    expect((await fetch(`${origin}/v1/requests/${hex("8")}/evaluate`, { method: "POST", headers: headers(address("77")), body: "{}" })).status).toBe(429);
    expect((await fetch(`${origin}/v1/requests/${hex("7")}/evaluate`, { method: "POST", headers: headers(address("88")), body: "{}" })).status).toBe(200);
  });
});
