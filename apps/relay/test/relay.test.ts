import { describe, expect, it } from "vitest";
import { getAddress, keccak256, padHex, stringToHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  ACTION_FTESTXRP_TRANSFER,
  evaluationAttestationDigest,
  evaluationDigest,
  type ActionRequestV1,
  type EvaluationResultV1,
  type SpendStateV1,
} from "@xrp-payguard/protocol";
import { Relay, RelayCapacityError } from "../src/relay.js";
import type { EvaluationEnvelope, MachineDescriptor, MachineTransport } from "../src/types.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const owner = getAddress("0x00000000000000000000000000000000000000a1");
const vault = getAddress("0x00000000000000000000000000000000000000b2");
const router = getAddress("0x00000000000000000000000000000000000000c3");
const request: ActionRequestV1 = {
  chainId: 114n, registry: owner, vault, router, policyId: id("policy"), policyVersion: 1,
  policyCommitment: id("commitment"), requestId: id("request"), requestNonce: 1n, attempt: 0,
  requester: owner, target: router, asset: vault, actionType: ACTION_FTESTXRP_TRANSFER, amount: 75n,
  scheduleSlot: 1_000n, occurrence: 1, spendCheckpoint: id("spend"), balanceCheckpoint: id("balance"),
  inputCommitment: id("input"), createdAt: 1_001n, graceDeadline: 1_100n, expiry: 1_200n,
};
const state: SpendStateV1 = {
  availableBalance: 100n, history: [], occurrenceCount: 1, lastAccountingAt: 0n,
  spendCheckpoint: request.spendCheckpoint, balanceCheckpoint: request.balanceCheckpoint, now: 1_050n,
};

type MachineFixture = { descriptor: MachineDescriptor; account: ReturnType<typeof privateKeyToAccount> };
const machine = (name: string): MachineFixture => {
  const account = privateKeyToAccount(generatePrivateKey());
  return { account, descriptor: { machineId: id(name), keyFingerprint: id(`${name}-key`), signer: account.address, endpoint: `http://127.0.0.1/${name}` } };
};
const fixtureSet = (): [MachineFixture, MachineFixture, MachineFixture] => [machine("machine-a"), machine("machine-b"), machine("machine-c")];

const resultFor = (machine: MachineDescriptor, patch: Partial<Pick<EvaluationResultV1, "decision" | "publicReasonClass" | "reservedAmount" | "resultingCheckpoint">> = {}): EvaluationResultV1 => ({
  request,
  decision: "ALLOW",
  publicReasonClass: "OK",
  reservedAmount: request.amount,
  resultingCheckpoint: id("next"),
  resultNonce: request.requestId,
  attempt: request.attempt,
  issuedAt: 1_050n,
  expiry: request.expiry,
  machineId: machine.machineId,
  keyFingerprint: machine.keyFingerprint,
  ...patch,
});

async function envelope(machine: MachineFixture, result = resultFor(machine.descriptor)): Promise<EvaluationEnvelope> {
  const digest = evaluationDigest(result);
  const attestationDigest = evaluationAttestationDigest(result);
  return { result, digest, signer: machine.account.address, signature: await machine.account.signMessage({ message: { raw: attestationDigest } }) };
}

class StaticTransport implements MachineTransport {
  constructor(private readonly responses: Map<string, EvaluationEnvelope | Error>) {}

  async evaluate(machine: MachineDescriptor): Promise<EvaluationEnvelope> {
    const response = this.responses.get(machine.machineId.toLowerCase());
    if (!response) throw new Error("missing fixture");
    if (response instanceof Error) throw response;
    return response;
  }
}

