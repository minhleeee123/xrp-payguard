import { getAddress, isAddress, zeroAddress, zeroHash, type Hex } from "viem";

const MAX_UINT32 = (1n << 32n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

export type VaultPublicState = "READY" | "EMERGENCY_STOPPED";

export type VaultUnavailableReason =
  | "RPC_UNCONFIGURED"
  | "RPC_UNAVAILABLE"
  | "SNAPSHOT_UNFINALIZED"
  | "SNAPSHOT_INVALID";

export interface PublicVaultSnapshotV1 {
  chainId: bigint;
  vault: string;
  asset: string;
  deposited: bigint;
  available: bigint;
  reserved: bigint;
  spent: bigint;
  withdrawn: bigint;
  refunded: bigint;
  checkpoint: Hex;
  emergencyStopped: boolean;
  policyCount: bigint;
}

export interface PublicVaultSnapshotWireV1 {
  chainId: string;
  vault: string;
  asset: string;
  deposited: string;
  available: string;
  reserved: string;
  spent: string;
  withdrawn: string;
  refunded: string;
  checkpoint: Hex;
  emergencyStopped: boolean;
  policyCount: string;
}

export interface VaultUnavailableState {
  status: "UNAVAILABLE";
  reason: VaultUnavailableReason;
  publicFacts: false;
}

export type VaultReadState =
  | { status: VaultPublicState; snapshot: PublicVaultSnapshotV1; publicFacts: true }
  | VaultUnavailableState;

const WIRE_FIELDS = new Set<keyof PublicVaultSnapshotWireV1>([
  "chainId", "vault", "asset", "deposited", "available", "reserved", "spent", "withdrawn", "refunded",
  "checkpoint", "emergencyStopped", "policyCount",
]);

export function decodePublicVaultSnapshot(value: unknown): PublicVaultSnapshotV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("vault snapshot must be an object");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!WIRE_FIELDS.has(key as keyof PublicVaultSnapshotWireV1)) throw new Error(`unknown public vault field: ${key}`);
  }
  const required: readonly (keyof PublicVaultSnapshotWireV1)[] = [
    "chainId", "vault", "asset", "deposited", "available", "reserved", "spent", "withdrawn", "refunded",
    "checkpoint", "emergencyStopped", "policyCount",
  ];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`missing public vault field: ${key}`);
  }

  const chainId = quotedUint(record.chainId, "chainId");
  if (chainId === 0n) throw new Error("chainId must be non-zero");
  const vault = publicAddress(record.vault, "vault");
  const asset = publicAddress(record.asset, "asset");
  const deposited = quotedUint(record.deposited, "deposited");
  const available = quotedUint(record.available, "available");
  const reserved = quotedUint(record.reserved, "reserved");
  const spent = quotedUint(record.spent, "spent");
  const withdrawn = quotedUint(record.withdrawn, "withdrawn");
  const refunded = quotedUint(record.refunded, "refunded");
  if (typeof record.checkpoint !== "string" || !HEX32.test(record.checkpoint) || record.checkpoint.toLowerCase() === zeroHash) {
    throw new Error("checkpoint must be a non-zero bytes32");
  }
  if (typeof record.emergencyStopped !== "boolean") throw new Error("emergencyStopped must be boolean");
  const policyCount = quotedUint(record.policyCount, "policyCount", MAX_UINT32);
  const accounted = [available, reserved, spent, withdrawn, refunded].reduce(checkedAdd, 0n);
  if (accounted !== deposited) throw new Error("vault conservation mismatch");

  return {
    chainId, vault, asset, deposited, available, reserved, spent, withdrawn, refunded,
    checkpoint: record.checkpoint.toLowerCase() as Hex,
    emergencyStopped: record.emergencyStopped,
    policyCount,
  };
}

export function encodePublicVaultSnapshot(snapshot: PublicVaultSnapshotV1): PublicVaultSnapshotWireV1 {
  const wire: PublicVaultSnapshotWireV1 = {
    chainId: snapshot.chainId.toString(),
    vault: snapshot.vault,
    asset: snapshot.asset,
    deposited: snapshot.deposited.toString(),
    available: snapshot.available.toString(),
    reserved: snapshot.reserved.toString(),
    spent: snapshot.spent.toString(),
    withdrawn: snapshot.withdrawn.toString(),
    refunded: snapshot.refunded.toString(),
    checkpoint: snapshot.checkpoint,
    emergencyStopped: snapshot.emergencyStopped,
    policyCount: snapshot.policyCount.toString(),
  };
  // Re-run the exact decoder so callers cannot serialize an invalid snapshot.
  decodePublicVaultSnapshot(wire);
  return wire;
}

export function vaultReadState(snapshot: PublicVaultSnapshotV1): VaultReadState {
  const canonical = decodePublicVaultSnapshot(encodePublicVaultSnapshot(snapshot));
  return { status: canonical.emergencyStopped ? "EMERGENCY_STOPPED" : "READY", snapshot: canonical, publicFacts: true };
}

export function unavailableVaultState(reason: VaultUnavailableReason = "RPC_UNCONFIGURED"): VaultUnavailableState {
  return { status: "UNAVAILABLE", reason, publicFacts: false };
}

function quotedUint(value: unknown, label: string, max: bigint = MAX_UINT256): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new Error(`${label} must be a quoted unsigned decimal`);
  const parsed = BigInt(value);
  if (parsed > max) throw new Error(`${label} exceeds supported range`);
  return parsed;
}

function publicAddress(value: unknown, label: string): string {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) throw new Error(`${label} must be a non-zero address`);
  return getAddress(value);
}

function checkedAdd(left: bigint, right: bigint): bigint {
  const result = left + right;
  if (result > MAX_UINT256) throw new Error("vault conservation sum overflow");
  return result;
}
