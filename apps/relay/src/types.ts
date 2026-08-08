import type {
  ActionRequestV1,
  EvaluationResultV1,
  Hex,
  SpendStateV1,
} from "@xrp-payguard/protocol";

export interface MachineDescriptor {
  machineId: Hex;
  keyFingerprint: Hex;
  signer: Hex;
  endpoint: string;
}

export interface EvaluationEnvelope {
  result: EvaluationResultV1;
  digest: Hex;
  signer: Hex;
  signature: Hex;
}

export interface MachineTransport {
  evaluate(
    machine: MachineDescriptor,
    request: ActionRequestV1,
    state: SpendStateV1,
    signal: AbortSignal,
  ): Promise<EvaluationEnvelope>;
}

export type RelayStatus = "THRESHOLD_READY" | "UNAVAILABLE" | "SPLIT";

export interface RelayOutcome {
  status: RelayStatus;
  requestId: Hex;
  digest?: Hex;
  matching: EvaluationEnvelope[];
  valid: EvaluationEnvelope[];
  failures: number;
}

export interface RouterSubmitter {
  submitEvaluation(envelope: EvaluationEnvelope): Promise<void>;
}
