import { describe, expect, it } from "vitest";
import { zeroHash, type Hex } from "viem";
import {
  decodePublicVaultSnapshot,
  encodePublicVaultSnapshot,
  unavailableVaultState,
  vaultReadState,
  type PublicVaultSnapshotV1,
} from "../src/vault.js";

const baseWire = {
  chainId: "114",
  vault: "0x0000000000000000000000000000000000000012",
  asset: "0x0000000000000000000000000000000000000014",
  deposited: "1000",
  available: "700",
  reserved: "100",
  spent: "150",
  withdrawn: "25",
  refunded: "25",
  checkpoint: `0x${"12".repeat(32)}` as Hex,
  emergencyStopped: false,
  policyCount: "2",
};

const snapshot: PublicVaultSnapshotV1 = {
  chainId: 114n,
  vault: baseWire.vault,
  asset: baseWire.asset,
  deposited: 1000n,
  available: 700n,
  reserved: 100n,
  spent: 150n,
  withdrawn: 25n,
  refunded: 25n,
  checkpoint: baseWire.checkpoint,
  emergencyStopped: false,
  policyCount: 2n,
};

describe("public vault snapshot", () => {
  it("round-trips quoted public fields and exposes conservation state", () => {
    const decoded = decodePublicVaultSnapshot(baseWire);
    expect(decoded).toEqual(snapshot);
    expect(encodePublicVaultSnapshot(snapshot)).toEqual(baseWire);
    expect(vaultReadState(snapshot)).toMatchObject({ status: "READY", publicFacts: true });
  });

  it("makes emergency stop explicit without changing public accounting", () => {
    const stopped = decodePublicVaultSnapshot({ ...baseWire, emergencyStopped: true });
    expect(vaultReadState(stopped)).toMatchObject({ status: "EMERGENCY_STOPPED", publicFacts: true });
  });

  it("rejects conservation drift, numeric JSON, private fields, zero checkpoint, and overflow", () => {
    expect(() => decodePublicVaultSnapshot({ ...baseWire, chainId: "0" })).toThrow(/chainId/);
    expect(() => decodePublicVaultSnapshot({ ...baseWire, available: "701" })).toThrow(/conservation/);
    expect(() => decodePublicVaultSnapshot({ ...baseWire, available: 700 })).toThrow(/quoted/);
    expect(() => decodePublicVaultSnapshot({ ...baseWire, policy: "private" })).toThrow(/unknown public vault field/);
    expect(() => decodePublicVaultSnapshot({ ...baseWire, checkpoint: zeroHash })).toThrow(/checkpoint/);
    expect(() => decodePublicVaultSnapshot({ ...baseWire, deposited: (1n << 256n).toString() })).toThrow(/range/);
  });

  it("represents absent providers without inventing balances", () => {
    expect(unavailableVaultState()).toEqual({ status: "UNAVAILABLE", reason: "RPC_UNCONFIGURED", publicFacts: false });
    expect(unavailableVaultState("RPC_UNAVAILABLE").publicFacts).toBe(false);
  });
});
