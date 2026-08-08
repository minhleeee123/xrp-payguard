import { describe, expect, it } from "vitest";
import { padHex, stringToHex, zeroHash, type Hex } from "viem";
import { acceptFdcProof, assertFundingJobIntegrity, buildOperationHash, createFundingJob, executeDirectMint, markFdcRequested, observeXrplPayment, resumeDelayed } from "../src/funding.js";
import { verifyXrplPaymentProof, type ExpectedXrplPayment, type XrplPaymentProofV1 } from "../src/fdc.js";
import { referenceValueCeil, validateFtsoSnapshot, type FtsoSnapshotV1 } from "../src/ftso.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const expected: ExpectedXrplPayment = {
  network: "testnet", sourceId: id("source"), txHash: id("tx"), source: "rSource", proofOwner: "0x00000000000000000000000000000000000000c3", destination: "0x00000000000000000000000000000000000000a1", amountDrops: 1_000_000n, memoHash: id("memo"), minLedgerIndex: 10n,
};
const proof = (patch: Partial<XrplPaymentProofV1> = {}): XrplPaymentProofV1 => ({
  attestationType: "XRPPayment", sourceId: id("source"), responseCommitment: id("proof"), votingRound: 22n, finalized: true,
  network: expected.network, txHash: expected.txHash, source: expected.source, proofOwner: expected.proofOwner, destination: expected.destination,
  amountDrops: expected.amountDrops, memoHash: expected.memoHash, ledgerIndex: 11n, ...patch,
});

