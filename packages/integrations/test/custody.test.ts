import { describe, expect, it } from "vitest";
import { getAddress, padHex, stringToHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { POLICY_SCHEMA_V1, policyReceiptAttestationDigest, policyReceiptDigest, type PolicyBindingV1 } from "@xrp-payguard/protocol";
import {
  POLICY_CUSTODY_BUNDLE_V1,
  decodePublicPolicyCustodyBundle,
  encodePublicPolicyCustodyBundle,
  policyCustodyBundleHash,
  publicPolicyCustodyReadState,
  unavailablePolicyCustodyState,
  type PublicPolicyCustodyBundleV1,
  type PublicPolicyReceiptV1,
} from "../src/custody.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const owner = getAddress("0x00000000000000000000000000000000000000a1") as Hex;
const binding: PolicyBindingV1 = {
  chainId: 114n,
  registry: owner,
  vault: getAddress("0x00000000000000000000000000000000000000b2") as Hex,
  router: getAddress("0x00000000000000000000000000000000000000c3") as Hex,
  owner,
  policyId: id("policy"),
  policyVersion: 1,
  policyCommitment: id("commitment"),
  schema: POLICY_SCHEMA_V1,
  extensionId: id("extension"),
  codeVersion: id("code"),
  machineIds: [id("machine-a"), id("machine-b"), id("machine-c")],
  keyFingerprints: [id("key-a"), id("key-b"), id("key-c")],
  custodyThreshold: 3,
  resultThreshold: 2,
  policyNonce: 7n,
};

async function bundle(): Promise<PublicPolicyCustodyBundleV1> {
  const accounts = [
    privateKeyToAccount(generatePrivateKey()),
    privateKeyToAccount(generatePrivateKey()),
    privateKeyToAccount(generatePrivateKey()),
  ];
  const receipts = [] as PublicPolicyReceiptV1[];
  for (let index = 0; index < accounts.length; index += 1) {
    const body = {
      machineId: binding.machineIds[index]!, keyFingerprint: binding.keyFingerprints[index]!, submissionNonce: id("submission"),
      receiptNonce: 7n, issuedAt: 100n, expiry: 200n,
    };
    const protocolReceipt = { binding, ...body };
    const digest = policyReceiptDigest(protocolReceipt);
    const attestationDigest = policyReceiptAttestationDigest(protocolReceipt);
    receipts.push({ ...body, digest, signer: accounts[index]!.address as Hex, signature: await accounts[index]!.signMessage({ message: { raw: attestationDigest } }) });
  }
  const typedReceipts = receipts as [PublicPolicyReceiptV1, PublicPolicyReceiptV1, PublicPolicyReceiptV1];
  return { binding, receipts: typedReceipts, bundleHash: policyCustodyBundleHash({ binding, receipts: typedReceipts }) };
}

describe("three-machine public policy custody receipts", () => {
  it("verifies every receipt against the frozen binding and preserves wire digests", async () => {
    const value = await bundle();
    const wire = await encodePublicPolicyCustodyBundle(value);
    expect(await decodePublicPolicyCustodyBundle(wire)).toEqual(value);
    expect(await publicPolicyCustodyReadState(value)).toMatchObject({ status: "READY", publicFacts: true });
    expect(wire.binding.schema).toBe(POLICY_SCHEMA_V1);
    expect(wire.bundleHash).not.toBe(POLICY_CUSTODY_BUNDLE_V1);
    const upperCaseDigests = value.receipts.map((receipt) => ({ ...receipt, digest: `0x${receipt.digest.slice(2).toUpperCase()}` as Hex })) as [PublicPolicyReceiptV1, PublicPolicyReceiptV1, PublicPolicyReceiptV1];
    expect(policyCustodyBundleHash({ binding: value.binding, receipts: upperCaseDigests })).toBe(value.bundleHash);
    const publicJson = JSON.stringify(wire);
    expect(publicJson).not.toContain("policyPlaintext");
    expect(publicJson).not.toContain("ciphertext");
    expect(publicJson).not.toContain("privateSalt");
  });

  it("rejects private/unknown fields, frozen-order drift, nonce drift, and signature drift", async () => {
    const value = await bundle();
    const wire = await encodePublicPolicyCustodyBundle(value);
    await expect(decodePublicPolicyCustodyBundle({ ...wire, policyPlaintext: "private" })).rejects.toThrow(/unknown public policy custody bundle field/);
    await expect(decodePublicPolicyCustodyBundle({ ...wire, receipts: [wire.receipts[1], wire.receipts[0], wire.receipts[2]] })).rejects.toThrow(/frozen machine order/);
    await expect(decodePublicPolicyCustodyBundle({ ...wire, receipts: wire.receipts.map((receipt, index) => index === 2 ? { ...receipt, submissionNonce: id("other") } : receipt) })).rejects.toThrow(/digest mismatch/);
    await expect(decodePublicPolicyCustodyBundle({ ...wire, receipts: wire.receipts.map((receipt, index) => index === 1 ? { ...receipt, signature: wire.receipts[0]!.signature } : receipt) })).rejects.toThrow(/signature/);
  });

  it("does not create a local activation claim when custody is unavailable", () => {
    expect(unavailablePolicyCustodyState()).toEqual({ status: "UNAVAILABLE", reason: "RPC_UNCONFIGURED", publicFacts: false });
    expect(unavailablePolicyCustodyState("CUSTODY_INVALID").publicFacts).toBe(false);
  });
});
