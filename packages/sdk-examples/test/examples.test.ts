import { describe, expect, it } from "vitest";
import type { Hex } from "@xrp-payguard/protocol";
import {
  prepareFlareSmartAccountPreview,
  prepareXrplWalletFdcPreview,
} from "../src/index.js";

const transactionId = `0x${"ab".repeat(32)}` as Hex;
const proofOwner = "0x00000000000000000000000000000000000000c3";
const personalAccount = "0x00000000000000000000000000000000000000a1";
const target = "0x00000000000000000000000000000000000000b1";

describe("XRPL wallet example", () => {
  it("prepares a public FDC request without claiming submission", () => {
    const preview = prepareXrplWalletFdcPreview({
      network: "testnet",
      transactionId,
      proofOwner,
    });

    expect(preview.status).toBe("PREPARED_NOT_SUBMITTED");
    expect(preview.nextRequiredGate).toBe("AUTHENTICATED_VERIFIER_PREPARE");
    expect(preview.request.requestBody.transactionId).toBe(transactionId);
    expect(preview.request.requestBody.proofOwner).toBe(
      "0x00000000000000000000000000000000000000C3",
    );
    expect(Object.keys(preview)).toEqual(["status", "request", "nextRequiredGate"]);
  });

  it("fails closed on a malformed public transaction identifier", () => {
    expect(() => prepareXrplWalletFdcPreview({
      network: "testnet",
      transactionId: "0x00" as Hex,
      proofOwner,
    })).toThrow(/transaction ID/);
  });
});

describe("Flare dApp example", () => {
  it("encodes a public memo without claiming signature or authorization", () => {
    const preview = prepareFlareSmartAccountPreview({
      calls: [{ target, value: 7n, data: "0x12345678" }],
      sender: personalAccount,
      nonce: 3n,
      walletId: 0,
      executorFeeUBA: 11n,
    });

    expect(preview.status).toBe("ENCODED_NOT_SIGNED");
    expect(preview.nextRequiredGate).toBe("WALLET_REVIEW_AND_SIGNATURE");
    expect(preview.instruction.memoData).toMatch(/^0xfe00[0-9a-f]{80}$/);
    expect(preview.instruction.totalCallValue).toBe(7n);
    expect(Object.keys(preview)).toEqual(["status", "instruction", "nextRequiredGate"]);
  });

  it("fails closed instead of encoding an empty call set", () => {
    expect(() => prepareFlareSmartAccountPreview({
      calls: [],
      sender: personalAccount,
      nonce: 3n,
      walletId: 0,
      executorFeeUBA: 11n,
    })).toThrow(/call count/);
  });
});
