import { describe, expect, it } from "vitest";
import {
  getAddress,
  keccak256,
  recoverMessageAddress,
  stringToHex,
  toHex,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  ACTION_FTESTXRP_TRANSFER,
  NO_FDC_DESCRIPTOR_V1,
  POLICY_SCHEMA_V1,
  ZERO_BYTES32,
  encryptPrivatePolicyForTeeV1,
  evaluationAttestationDigest,
  genesisSpendCheckpoint,
  policyIngressAuthorizationDigest,
  policyInputCommitmentV1,
  policyReceiptAttestationDigest,
  type ActionRequestV1,
  type PolicyV1,
} from "@xrp-payguard/protocol";
import {
  INTERACTIVE_DEMO_CODE_VERSION,
  INTERACTIVE_DEMO_EXTENSION_ID,
  INTERACTIVE_DEMO_MODE,
  demoBalanceCheckpointV1,
  demoPolicyBindingV1,
  parseDemoActorRequest,
  parseDemoConfig,
  stringifyDemoWire,
  type DemoAccounting,
  type DemoDomainConfig,
} from "../src/index.js";
import {
  createDemoActorDescriptor,
  processDemoActorRequest,
  type DemoCanonicalEvaluationState,
} from "../src/server.js";

const now = 1_800_000_000n;
const addresses = {
  registry: getAddress("0x0000000000000000000000000000000000000011"),
  vault: getAddress("0x0000000000000000000000000000000000000012"),
  router: getAddress("0x0000000000000000000000000000000000000013"),
  asset: getAddress("0x0000000000000000000000000000000000000014"),
  target: getAddress("0x0000000000000000000000000000000000000015"),
} as const;

function assertions() {
  return {
    hardwareTeeVerified: false,
    registeredProductionMachinesVerified: false,
    independentOperatorsVerified: false,
    sealedPersistenceVerified: false,
    productionFccReleaseVerified: false,
  } as const;
}

function fixture() {
  const actorKeys = [generatePrivateKey(), generatePrivateKey(), generatePrivateKey()] as [Hex, Hex, Hex];
  const actors: DemoDomainConfig["actors"] = [
    createDemoActorDescriptor(1, actorKeys[0], "https://demo.example.test/api/demo/machine-1"),
    createDemoActorDescriptor(2, actorKeys[1], "https://demo.example.test/api/demo/machine-2"),
    createDemoActorDescriptor(3, actorKeys[2], "https://demo.example.test/api/demo/machine-3"),
  ];
  const config: DemoDomainConfig = {
    mode: INTERACTIVE_DEMO_MODE,
    chainId: 114,
    ...addresses,
    deploymentBlock: 10n,
    extensionId: INTERACTIVE_DEMO_EXTENSION_ID,
    codeVersion: INTERACTIVE_DEMO_CODE_VERSION,
    actors,
    assertions: assertions(),
  };
  const owner = privateKeyToAccount(generatePrivateKey());
  const policy: PolicyV1 = {
    schemaVersion: 1,
    chainId: 114n,
    registry: addresses.registry,
    vault: addresses.vault,
    router: addresses.router,
    owner: owner.address,
    policyId: keccak256(stringToHex("interactive-demo-policy")),
    policyVersion: 1,
    asset: addresses.asset,
    referenceCurrency: toHex(new TextEncoder().encode("XRP"), { size: 32 }),
    maxPerAction: 100n,
    dailyCap: 200n,
    rollingCap: 200n,
    rollingWindowSeconds: 86_400n,
    startAt: now - 60n,
    endAt: now + 86_400n,
    scheduleIntervalSeconds: 0n,
    scheduleGraceSeconds: 0n,
    cooldownSeconds: 0n,
    maxOccurrences: 10,
    allowTargets: [addresses.target],
    denyTargets: [],
    allowRequesters: [owner.address],
    allowActionTypes: [ACTION_FTESTXRP_TRANSFER],
    requireFtso: false,
    ftsoFeedId: ZERO_BYTES32,
    maxPriceAgeSeconds: 0n,
    ...NO_FDC_DESCRIPTOR_V1,
    privateSalt: generatePrivateKey(),
    submissionNonce: generatePrivateKey(),
  };
  return { actorKeys, config, owner, policy };
}

