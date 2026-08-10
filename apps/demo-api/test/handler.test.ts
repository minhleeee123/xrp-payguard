import { afterEach, describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import {
  INTERACTIVE_DEMO_CODE_VERSION,
  INTERACTIVE_DEMO_EXTENSION_ID,
  INTERACTIVE_DEMO_MODE,
  stringifyDemoWire,
  type DemoDomainConfig,
} from "@xrp-payguard/demo";
import { createDemoActorDescriptor } from "@xrp-payguard/demo/server";

vi.mock("../src/chain-state.js", () => ({
  loadCoston2FinalizedTimestamp: async () => 1_800_000_000n,
  createCoston2DemoStateReader: () => ({
    load: async () => { throw new Error("state reader must not run for malformed input"); },
  }),
}));

import { handleDemoActor, handleDemoConfig, loadDemoConfig } from "../src/handler.js";

const addresses = {
  registry: "0x0000000000000000000000000000000000000011",
  vault: "0x0000000000000000000000000000000000000012",
  router: "0x0000000000000000000000000000000000000013",
  asset: "0x0000000000000000000000000000000000000014",
} as const;

function fixture(): { config: DemoDomainConfig; actorKeys: readonly [Hex, Hex, Hex] } {
  const actorKeys = [generatePrivateKey(), generatePrivateKey(), generatePrivateKey()] as const;
  return {
    actorKeys,
    config: {
      mode: INTERACTIVE_DEMO_MODE,
      chainId: 114,
      ...addresses,
      deploymentBlock: 10n,
      extensionId: INTERACTIVE_DEMO_EXTENSION_ID,
      codeVersion: INTERACTIVE_DEMO_CODE_VERSION,
      actors: [
        createDemoActorDescriptor(1, actorKeys[0], "https://demo.example.test/api/demo/machine-1"),
        createDemoActorDescriptor(2, actorKeys[1], "https://demo.example.test/api/demo/machine-2"),
        createDemoActorDescriptor(3, actorKeys[2], "https://demo.example.test/api/demo/machine-3"),
      ],
      assertions: {
        hardwareTeeVerified: false,
        registeredProductionMachinesVerified: false,
        independentOperatorsVerified: false,
        sealedPersistenceVerified: false,
        productionFccReleaseVerified: false,
      },
    },
  };
}

class ResponseRecorder {
  statusCode = 0;
  body = "";
  readonly headers = new Map<string, string>();

  status(code: number): this { this.statusCode = code; return this; }
  setHeader(name: string, value: string): void { this.headers.set(name.toLowerCase(), value); }
  send(body: string): void { this.body = body; }
}

function installEnvironment(): ReturnType<typeof fixture> {
  const value = fixture();
  vi.stubEnv("PAYGUARD_INTERACTIVE_DEMO_CONFIG", stringifyDemoWire(value.config));
  value.actorKeys.forEach((key, index) => vi.stubEnv(`PAYGUARD_DEMO_ACTOR_${index + 1}_PRIVATE_KEY`, key));
  return value;
}

afterEach(() => vi.unstubAllEnvs());

describe("interactive demo API boundary", () => {
  it("returns only the parsed public config with strict no-store headers", async () => {
    const { actorKeys } = installEnvironment();
    const response = new ResponseRecorder();
    await handleDemoConfig({ method: "GET", body: undefined, headers: {} }, response);

    expect(response.statusCode).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.mode).toBe(INTERACTIVE_DEMO_MODE);
    expect((body.actors as unknown[])).toHaveLength(3);
    actorKeys.forEach((key) => expect(response.body).not.toContain(key));
  });

  it("fails closed when configuration is missing or malformed", async () => {
    expect(() => loadDemoConfig({})).toThrow(/unavailable/);
    const response = new ResponseRecorder();
    await handleDemoConfig({ method: "POST", body: undefined, headers: {} }, response);
    expect(response.statusCode).toBe(405);
    expect(JSON.parse(response.body)).toEqual({ status: "METHOD_NOT_ALLOWED" });
  });

  it("rejects wrong media types and oversized bodies before actor processing", async () => {
    installEnvironment();
    const wrongType = new ResponseRecorder();
    await handleDemoActor(1, { method: "POST", body: {}, headers: { "content-type": "text/plain" } }, wrongType);
    expect(wrongType.statusCode).toBe(415);

    const oversized = new ResponseRecorder();
    await handleDemoActor(1, {
      method: "POST",
      body: {},
      headers: { "content-type": "application/json", "content-length": String(161 * 1024) },
    }, oversized);
    expect(oversized.statusCode).toBe(413);
  });

  it("rejects a client-supplied decision with a bounded public reason", async () => {
    installEnvironment();
    const response = new ResponseRecorder();
    await handleDemoActor(1, {
      method: "POST",
      body: { decision: "ALLOW" },
      headers: { "content-type": "application/json", "content-length": "20" },
    }, response);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      status: "INVALID_REQUEST",
      reason: "DEPENDENCY_OR_INPUT_INVALID",
    });
    expect(response.body).not.toContain("ALLOW");
  });
});
