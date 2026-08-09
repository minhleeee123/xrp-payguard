import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, stringToHex } from "viem";
import {
  buildLiveFdcTriggerEvidence,
  compileIntegrationRuntime,
  loadXrplBrowserRuntime,
  parseLiveFdcCLI,
  parseValidatedXrplPaymentResult,
  randomNonZeroUint64,
  waitForPreparedFdcRequest,
} from "./coston2-fdc-trigger-live.mjs";
import { assertPublicSafe } from "./public-web-evidence.mjs";

const hash = (label) => keccak256(stringToHex(label));
const address = (digit) => `0x${digit.repeat(40)}`;

function observation() {
  return {
    chainId: 114,
    mode: "LIVE_XRPL_FDC_PENDING_SIMULATED_TEE",
    recordedAt: "2026-08-09T00:00:00.000Z",
    observedBlock: "123",
    transactionCount: 6,
    publicIdentifiers: {
      sourceCommit: "a".repeat(40),
      owner: address("1"),
      contracts: { trigger: address("2"), router: address("3") },
    },
    xrplPayment: {
      network: "xrpl-testnet",
      transactionHash: hash("xrpl"),
      ledgerIndex: "456",
      source: "r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59",
      destination: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      amountDrops: "100",
      requestIdMemo: hash("request"),
      validated: true,
    },
    fdc: {
      requestTransactionHash: hash("fdc-request"),
      votingRound: "7",
      merkleRoot: hash("root"),
      proofCommitment: hash("proof"),
      onChainVerified: true,
    },
    simulatedPolicy: {
      policyCommitment: hash("policy"),
      status: "Active",
      mode: "SIMULATED_TEE_ONCHAIN",
    },
    request: {
      requestId: hash("request"),
      requestNonce: "8",
      inputCommitment: hash("input"),
      proofCommitment: hash("proof"),
      requestHash: hash("request-hash"),
      transactionHash: hash("consume"),
      blockNumber: "124",
      status: "Pending",
      statusCode: 1,
    },
  };
}

describe("Coston2 live XRPL FDC Pending runner", () => {
  it("keeps planning read-only and requires every explicit testnet capability", () => {
    assert.deepEqual(parseLiveFdcCLI([]), {
      mode: "plan",
      broadcast: false,
      faucet: false,
      simulated: false,
    });
    assert.deepEqual(parseLiveFdcCLI([
      "run",
      "--broadcast",
      "--confirm-xrpl-testnet-faucet",
      "--confirm-simulated-tee-onchain",
    ]), { mode: "run", broadcast: true, faucet: true, simulated: true });
    assert.throws(() => parseLiveFdcCLI(["run", "--broadcast"]), /requires/);
    assert.throws(() => parseLiveFdcCLI(["plan", "--broadcast"]), /read-only/);
    assert.throws(() => parseLiveFdcCLI(["run", "--seed=unsafe"]), /credentials/);
  });

  it("compiles the tested integration primitives used by the live runner", async () => {
    const compiled = await compileIntegrationRuntime();
    try {
      for (const name of [
        "prepareCoston2XrplPaymentRequest",
        "prepareCoston2FdcSubmission",
        "deriveCoston2FdcVotingRound",
        "readCoston2FdcRoundFinality",
        "fetchCoston2XrplPaymentProof",
        "verifyCoston2XrplPaymentProof",
        "xrplPaymentInputCommitmentV1",
      ]) assert.equal(typeof compiled.runtime[name], "function", name);
    } finally {
      await compiled.cleanup();
    }
  });

  it("loads the exact pinned xrpl.js bundle without retaining a generated wallet", async () => {
    const xrpl = await loadXrplBrowserRuntime();
    assert.equal(typeof xrpl.Client, "function");
    assert.equal(typeof xrpl.Wallet.generate, "function");
    const wallet = xrpl.Wallet.generate();
    assert.equal(xrpl.isValidClassicAddress(wallet.classicAddress), true);
  });

  it("accepts the API v2 DeliverMax field and rejects v1/v2 amount drift", () => {
    const expected = {
      source: "r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59",
      destination: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      amountDrops: 100n,
      requestId: hash("request"),
    };
    const result = {
      validated: true,
      hash: hash("xrpl").slice(2).toUpperCase(),
      ledger_index: 456,
      tx_json: {
        TransactionType: "Payment",
        Account: expected.source,
        Destination: expected.destination,
        DeliverMax: "100",
        Memos: [{ Memo: { MemoData: expected.requestId.slice(2).toUpperCase() } }],
      },
      meta: { TransactionResult: "tesSUCCESS", delivered_amount: "100" },
    };
    assert.deepEqual(parseValidatedXrplPaymentResult(result, expected), {
      transactionHash: hash("xrpl"),
      ledgerIndex: 456n,
    });
    assert.throws(() => parseValidatedXrplPaymentResult({
      ...result,
      tx_json: { ...result.tx_json, Amount: "101" },
    }, expected), /amount drift/);
  });

  it("bounds fresh-payment verifier indexing retries without retrying drift", async () => {
    let attempts = 0;
    let now = 0;
    const prepared = await waitForPreparedFdcRequest(async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("not indexed"), { reason: "REJECTED" });
      return { status: "VALID" };
    }, { transactionId: hash("xrpl") }, {
      timeoutMs: 50,
      pollMs: 10,
      clock: () => now,
      sleeper: async (milliseconds) => { now += milliseconds; },
    });
    assert.deepEqual(prepared, { status: "VALID" });
    assert.equal(attempts, 3);
    await assert.rejects(() => waitForPreparedFdcRequest(async () => {
      throw Object.assign(new Error("binding drift"), { reason: "DRIFT" });
    }, {}, { timeoutMs: 50, pollMs: 10 }), /binding drift/);
  });

  it("keeps receipt nonces inside the canonical non-zero uint64 wire width", () => {
    assert.equal(randomNonZeroUint64(() => Buffer.alloc(8)), 1n);
    assert.equal(randomNonZeroUint64(() => Buffer.from("ffffffffffffffff", "hex")), (1n << 64n) - 1n);
  });

  it("builds explicit public-safe evidence that stops at Pending", () => {
    const evidence = buildLiveFdcTriggerEvidence(observation());
    assert.equal(evidence.status, "coston2-live-pass");
    assert.equal(evidence.request.status, "Pending");
    assert.equal(evidence.assertions.fdcProofVerifiedOnChain, true);
    assert.equal(evidence.assertions.hardwareTeeVerified, false);
    assert.equal(evidence.assertions.liveFccResultVerified, false);
    assert.equal(evidence.assertions.requestExecuted, false);
    assert.doesNotThrow(() => assertPublicSafe(evidence));
    assert.throws(() => buildLiveFdcTriggerEvidence({
      ...observation(),
      request: { ...observation().request, status: "Executed", statusCode: 4 },
    }), /incomplete/);
  });
});