async function actorRequest(f: ReturnType<typeof fixture>, actor: 1 | 2 | 3, operation: "CUSTODY" | "EVALUATE", requestId?: Hex) {
  const descriptor = f.config.actors[actor - 1];
  if (!descriptor) throw new Error("actor fixture missing");
  const ciphertext = await encryptPrivatePolicyForTeeV1(f.policy, descriptor.publicKey);
  const binding = demoPolicyBindingV1(f.policy, f.config);
  const issuedAt = now - 10n;
  const expiry = now + 600n;
  const digest = policyIngressAuthorizationDigest({
    binding,
    submissionNonce: f.policy.submissionNonce,
    issuedAt,
    expiry,
    ciphertextHash: keccak256(ciphertext),
    machineId: descriptor.machineId,
    keyFingerprint: descriptor.keyFingerprint,
  });
  const signature = await f.owner.signMessage({ message: { raw: digest } });
  return {
    operation,
    ciphertext,
    authorization: { issuedAt: issuedAt.toString(), expiry: expiry.toString(), signature },
    ...(requestId ? { requestId, policyRegistrationBlock: "10" } : {}),
  };
}

function canonicalState(f: ReturnType<typeof fixture>): DemoCanonicalEvaluationState {
  const binding = demoPolicyBindingV1(f.policy, f.config);
  const accounting: DemoAccounting = { deposited: 1_000n, available: 1_000n, reserved: 0n, spent: 0n, withdrawn: 0n, refunded: 0n };
  const request: ActionRequestV1 = {
    chainId: 114n,
    registry: addresses.registry,
    vault: addresses.vault,
    router: addresses.router,
    policyId: f.policy.policyId,
    policyVersion: 1,
    policyCommitment: binding.policyCommitment,
    requestId: keccak256(stringToHex("interactive-demo-request")),
    requestNonce: 1n,
    attempt: 1,
    requester: f.owner.address,
    target: addresses.target,
    asset: addresses.asset,
    actionType: ACTION_FTESTXRP_TRANSFER,
    amount: 50n,
    scheduleSlot: 0n,
    occurrence: 1,
    spendCheckpoint: genesisSpendCheckpoint(binding.policyCommitment),
    balanceCheckpoint: demoBalanceCheckpointV1(f.owner.address, addresses.asset, accounting),
    inputCommitment: policyInputCommitmentV1(undefined, undefined),
    createdAt: now - 1n,
    graceDeadline: now + 300n,
    expiry: now + 300n,
  };
  return {
    binding,
    policyStatus: 1,
    request,
    accounting,
    history: [],
    occurrenceCount: 0,
    lastAccountingAt: 0n,
    spendCheckpoint: request.spendCheckpoint,
    finalizedAt: now,
  };
}

describe("interactive demo wire", () => {
  it("round-trips only the public config and preserves every production non-claim", () => {
    const f = fixture();
    const parsed = parseDemoConfig(JSON.parse(stringifyDemoWire(f.config)));
    expect(parsed.actors).toHaveLength(3);
    expect(parsed.assertions.hardwareTeeVerified).toBe(false);
    expect(parsed.assertions.productionFccReleaseVerified).toBe(false);
  });

  it("rejects a client-supplied decision field", async () => {
    const f = fixture();
    const request = await actorRequest(f, 1, "CUSTODY");
    expect(() => parseDemoActorRequest({ ...request, decision: "ALLOW" })).toThrow(/unknown field/);
  });

  it("requires and normalizes an on-chain registration-block hint for evaluation", async () => {
    const f = fixture();
    const state = canonicalState(f);
    const request = await actorRequest(f, 1, "EVALUATE", state.request.requestId);
    const { policyRegistrationBlock: _block, ...missing } = request;
    expect(() => parseDemoActorRequest(missing)).toThrow(/policyRegistrationBlock/);
    expect(parseDemoActorRequest(request).policyRegistrationBlock).toBe(10n);
  });
});