describe("stateless relay threshold orchestration", () => {
  it("accepts two matching registered signatures and submits only signed envelopes", async () => {
    const machines = fixtureSet();
    const responses = new Map<string, EvaluationEnvelope>();
    responses.set(machines[0].descriptor.machineId.toLowerCase(), await envelope(machines[0]));
    responses.set(machines[1].descriptor.machineId.toLowerCase(), await envelope(machines[1]));
    responses.set(machines[2].descriptor.machineId.toLowerCase(), await envelope(machines[2], resultFor(machines[2].descriptor, { resultingCheckpoint: id("different") })));
    const relay = new Relay({ transport: new StaticTransport(responses), now: () => 1_050n });
    const outcome = await relay.evaluate(request, state, machines.map(({ descriptor }) => descriptor));
    expect(outcome.status).toBe("THRESHOLD_READY");
    expect(outcome.matching).toHaveLength(2);
    expect(outcome.digest).toBe(evaluationDigest(outcome.matching[0]!.result));
    const submitted: EvaluationEnvelope[] = [];
    expect(await relay.submitThreshold(outcome, { submitEvaluation: async (value) => { submitted.push(value); } })).toBe(2);
    expect(submitted.every((value) => value.signature.startsWith("0x"))).toBe(true);
  });

  it("tolerates one outage but fails closed with two outages", async () => {
    const machines = fixtureSet();
    const responses = new Map<string, EvaluationEnvelope | Error>();
    responses.set(machines[0].descriptor.machineId.toLowerCase(), await envelope(machines[0]));
    responses.set(machines[1].descriptor.machineId.toLowerCase(), await envelope(machines[1]));
    responses.set(machines[2].descriptor.machineId.toLowerCase(), new Error("offline"));
    const relay = new Relay({ transport: new StaticTransport(responses), now: () => 1_050n });
    expect((await relay.evaluate(request, state, machines.map(({ descriptor }) => descriptor))).status).toBe("THRESHOLD_READY");
    responses.set(machines[1].descriptor.machineId.toLowerCase(), new Error("offline"));
    const unavailable = await relay.evaluate(request, state, machines.map(({ descriptor }) => descriptor));
    expect(unavailable.status).toBe("UNAVAILABLE");
    expect(unavailable.matching).toHaveLength(0);
  });

  it("rejects split, tampered, duplicate-machine, and private-field paths", async () => {
    const machines = fixtureSet();
    const responses = new Map<string, EvaluationEnvelope>();
    responses.set(machines[0].descriptor.machineId.toLowerCase(), await envelope(machines[0]));
    responses.set(machines[1].descriptor.machineId.toLowerCase(), await envelope(machines[1], resultFor(machines[1].descriptor, { decision: "DENY", publicReasonClass: "POLICY_DENIED", reservedAmount: 0n })));
    responses.set(machines[2].descriptor.machineId.toLowerCase(), await envelope(machines[2], resultFor(machines[2].descriptor, { resultingCheckpoint: id("third") })));
    const relay = new Relay({ transport: new StaticTransport(responses), now: () => 1_050n });
    const split = await relay.evaluate(request, state, machines.map(({ descriptor }) => descriptor));
    expect(split.status).toBe("SPLIT");
    const tampered = await envelope(machines[0]);
    tampered.digest = keccak256(stringToHex("tampered"));
    responses.set(machines[0].descriptor.machineId.toLowerCase(), tampered);
    const invalid = await relay.evaluate(request, state, machines.map(({ descriptor }) => descriptor));
    expect(invalid.failures).toBeGreaterThanOrEqual(1);
    const publicJson = JSON.stringify(invalid, (_, value) => typeof value === "bigint" ? value.toString() : value);
    expect(publicJson).not.toContain("privateSalt");
    expect(publicJson).not.toContain("ciphertext");
    await expect(new Relay({ transport: new StaticTransport(responses) }).evaluate(request, state, [machines[0].descriptor, machines[0].descriptor, machines[2].descriptor])).rejects.toThrow();
    const duplicateFingerprint = { ...machines[1].descriptor, keyFingerprint: machines[0].descriptor.keyFingerprint };
    await expect(relay.evaluate(request, state, [machines[0].descriptor, duplicateFingerprint, machines[2].descriptor])).rejects.toThrow(/distinct/);
    const duplicateSigner = { ...machines[1].descriptor, signer: machines[0].descriptor.signer };
    await expect(relay.evaluate(request, state, [machines[0].descriptor, duplicateSigner, machines[2].descriptor])).rejects.toThrow(/distinct/);
    const credentialEndpoint = new URL("https://example.com");
    credentialEndpoint.username = "test";
    credentialEndpoint.password = "placeholder";
    await expect(relay.evaluate(request, state, [machines[0].descriptor, { ...machines[1].descriptor, endpoint: credentialEndpoint.toString() }, machines[2].descriptor])).rejects.toThrow(/HTTPS/);
  });

  it("deduplicates competing evaluators and threshold submissions", async () => {
    const machines = fixtureSet();
    const responses = new Map<string, EvaluationEnvelope>();
    for (const item of machines) responses.set(item.descriptor.machineId.toLowerCase(), await envelope(item));
    let transportCalls = 0;
    const transport: MachineTransport = {
      async evaluate(machine) {
        transportCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        const response = responses.get(machine.machineId.toLowerCase());
        if (!response) throw new Error("missing fixture");
        return response;
      },
    };
    const relay = new Relay({ transport, now: () => 1_050n });
    const descriptors = machines.map(({ descriptor }) => descriptor);
    const [first, second] = await Promise.all([
      relay.evaluate(request, state, descriptors),
      relay.evaluate(request, state, descriptors),
    ]);
    expect(first.status).toBe("THRESHOLD_READY");
    expect(second.digest).toBe(first.digest);
    expect(transportCalls).toBe(3);

    let submissions = 0;
    const submitter = {
      async submitEvaluation() {
        submissions += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    };
    expect(await Promise.all([
      relay.submitThreshold(first, submitter),
      relay.submitThreshold(first, submitter),
    ])).toEqual([2, 2]);
    expect(submissions).toBe(2);
  });

  it("owns the timeout budget even when a transport does not settle", async () => {
    const machines = fixtureSet();
    const signals: AbortSignal[] = [];
    const transport: MachineTransport = {
      evaluate(_machine, _request, _state, signal) {
        signals.push(signal);
        return new Promise(() => {});
      },
    };
    const relay = new Relay({ transport, timeoutMs: 10, now: () => 1_050n });
    const startedAt = Date.now();
    const outcome = await relay.evaluate(request, state, machines.map(({ descriptor }) => descriptor));
    expect(outcome.status).toBe("UNAVAILABLE");
    expect(outcome.failures).toBe(3);
    expect(signals).toHaveLength(3);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(250);
  });

  it("fails closed when distinct work exceeds the concurrent evaluation budget", async () => {
    const machines = fixtureSet();
    const responses = new Map<string, EvaluationEnvelope>();
    for (const item of machines) responses.set(item.descriptor.machineId.toLowerCase(), await envelope(item));
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const transport: MachineTransport = {
      async evaluate(machine) {
        await gate;
        const response = responses.get(machine.machineId.toLowerCase());
        if (!response) throw new Error("missing fixture");
        return response;
      },
    };
    const relay = new Relay({ transport, maxConcurrentEvaluations: 1, now: () => 1_050n });
    const descriptors = machines.map(({ descriptor }) => descriptor);
    const first = relay.evaluate(request, state, descriptors);
    const competingRequest = { ...request, requestId: id("competing-request"), requestNonce: 2n };
    await expect(relay.evaluate(competingRequest, state, descriptors)).rejects.toBeInstanceOf(RelayCapacityError);
    release();
    expect((await first).status).toBe("THRESHOLD_READY");
  });
});
