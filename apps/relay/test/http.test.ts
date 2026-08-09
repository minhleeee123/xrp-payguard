import { describe, expect, it } from "vitest";
import { getAddress, padHex, stringToHex, type Hex } from "viem";
import { ACTION_FTESTXRP_TRANSFER, type ActionRequestV1, type SpendStateV1 } from "@xrp-payguard/protocol";
import { createRelayServer, HttpMachineTransport, type RelayDomainBinding } from "../src/http.js";
import { Relay } from "../src/relay.js";
import type { MachineDescriptor, MachineTransport } from "../src/types.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const registry = getAddress("0x00000000000000000000000000000000000000a1");
const vault = getAddress("0x00000000000000000000000000000000000000b2");
const router = getAddress("0x00000000000000000000000000000000000000c3");
const binding: RelayDomainBinding = { chainId: 114n, registry, vault, router };
const request: ActionRequestV1 = {
  chainId: 114n, registry, vault, router, policyId: id("policy"), policyVersion: 1,
  policyCommitment: id("commitment"), requestId: id("request"), requestNonce: 1n, attempt: 0,
  requester: registry, target: router, asset: vault, actionType: ACTION_FTESTXRP_TRANSFER, amount: 75n,
  scheduleSlot: 1_000n, occurrence: 1, spendCheckpoint: id("spend"), balanceCheckpoint: id("balance"),
  inputCommitment: id("input"), createdAt: 1_001n, graceDeadline: 1_100n, expiry: 1_200n,
};
const state: SpendStateV1 = {
  availableBalance: 100n, history: [], occurrenceCount: 1, lastAccountingAt: 0n,
  spendCheckpoint: request.spendCheckpoint, balanceCheckpoint: request.balanceCheckpoint, now: 1_050n,
};
const machines: MachineDescriptor[] = ["a", "b", "c"].map((name, index) => ({
  machineId: id(`machine-${name}`),
  keyFingerprint: id(`key-${name}`),
  signer: getAddress(`0x${String(index + 1).padStart(40, "0")}`),
  endpoint: `http://127.0.0.1/${name}`,
}));

const unavailableTransport: MachineTransport = {
  async evaluate() {
    throw new Error("offline");
  },
};

const stringify = (value: unknown): string => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item);

async function withServer(
  server: ReturnType<typeof createRelayServer>,
  run: (origin: string) => Promise<void>,
): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("relay HTTP boundary", () => {
  it("binds health to the exact public domain and rejects private ingress material", async () => {
    const server = createRelayServer(new Relay({ transport: unavailableTransport }), { binding });
    await withServer(server, async (origin) => {
      const health = await fetch(`${origin}/healthz`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({
        status: "ok",
        service: "payguard-relay",
        binding: { chainId: "114", registry, vault, router },
      });
      expect(health.headers.get("cache-control")).toBe("no-store");
      const privatePayload = await fetch(`${origin}/v1/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ciphertext: "should-never-cross-relay" }),
      });
      expect(privatePayload.status).toBe(400);
      expect(await privatePayload.text()).not.toContain("should-never-cross-relay");
    });
  });

  it("keeps aggregate metrics disabled by default and bearer-protected when enabled", async () => {
    const metricsFixture = "local-test-metrics-credential-32-bytes-minimum";
    const disabled = createRelayServer(new Relay({ transport: unavailableTransport }), { binding });
    await withServer(disabled, async (origin) => {
      expect((await fetch(`${origin}/metrics`)).status).toBe(404);
    });

    const relay = new Relay({ transport: unavailableTransport });
    const enabled = createRelayServer(relay, { binding, metrics: { bearerToken: metricsFixture } });
    await withServer(enabled, async (origin) => {
      const missing = await fetch(`${origin}/metrics`);
      expect(missing.status).toBe(401);
      expect(await missing.text()).not.toContain(metricsFixture);
      const wrong = await fetch(`${origin}/metrics`, { headers: { authorization: `Bearer ${"x".repeat(metricsFixture.length)}` } });
      expect(wrong.status).toBe(401);

      await fetch(`${origin}/v1/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: stringify({ request, state, machines }),
      });
      const metrics = await fetch(`${origin}/metrics`, { headers: { authorization: `Bearer ${metricsFixture}` } });
      expect(metrics.status).toBe(200);
      expect(metrics.headers.get("content-type")).toContain("text/plain");
      expect(metrics.headers.get("cache-control")).toBe("no-store");
      const body = await metrics.text();
      expect(body).toContain('payguard_relay_evaluations_total{outcome="unavailable"} 1');
      expect(body).not.toContain(metricsFixture);
      expect(body).not.toContain(request.requestId);
      expect(body).not.toContain(registry);

      const health = await (await fetch(`${origin}/healthz`)).text();
      expect(health).not.toContain(metricsFixture);
    });

    expect(() => createRelayServer(relay, { binding, metrics: { bearerToken: "too-short" } })).toThrow(/metrics bearer token/);
  });

  it("enforces the configured domain and a bounded per-client rate window", async () => {
    let now = 10_000;
    const server = createRelayServer(new Relay({ transport: unavailableTransport }), {
      binding,
      rateLimit: { maxRequests: 1, windowMs: 1_000 },
      nowMs: () => now,
    });
    await withServer(server, async (origin) => {
      const evaluate = (body: unknown) => fetch(`${origin}/v1/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: stringify(body),
      });
      const first = await evaluate({ request, state, machines });
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({ status: "UNAVAILABLE", failures: 3 });
      const limited = await evaluate({ request, state, machines });
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("1");
      now += 1_000;
      const wrongDomain = await evaluate({ request: { ...request, chainId: 115n }, state, machines });
      expect(wrongDomain.status).toBe(422);
    });
  });

  it("rejects an oversized machine response before parsing it", async () => {
    const fetcher = async () => new Response("{}", {
      status: 200,
      headers: { "content-length": String(512 * 1_024 + 1) },
    });
    const transport = new HttpMachineTransport(fetcher as typeof fetch);
    await expect(transport.evaluate(machines[0]!, request, state, new AbortController().signal)).rejects.toThrow(/too large/);
  });

  it("round-trips the Go decimal-string evaluation wire without precision loss", async () => {
    const result = {
      request,
      decision: "ALLOW",
      publicReasonClass: "OK",
      reservedAmount: request.amount,
      resultingCheckpoint: id("next"),
      resultNonce: request.requestId,
      attempt: request.attempt,
      issuedAt: 1_050n,
      expiry: request.expiry,
      machineId: machines[0]!.machineId,
      keyFingerprint: machines[0]!.keyFingerprint,
    };
    const fetcher = async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(String(init?.body)).toContain(`"availableBalance":"100"`);
      return new Response(stringify({
        result,
        digest: id("digest"),
        signer: machines[0]!.signer,
        signature: "0x01",
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const transport = new HttpMachineTransport(fetcher as typeof fetch);
    const decoded = await transport.evaluate(machines[0]!, request, state, new AbortController().signal);
    expect(decoded.result.decision).toBe("ALLOW");
    expect(decoded.result.reservedAmount).toBe(75n);
    expect(decoded.result.issuedAt).toBe(1_050n);
    expect(decoded.result.request.requestNonce).toBe(1n);
  });
});
