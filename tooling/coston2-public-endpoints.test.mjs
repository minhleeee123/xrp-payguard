import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPublicEndpointEvidence,
  collectPublicEndpointObservation,
  COSTON2_EXPLORER_API_URL,
  parsePublicEndpointCLI,
} from "./coston2-public-endpoints.mjs";

function response(status, body) {
  return {
    status,
    async json() { return body; },
  };
}

describe("Coston2 public endpoint observation", () => {
  it("parses read-only mode and an explicit write flag", () => {
    assert.deepEqual(parsePublicEndpointCLI(["observe"]), { mode: "observe", write: false });
    assert.deepEqual(parsePublicEndpointCLI(["observe", "--write"]), { mode: "observe", write: true });
    assert.throws(() => parsePublicEndpointCLI(["record"]), /mode/);
    assert.throws(() => parsePublicEndpointCLI(["observe", "--write", "--write"]), /duplicate/);
  });

  it("collects chain, explorer ABI, and faucet reachability without retaining responses", async () => {
    const calls = [];
    const fetcher = async (url) => {
      calls.push(url);
      if (url === "https://coston2-api.flare.network/ext/C/rpc") {
        return calls.filter((value) => value === url).length === 1
          ? response(200, { jsonrpc: "2.0", result: "0x72", id: 1 })
          : response(200, { jsonrpc: "2.0", result: "0x1490", id: 2 });
      }
      if (url === "https://coston2-explorer.flare.network") return response(200, {});
      if (url === COSTON2_EXPLORER_API_URL + "?module=contract&action=getabi&address=0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019") {
        return response(200, { status: "1", message: "OK", result: JSON.stringify([{ type: "function" }]) });
      }
      if (url === "https://faucet.flare.network") return response(200, {});
      throw new Error(`unexpected URL ${url}`);
    };
    const observation = await collectPublicEndpointObservation({ fetcher });
    assert.equal(observation.chainId, 114);
    assert.equal(observation.chainIdHex, "0x72");
    assert.equal(observation.observedBlock, "5264");
    assert.equal(observation.explorerAbiItems, 1);
    const evidence = buildPublicEndpointEvidence(observation, "2026-08-09T00:00:00.000Z");
    assert.equal(evidence.assertions.faucetRequestNotSubmitted, true);
    assert.equal(evidence.publicIdentifiers.explorerApi.registryAbiItems, 1);
    assert.deepEqual(Object.values(evidence.assertions).filter((value) => typeof value !== "boolean"), []);
  });

  it("fails closed on wrong chain, API failure, or non-success endpoint status", async () => {
    const base = async (url) => {
      if (url === "https://coston2-api.flare.network/ext/C/rpc") return response(200, { result: "0x71" });
      throw new Error(`unexpected URL ${url}`);
    };
    await assert.rejects(() => collectPublicEndpointObservation({ fetcher: base }), /wrong chain ID/);

    const wrongApi = async (url) => {
      if (url === "https://coston2-api.flare.network/ext/C/rpc") {
        const count = wrongApi.calls++;
        return response(200, { result: count === 0 ? "0x72" : "0x1490" });
      }
      if (url === "https://coston2-explorer.flare.network") return response(200, {});
      if (url.startsWith(COSTON2_EXPLORER_API_URL)) return response(200, { status: "0", result: "" });
      throw new Error(`unexpected URL ${url}`);
    };
    wrongApi.calls = 0;
    await assert.rejects(() => collectPublicEndpointObservation({ fetcher: wrongApi }), /Explorer API/);

    const incomplete = {
      chainId: 114,
      chainIdHex: "0x72",
      observedBlock: "10",
      rpcStatus: 200,
      explorerStatus: 200,
      explorerApiStatus: 200,
      explorerAbiItems: 1,
      faucetStatus: 200,
    };
    assert.throws(() => buildPublicEndpointEvidence({ ...incomplete, faucetStatus: 503 }), /faucetStatus/);
  });
});
