import type { Hex } from "@xrp-payguard/protocol";

const MAX_UINT256 = (1n << 256n) - 1n;

export interface FtsoSnapshotV1 {
  feedId: Hex;
  value: bigint;
  decimals: number;
  timestamp: bigint;
  checkpoint: Hex;
}

export type FtsoFailure = "FEED_MISMATCH" | "VALUE_INVALID" | "STALE" | "FUTURE" | "CHECKPOINT_MISSING" | "OVERFLOW";
export type FtsoValidation = { ok: true } | { ok: false; reason: FtsoFailure };

export function validateFtsoSnapshot(snapshot: FtsoSnapshotV1, feedId: Hex, now: bigint, maxAgeSeconds: bigint): FtsoValidation {
  if (snapshot.feedId.toLowerCase() !== feedId.toLowerCase()) return { ok: false, reason: "FEED_MISMATCH" };
  if (snapshot.value <= 0n || snapshot.decimals < 0 || snapshot.decimals > 36) return { ok: false, reason: "VALUE_INVALID" };
  if (snapshot.timestamp > now) return { ok: false, reason: "FUTURE" };
  if (now - snapshot.timestamp > maxAgeSeconds) return { ok: false, reason: "STALE" };
  if (!/^0x[0-9a-fA-F]{64}$/.test(snapshot.checkpoint) || BigInt(snapshot.checkpoint) === 0n) return { ok: false, reason: "CHECKPOINT_MISSING" };
  return { ok: true };
}

/** Converts a public asset amount to reference units with deterministic ceil rounding. */
export function referenceValueCeil(amount: bigint, snapshot: FtsoSnapshotV1): bigint {
  if (amount < 0n || snapshot.value <= 0n || snapshot.decimals < 0 || snapshot.decimals > 36) throw new Error("FTSO input invalid");
  const scale = 10n ** BigInt(snapshot.decimals);
  if (amount !== 0n && snapshot.value > MAX_UINT256 / amount) throw new Error("FTSO conversion overflow");
  const product = amount * snapshot.value;
  const rounded = (product + scale - 1n) / scale;
  if (rounded > MAX_UINT256) throw new Error("FTSO conversion overflow");
  return rounded;
}
