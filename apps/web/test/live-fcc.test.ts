import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import {
  DEFAULT_LIVE_FCC_RELAY_ORIGIN,
  LIVE_FCC_MODE,
  evaluateLiveRequest,
  fetchLiveFccConfig,
  liveEvaluationAuthorizationDigest,
  type LiveFccConfig,
} from "../src/live-fcc.js";
import { PAYGUARD_COSTON2, type Eip1193Provider } from "../src/coston2.js";

const address = (byte: string) => `0x${byte.repeat(40 / byte.length)}` as Address;
const hash = (byte: string) => `0x${byte.repeat(64 / byte.length)}` as Hex;
const operator = address("22");

function configWire() {
  return {
    schemaVersion: 1,
    mode: LIVE_FCC_MODE,
    status: "ready",
    chainId: 114,
    extensionId: hash("01"),
    deploymentBlock: "33792913",
    operator,
    contracts: {
      registry: PAYGUARD_COSTON2.registry,
      vault: PAYGUARD_COSTON2.vault,
      router: PAYGUARD_COSTON2.router,
      dispatcher: address("33"),
      manager: address("44"),
      asset: PAYGUARD_COSTON2.asset,
    },
    machines: [1, 2, 3].map((index) => ({
      index,
      teeId: address(`${index}${index}`),
      proxyId: address(`${index}${index + 3}`),
      origin: `https://machine-${index}.example.test`,
      machineId: hash(`0${index}`),
      keyFingerprint: hash(`0${index + 3}`),
      signer: address(`${index}${index}`),
      publicKey: { x: hash(`0${index + 6}`), y: hash(`1${index + 6}`) },
      codeHash: hash("aa"),
      platform: hash("bb"),
      status: 2,
    })),
    assertions: {
      registeredMachinesVerified: true,
      stableHttpsOriginsVerified: true,
      authenticatedPrivateIngressVerified: true,
      simulatedTee: true,
      hardwareTeeVerified: false,
      v2ReleaseVerified: false,
      verifiedPayGuardRelease: false,
    },
  };
}

describe("live FCC browser boundary", () => {
  it("pins the verified public relay when the build has no override", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(configWire()), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const config = await fetchLiveFccConfig(fetcher as typeof fetch);
    expect(config.relayOrigin).toBe(DEFAULT_LIVE_FCC_RELAY_ORIGIN);
    expect(fetcher).toHaveBeenCalledWith(`${DEFAULT_LIVE_FCC_RELAY_ORIGIN}/v1/config`, expect.any(Object));
  });

  it("accepts only the explicit V1 simulated-TEE domain", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(configWire()), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const config = await fetchLiveFccConfig(fetcher as typeof fetch, "https://relay.example.test");
    expect(config).toMatchObject({
      mode: LIVE_FCC_MODE,
      chainId: 114,
      operator,
      relayOrigin: "https://relay.example.test",
      assertions: { simulatedTee: true, hardwareTeeVerified: false, verifiedPayGuardRelease: false },
    });
    expect(config.machines).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledWith("https://relay.example.test/v1/config", expect.any(Object));
  });

  it("rejects a hardware or release claim not proven by the live config", async () => {
    const wire = configWire();
    wire.assertions.hardwareTeeVerified = true;
    const fetcher = vi.fn(async () => new Response(JSON.stringify(wire), { status: 200 }));
    await expect(fetchLiveFccConfig(fetcher as typeof fetch, "https://relay.example.test")).rejects.toThrow("LIVE_FCC_CONFIG_INVALID");
  });

  it("uses a stable request-specific authorization digest", () => {
    expect(liveEvaluationAuthorizationDigest(
      hash("11"), operator, 100n, 200n, address("33"),
    )).toBe("0x9bb7f7f5fb0db3f6eaef824bfd2a734ec4c5ffd13cb006f9d6ec974be96abce9");
    expect(liveEvaluationAuthorizationDigest(
      hash("11"), operator, 100n, 200n, "0x18Ea713cEf10ECf5cAC23c08dD25Ac17D2f07e3d",
    )).toBe("0x62eccde019645aa462f1b237ddd1a59a7cf856fe36721fa0728fd8004160033d");
  });

  it("sends an empty evaluation body and never supplies ALLOW or DENY", async () => {
    const config = { ...configWire(), deploymentBlock: 33792913n, relayOrigin: "https://relay.example.test" } as LiveFccConfig;
    const provider: Eip1193Provider = {
      request: vi.fn(async () => `0x${"11".repeat(65)}`),
    };
    const requestId = hash("11");
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.body).toBe("{}");
      expect(String(init?.body)).not.toMatch(/ALLOW|DENY|decision/i);
      const headers = new Headers(init?.headers);
      expect(headers.get("x-payguard-owner")).toBe(operator);
      expect(headers.get("x-payguard-authorization")).toMatch(/^0x[0-9a-f]{130}$/i);
      return new Response(JSON.stringify({
        schemaVersion: 1,
        mode: LIVE_FCC_MODE,
        status: "threshold-submitted",
        requestId,
        routerStatus: 2,
        decision: "ALLOW",
        publicReasonClass: "OK",
        instructionId: hash("55"),
        transactions: { dispatch: hash("66"), submit: [hash("77"), hash("88")] },
        assertions: {
          requestReadFromCoston2: true,
          clientDecisionAccepted: false,
          simulatedTee: true,
          hardwareTeeVerified: false,
          verifiedPayGuardRelease: false,
        },
      }), { status: 200 });
    });
    const result = await evaluateLiveRequest(requestId, operator, provider, config, fetcher as typeof fetch, 100n);
    expect(result).toMatchObject({ decision: "ALLOW", routerStatus: 2, instructionId: hash("55") });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