describe("interactive demo actor", () => {
  it("decrypts independently and returns an owner-authorized signed custody receipt", async () => {
    const f = fixture();
    const request = await actorRequest(f, 1, "CUSTODY");
    const envelope = await processDemoActorRequest({ actor: 1, privateKey: f.actorKeys[0], config: f.config, request, now: () => now });
    if (!("receipt" in envelope)) throw new Error("expected custody envelope");
    expect(envelope.receipt.binding.schema).toBe(POLICY_SCHEMA_V1);
    expect(await recoverMessageAddress({ message: { raw: policyReceiptAttestationDigest(envelope.receipt) }, signature: envelope.signature })).toBe(f.config.actors[0].signer);
  });

  it("reconstructs canonical state, computes ALLOW itself, and signs the result", async () => {
    const f = fixture();
    const state = canonicalState(f);
    const request = await actorRequest(f, 2, "EVALUATE", state.request.requestId);
    const envelope = await processDemoActorRequest({
      actor: 2,
      privateKey: f.actorKeys[1],
      config: f.config,
      request,
      stateReader: { load: async () => state },
      now: () => now,
    });
    if (!("result" in envelope)) throw new Error("expected evaluation envelope");
    expect(envelope.result.decision).toBe("ALLOW");
    expect(envelope.result.machineId).toBe(f.config.actors[1].machineId);
    expect(await recoverMessageAddress({ message: { raw: evaluationAttestationDigest(envelope.result) }, signature: envelope.signature })).toBe(f.config.actors[1].signer);
  });

  it("produces one matching digest when actors observe different finalized blocks", async () => {
    const f = fixture();
    const firstState = canonicalState(f);
    const secondState = { ...firstState, finalizedAt: firstState.finalizedAt + 5n };
    const firstRequest = await actorRequest(f, 1, "EVALUATE", firstState.request.requestId);
    const secondRequest = await actorRequest(f, 2, "EVALUATE", secondState.request.requestId);
    const first = await processDemoActorRequest({
      actor: 1,
      privateKey: f.actorKeys[0],
      config: f.config,
      request: firstRequest,
      stateReader: { load: async () => firstState },
      now: () => now,
    });
    const second = await processDemoActorRequest({
      actor: 2,
      privateKey: f.actorKeys[1],
      config: f.config,
      request: secondRequest,
      stateReader: { load: async () => secondState },
      now: () => now,
    });
    if (!("result" in first) || !("result" in second)) throw new Error("expected evaluation envelopes");
    expect(first.digest).toBe(second.digest);
    expect(first.result.issuedAt).toBe(firstState.request.createdAt);
    expect(second.result.issuedAt).toBe(secondState.request.createdAt);
    expect(first.result.machineId).not.toBe(second.result.machineId);
  });

  it("fails closed for tampered ciphertext, wrong actor key, and stale public accounting", async () => {
    const f = fixture();
    const custody = await actorRequest(f, 1, "CUSTODY");
    const last = custody.ciphertext.endsWith("00") ? "01" : "00";
    await expect(processDemoActorRequest({ actor: 1, privateKey: f.actorKeys[0], config: f.config, request: { ...custody, ciphertext: `${custody.ciphertext.slice(0, -2)}${last}` }, now: () => now })).rejects.toThrow(/authentication/);
    await expect(processDemoActorRequest({ actor: 1, privateKey: f.actorKeys[1], config: f.config, request: custody, now: () => now })).rejects.toThrow(/descriptor/);

    const state = canonicalState(f);
    const evaluation = await actorRequest(f, 1, "EVALUATE", state.request.requestId);
    const drifted = { ...state, accounting: { ...state.accounting, available: state.accounting.available - 1n } };
    await expect(processDemoActorRequest({ actor: 1, privateKey: f.actorKeys[0], config: f.config, request: evaluation, stateReader: { load: async () => drifted }, now: () => now })).rejects.toThrow(/balance checkpoint/);
  });
});
