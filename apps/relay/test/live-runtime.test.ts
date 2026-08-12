import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { PolicyBindingV1 } from "@xrp-payguard/protocol";
import type { LiveEvaluationResponse } from "../src/live-types.js";
import { Coston2LiveRelayRuntime, authorizeEvaluation, liveEvaluationAuthorizationDigest, parseExecutedRequestIds } from "../src/live-runtime.js";

const hash = (byte: string) => `0x${byte.repeat(64 / byte.length)}` as Hex;
const address = (byte: string) => `0x${byte.repeat(40 / byte.length)}` as Address;

describe("live FCC relay authorization domain", () => {
  it("matches the browser request-specific authorization fixture", () => {
    expect(liveEvaluationAuthorizationDigest({
      requestId: hash("11"),
      owner: address("22"),
      issuedAt: 100n,
      expiry: 200n,
    })).toBe("0x62eccde019645aa462f1b237ddd1a59a7cf856fe36721fa0728fd8004160033d");
  });

  it("accepts the exact policy owner and rejects the relay executor or another wallet", async () => {
    const owner = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const executor = privateKeyToAccount(`0x${"22".repeat(32)}`);
    const requestId = hash("33");
    const issuedAt = 100n;
    const expiry = 200n;
    const digest = liveEvaluationAuthorizationDigest({ requestId, owner: owner.address, issuedAt, expiry });
    const signature = await owner.signMessage({ message: { raw: digest } });
    const executorSignature = await executor.signMessage({ message: { raw: digest } });
    const binding = { owner: owner.address } as PolicyBindingV1;
    await expect(authorizeEvaluation(requestId, binding, { owner: owner.address, issuedAt, expiry, signature }, 150n)).resolves.toBeUndefined();
    await expect(authorizeEvaluation(requestId, binding, { owner: executor.address, issuedAt, expiry, signature }, 150n)).rejects.toThrow(/policy-owner domain/);
    await expect(authorizeEvaluation(requestId, binding, { owner: owner.address, issuedAt, expiry, signature: executorSignature }, 150n)).rejects.toThrow(/signer is invalid/);
  });

  it("coalesces differently signed retries by request ID and releases failed work", async () => {
    const runtime = new Coston2LiveRelayRuntime({
      rpcUrl: "https://rpc.example.test",
      executorPrivateKey: `0x${"44".repeat(32)}`,
    });
    const response = { requestId: hash("55") } as LiveEvaluationResponse;
    const evaluateOnce = vi.fn().mockRejectedValueOnce(new Error("transient")).mockResolvedValue(response);
    Object.defineProperty(runtime, "evaluateOnce", { value: evaluateOnce });
    const now = BigInt(Math.floor(Date.now() / 1_000));
    const authorization = (signatureByte: string) => ({
      owner: address("66"), issuedAt: now, expiry: now + 60n,
      signature: `0x${signatureByte.repeat(130)}` as Hex,
    });
    await expect(runtime.evaluate(hash("55"), authorization("1"))).rejects.toThrow("transient");
    const first = runtime.evaluate(hash("55"), authorization("2"));
    const coalesced = runtime.evaluate(hash("55"), authorization("3"));
    expect(coalesced).toBe(first);
    await expect(first).resolves.toBe(response);
    expect(evaluateOnce).toHaveBeenCalledTimes(2);
  });
});

describe("executed history discovery", () => {
  const topic0 = "0x4d3c486e056cfb79101ca2f7e2e656f03944aae15d67bc0c48d8904b502df6d3";
  const router = "0x452988f04bE9602EC0CEB0239EBA5Fe60d8988D3";
  const item = {
    address: router,
    blockNumber: "0x20582f9",
    transactionHash: hash("33"),
    topics: [topic0, hash("44"), `0x${"00".repeat(12)}${"55".repeat(20)}`],
  };

  it("accepts explorer discovery only for the exact router event domain", () => {
    expect(parseExecutedRequestIds({ status: "1", message: "OK", result: [item] })).toEqual([hash("44")]);
  });

  it("fails closed on duplicate or foreign log discovery", () => {
    expect(() => parseExecutedRequestIds({ status: "1", message: "OK", result: [item, item] })).toThrow(/duplicate/);
    expect(() => parseExecutedRequestIds({ status: "1", message: "OK", result: [{ ...item, address: address("66") }] })).toThrow(/router domain/);
  });
});