describe("FTSO/FDC/Smart Account fail-closed boundaries", () => {
  it("validates fresh FTSO input and deterministic ceil conversion", () => {
    const snapshot: FtsoSnapshotV1 = { feedId: id("xrp-usd"), value: 12345n, decimals: 3, timestamp: 100n, checkpoint: id("round") };
    expect(validateFtsoSnapshot(snapshot, snapshot.feedId, 120n, 30n)).toEqual({ ok: true });
    expect(referenceValueCeil(10n, snapshot)).toBe(124n);
    expect(validateFtsoSnapshot({ ...snapshot, timestamp: 80n }, snapshot.feedId, 120n, 30n)).toEqual({ ok: false, reason: "STALE" });
    expect(validateFtsoSnapshot({ ...snapshot, value: 0n }, snapshot.feedId, 120n, 30n)).toEqual({ ok: false, reason: "VALUE_INVALID" });
  });

  it("requires an actual FDC verifier and binds every payment field", async () => {
    const noVerifier = await verifyXrplPaymentProof(proof(), expected, undefined);
    expect(noVerifier).toEqual({ ok: false, reason: "VERIFIER_UNAVAILABLE" });
    const verifier = { verify: async () => true };
    expect(await verifyXrplPaymentProof(proof(), expected, verifier)).toEqual({ ok: true, proofCommitment: id("proof") });
    expect((await verifyXrplPaymentProof(proof({ amountDrops: 1n }), expected, verifier)).ok).toBe(false);
    expect((await verifyXrplPaymentProof(proof({ proofOwner: "0x00000000000000000000000000000000000000c4" }), expected, verifier)).ok).toBe(false);
    expect((await verifyXrplPaymentProof(proof({ finalized: false }), expected, verifier)).ok).toBe(false);
  });

  it("binds XRPL payment, FDC request, operation hash, and delayed resume", async () => {
    const job = createFundingJob({
      jobId: id("job"), owner: "0x00000000000000000000000000000000000000a1", personalAccount: "0x00000000000000000000000000000000000000a2", destination: expected.destination,
      asset: "0x00000000000000000000000000000000000000a3", amount: 1_000_000n, executorFee: 10n, nonce: 1n, memoHash: expected.memoHash, expectedPayment: expected,
    });
    expect(job.operationHash).toBe(buildOperationHash(job));
    expect(job.expectedPaymentHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(job.checkpointHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(() => observeXrplPayment(job, { ...expected, sourceId: id("wrong-source"), validated: true, result: "tesSUCCESS", ledgerIndex: 11n })).toThrow(/mismatch/);
    expect(() => observeXrplPayment(job, { ...expected, proofOwner: "0x00000000000000000000000000000000000000c4", validated: true, result: "tesSUCCESS", ledgerIndex: 11n })).toThrow(/mismatch/);
    const observed = observeXrplPayment(job, { ...expected, validated: true, result: "tesSUCCESS", ledgerIndex: 11n });
    const requested = markFdcRequested(observed, id("fdc-request"));
    const ready = await acceptFdcProof(requested, proof(), { verify: async () => true });
    const delayed = await executeDirectMint(ready, proof(), { executeDirectMint: async (candidate) => ({ status: "DELAYED", operationHash: candidate.operationHash, executionAllowedAt: 30n }) });
    expect(delayed.state).toBe("DELAYED");
    expect(resumeDelayed(delayed, 30n).state).toBe("PROOF_READY");
    await expect(executeDirectMint(ready, proof(), undefined)).rejects.toThrow(/unavailable/);

    await expect(executeDirectMint({ ...ready, nonce: 2n }, proof(), { executeDirectMint: async () => { throw new Error("must not call"); } })).rejects.toThrow(/drift/);
    await expect(executeDirectMint(
      { ...ready, expectedPayment: { ...ready.expectedPayment, txHash: id("drifted-tx") } },
      proof({ txHash: id("drifted-tx") }),
      { executeDirectMint: async () => { throw new Error("must not call"); } },
    )).rejects.toThrow(/drift/);
    await expect(executeDirectMint(ready, proof({ responseCommitment: id("other-proof") }), { executeDirectMint: async () => { throw new Error("must not call"); } })).rejects.toThrow(/proof drift/);
    await expect(executeDirectMint(
      { ...ready, proofCommitment: id("other-proof") },
      proof({ responseCommitment: id("other-proof") }),
      { executeDirectMint: async () => { throw new Error("must not call"); } },
    )).rejects.toThrow(/drift/);
    await expect(executeDirectMint(ready, proof(), { executeDirectMint: async () => ({ status: "DELAYED", operationHash: id("wrong-operation"), executionAllowedAt: 30n }) })).rejects.toThrow(/unknown/);

    const minted = await executeDirectMint(ready, proof(), {
      executeDirectMint: async (candidate) => ({
        status: "DIRECT_MINTED",
        transactionHash: id("mint-transaction"),
        operationHash: candidate.operationHash,
        owner: candidate.owner,
        personalAccount: candidate.personalAccount,
        destination: candidate.destination,
        asset: candidate.asset,
        amount: candidate.amount,
        executorFee: candidate.executorFee,
        nonce: candidate.nonce,
      }),
    });
    expect(minted).toMatchObject({ state: "DIRECT_MINTED", mintTransactionHash: id("mint-transaction") });
    expect(() => assertFundingJobIntegrity(minted)).not.toThrow();
    await expect(executeDirectMint(ready, proof(), {
      executeDirectMint: async (candidate) => ({
        status: "DIRECT_MINTED",
        transactionHash: id("mint-transaction"),
        operationHash: candidate.operationHash,
        owner: candidate.owner,
        personalAccount: candidate.personalAccount,
        destination: candidate.destination,
        asset: "0x00000000000000000000000000000000000000a4",
        amount: candidate.amount,
        executorFee: candidate.executorFee,
        nonce: candidate.nonce,
      }),
    })).rejects.toThrow(/receipt drift/);
    await expect(executeDirectMint(ready, proof(), {
      executeDirectMint: async (candidate) => ({
        status: "DIRECT_MINTED",
        transactionHash: zeroHash,
        operationHash: candidate.operationHash,
        owner: candidate.owner,
        personalAccount: candidate.personalAccount,
        destination: candidate.destination,
        asset: candidate.asset,
        amount: candidate.amount,
        executorFee: candidate.executorFee,
        nonce: candidate.nonce,
      }),
    })).rejects.toThrow(/receipt drift/);
    expect(() => resumeDelayed({ ...delayed, destination: "0x00000000000000000000000000000000000000a4" }, 30n)).toThrow(/drift/);
    expect(() => resumeDelayed({ ...delayed, executionAllowedAt: 29n }, 30n)).toThrow(/drift/);
  });
});
