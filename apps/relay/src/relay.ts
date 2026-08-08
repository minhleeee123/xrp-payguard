import {
  actionRequestHash,
  evaluationDigest,
  type ActionRequestV1,
  type Hex,
  type SpendStateV1,
} from "@xrp-payguard/protocol";
import { getAddress, isAddress, recoverAddress } from "viem";
import type {
  EvaluationEnvelope,
  MachineDescriptor,
  MachineTransport,
  RelayOutcome,
  RouterSubmitter,
} from "./types.js";

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DEFAULT_TIMEOUT_MS = 8_000;

export interface RelayOptions {
  transport: MachineTransport;
  timeoutMs?: number;
  now?: () => bigint;
}

export class Relay {
  private readonly transport: MachineTransport;
  private readonly timeoutMs: number;
  private readonly now: () => bigint;

  constructor(options: RelayOptions) {
    if (!Number.isInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) || (options.timeoutMs ?? DEFAULT_TIMEOUT_MS) <= 0) {
      throw new Error("timeout must be a positive integer");
    }
    this.transport = options.transport;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? (() => BigInt(Math.floor(Date.now() / 1000)));
  }

  async evaluate(request: ActionRequestV1, state: SpendStateV1, machines: readonly MachineDescriptor[]): Promise<RelayOutcome> {
    const descriptors = validateMachines(machines);
    const settled = await Promise.allSettled(descriptors.map((machine) => this.callMachine(machine, request, state)));
    const valid: EvaluationEnvelope[] = [];
    const validMachines = new Set<string>();
    let failures = 0;
    for (const result of settled) {
      if (result.status === "rejected") {
        failures += 1;
        continue;
      }
      if (!(await isValidEnvelope(result.value, request, descriptors, this.now()))) {
        failures += 1;
        continue;
      }
      const machineId = result.value.result.machineId.toLowerCase();
      if (validMachines.has(machineId)) {
        failures += 1;
        continue;
      }
      validMachines.add(machineId);
      valid.push(result.value);
    }

    const groups = new Map<Hex, EvaluationEnvelope[]>();
    for (const envelope of valid) {
      const key = envelope.digest.toLowerCase() as Hex;
      const group = groups.get(key) ?? [];
      group.push(envelope);
      groups.set(key, group);
    }
    for (const [digest, group] of groups) {
      if (group.length >= 2) {
        return { status: "THRESHOLD_READY", requestId: request.requestId, digest, matching: group, valid, failures };
      }
    }
    return {
      status: valid.length < 2 ? "UNAVAILABLE" : "SPLIT",
      requestId: request.requestId,
      matching: [],
      valid,
      failures,
    };
  }

  async submitThreshold(outcome: RelayOutcome, submitter: RouterSubmitter): Promise<number> {
    if (outcome.status !== "THRESHOLD_READY" || outcome.matching.length < 2) {
      throw new Error("evaluation threshold is not ready");
    }
    const threshold = outcome.matching.slice(0, 2);
    for (const envelope of threshold) await submitter.submitEvaluation(envelope);
    return threshold.length;
  }

  private async callMachine(machine: MachineDescriptor, request: ActionRequestV1, state: SpendStateV1): Promise<EvaluationEnvelope> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.transport.evaluate(machine, request, state, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }
}

function validateMachines(machines: readonly MachineDescriptor[]): MachineDescriptor[] {
  if (machines.length !== 3) throw new Error("exactly three frozen machines are required");
  const ids = new Set<string>();
  return machines.map((machine) => {
    if (!HEX32.test(machine.machineId) || !HEX32.test(machine.keyFingerprint) || !isAddress(machine.signer)) {
      throw new Error("machine metadata is malformed");
    }
    const id = machine.machineId.toLowerCase();
    if (ids.has(id)) throw new Error("machine identities must be distinct");
    ids.add(id);
    const endpoint = new URL(machine.endpoint);
    if (endpoint.protocol !== "https:" && !isLocalEndpoint(endpoint)) {
      throw new Error("machine endpoints must use HTTPS");
    }
    return { ...machine, signer: getAddress(machine.signer) };
  });
}

function isLocalEndpoint(endpoint: URL): boolean {
  return endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname);
}

async function isValidEnvelope(
  envelope: EvaluationEnvelope,
  request: ActionRequestV1,
  machines: readonly MachineDescriptor[],
  now: bigint,
): Promise<boolean> {
  try {
    if (!envelope || !envelope.result || !HEX32.test(envelope.digest) || !HEX32.test(envelope.result.machineId)
      || !HEX32.test(envelope.result.keyFingerprint) || !isAddress(envelope.signer) || !/^0x[0-9a-fA-F]+$/.test(envelope.signature)) {
      return false;
    }
    if (envelope.result.request.requestId !== request.requestId || actionRequestHash(envelope.result.request) !== actionRequestHash(request)) return false;
    if (evaluationDigest(envelope.result).toLowerCase() !== envelope.digest.toLowerCase()) return false;
    if (envelope.result.issuedAt > now || envelope.result.expiry < now || envelope.result.expiry !== request.expiry) return false;
    const machine = machines.find((candidate) => candidate.machineId.toLowerCase() === envelope.result.machineId.toLowerCase());
    if (!machine || machine.keyFingerprint.toLowerCase() !== envelope.result.keyFingerprint.toLowerCase()) return false;
    if (getAddress(envelope.signer) !== getAddress(machine.signer)) return false;
    return getAddress(await recoverAddress({ hash: envelope.digest, signature: envelope.signature })) === getAddress(machine.signer);
  } catch {
    return false;
  }
}
