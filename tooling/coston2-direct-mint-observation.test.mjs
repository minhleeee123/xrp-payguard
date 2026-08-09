import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSET_MANAGER_REGISTRY_NAME,
  ASSET_MANAGER_RUNTIME_ABI,
  buildDirectMintObservationEvidence,
  collectDirectMintObservation,
  parseDirectMintObservationCLI,
} from "./coston2-direct-mint-observation.mjs";

const address = (digit) => `0x${digit.repeat(40)}`;
const paymentAddress = "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn";

describe("Coston2 direct-mint runtime observation", () => {
  it("accepts only read-only observation arguments", () => {
    assert.deepEqual(parseDirectMintObservationCLI(["observe"]), { mode: "observe", write: false, netMintAmountUBA: 1_000_000n });
    assert.deepEqual(parseDirectMintObservationCLI(["observe", "--write", "--net-mint-uba", "2000000"]), { mode: "observe", write: true, netMintAmountUBA: 2_000_000n });
    assert.throws(() => parseDirectMintObservationCLI(["record"]), /mode/);
    assert.throws(() => parseDirectMintObservationCLI(["observe", "--write", "--write"]), /duplicate/);
    assert.throws(() => parseDirectMintObservationCLI(["observe", "--net-mint-uba", "1", "--net-mint-uba", "2"]), /duplicate/);
    assert.throws(() => parseDirectMintObservationCLI(["observe", "--net-mint-uba", "-1"]), /uint256/);
  });

  it("resolves the manager and recomputes the official integer quote", async () => {
    const calls = [];
    const observation = await collectDirectMintObservation({
      netMintAmountUBA: 1_000_000n,
      client: {
        async getChainId() { return 114; },
        async getBlockNumber() { return 12345n; },
        async readContract(args) {
          calls.push(args);
          if (args.functionName === "getContractAddressByName") return address("1");
          if (args.functionName === "fAsset") return address("2");
          if (args.functionName === "getDirectMintingExecutorFeeUBA") return 7n;
          if (args.functionName === "getDirectMintingFeeBIPS") return 25n;
          if (args.functionName === "getDirectMintingMinimumFeeUBA") return 100n;
          if (args.functionName === "directMintingPaymentAddress") return paymentAddress;
          throw new Error(`unexpected ${args.functionName}`);
        },
      },
    });
    assert.equal(observation.assetManager, address("1"));
    assert.equal(observation.fAsset, address("2"));
    assert.equal(observation.paymentAddress, paymentAddress);
    assert.deepEqual(observation.quote, {
      netMintAmountUBA: 1_000_000n,
      executorFeeUBA: 7n,
      feeBIPS: 25n,
      minimumFeeUBA: 100n,
      proportionalFeeUBA: 2_500n,
      mintingFeeUBA: 2_500n,
      totalPaymentUBA: 1_002_507n,
    });
    assert.equal(calls[0].args[0], ASSET_MANAGER_REGISTRY_NAME);
    assert.equal(calls.some((call) => call.abi === ASSET_MANAGER_RUNTIME_ABI), true);
  });

  it("builds public-only evidence and rejects quote drift", () => {
    const observation = {
      chainId: 114,
      observedBlock: "12345",
      assetManager: address("1"),
      fAsset: address("2"),
      paymentAddress,
      quote: {
        netMintAmountUBA: 1_000_000n,
        executorFeeUBA: 7n,
        feeBIPS: 25n,
        minimumFeeUBA: 100n,
        proportionalFeeUBA: 2_500n,
        mintingFeeUBA: 2_500n,
        totalPaymentUBA: 1_002_507n,
      },
    };
    const evidence = buildDirectMintObservationEvidence(observation, "2026-08-09T00:00:00.000Z");
    assert.equal(evidence.network.chainId, 114);
    assert.equal(evidence.assertions.noTransactionSubmitted, true);
    assert.deepEqual(Object.values(evidence.assertions).filter((value) => typeof value !== "boolean"), []);
    assert.throws(() => buildDirectMintObservationEvidence({ ...observation, quote: { ...observation.quote, totalPaymentUBA: 1n } }), /quote drift/);
    assert.throws(() => buildDirectMintObservationEvidence({ ...observation, chainId: 115 }), /Coston2/);
  });
});
