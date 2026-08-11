import type { Address, Hex } from "viem";

export const LIVE_FCC_MODE = "LIVE_SIMULATED_TEE_C2" as const;

export interface LiveMachineConfig {
  index: 1 | 2 | 3;
  teeId: Address;
  proxyId: Address;
  origin: string;
  machineId: Hex;
  keyFingerprint: Hex;
  signer: Address;
  publicKey: { x: Hex; y: Hex };
  codeHash: Hex;
  platform: Hex;
  status: 2;
}

export interface LiveFccConfig {
  schemaVersion: 1;
  mode: typeof LIVE_FCC_MODE;
  status: "ready";
  chainId: 114;
  extensionId: Hex;
  deploymentBlock: string;
  operator: Address;
  registryVersion: "V2";
  deploymentProfile: "COSTON2_SIMULATED_V2";
  fallback: {
    strategy: "RAILWAY_ROLLBACK_TO_V1";
    registry: Address;
    vault: Address;
    router: Address;
  };
  contracts: {
    registry: Address;
    vault: Address;
    router: Address;
    dispatcher: Address;
    manager: Address;
    asset: Address;
  };
  machines: [LiveMachineConfig, LiveMachineConfig, LiveMachineConfig];
  assertions: {
    registeredMachinesVerified: true;
    stableHttpsOriginsVerified: true;
    authenticatedPrivateIngressVerified: true;
    simulatedTee: true;
    hardwareTeeVerified: false;
    v2LiveCandidateVerified: true;
    v2ReleaseVerified: false;
    verifiedPayGuardRelease: false;
  };
}

export interface LiveEvaluationResponse {
  schemaVersion: 1;
  mode: typeof LIVE_FCC_MODE;
  status: "threshold-submitted" | "already-finalized";
  requestId: Hex;
  routerStatus: 2 | 3 | 4;
  decision: "ALLOW" | "DENY";
  publicReasonClass: string;
  instructionId?: Hex;
  transactions: {
    dispatch?: Hex;
    submit: Hex[];
  };
  assertions: {
    requestReadFromCoston2: true;
    clientDecisionAccepted: false;
    threeRegisteredMachinesChecked: boolean;
    outerSignaturesVerified: boolean;
    innerSignaturesVerified: boolean;
    twoMatchingResultsSubmitted: boolean;
    simulatedTee: true;
    hardwareTeeVerified: false;
    verifiedPayGuardRelease: false;
  };
}

export interface LiveRelayRuntime {
  config(): Promise<LiveFccConfig>;
  ingress(machineIndex: 1 | 2 | 3, value: unknown): Promise<unknown>;
  evaluate(requestId: Hex, authorization: LiveEvaluationAuthorization): Promise<LiveEvaluationResponse>;
}

export interface LiveEvaluationAuthorization {
  owner: Address;
  issuedAt: bigint;
  expiry: bigint;
  signature: Hex;
}
