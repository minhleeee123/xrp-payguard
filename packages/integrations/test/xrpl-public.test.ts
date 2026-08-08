import { describe, expect, it } from "vitest";
import {
  XRPL_PUBLIC_API_VERSION,
  XRPL_VALIDATED_LEDGER,
  XrplPublicReadError,
  readValidatedXrplAccountInfo,
  readValidatedXrplLedger,
  readValidatedXrplPayment,
} from "../src/xrpl-public.js";

const account = "r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59";
const destination = "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn";
const txHash = "C53ECF838647FA5A4C780377025FEC7999AB4182590510CA461444B207AB74A9";

describe("XRPL public read boundary", () => {
  it("reads a validated account checkpoint without accepting signing inputs", async () => {
    let request: unknown;
    const checkpoint = await readValidatedXrplAccountInfo({
      async request(payload) {
        request = payload;
        return {
          status: "success",
          type: "response",
          result: {
            account_data: { Account: account, Balance: "1000000", Sequence: 7 },
            ledger_index: 42,
            validated: true,
          },
        };
      },
    }, account);
    expect(request).toEqual({ command: "account_info", account, ledger_index: XRPL_VALIDATED_LEDGER, api_version: XRPL_PUBLIC_API_VERSION });
    expect(checkpoint).toEqual({ account, balanceDrops: 1_000_000n, sequence: 7n, ledgerIndex: 42n, validated: true });
  });

  it("reads a validated ledger and rejects nested checkpoint drift", async () => {
    const ledger = await readValidatedXrplLedger({
      async request(payload) {
        expect(payload).toEqual({ command: "ledger", ledger_index: XRPL_VALIDATED_LEDGER, transactions: false, expand: false, api_version: XRPL_PUBLIC_API_VERSION });
        return {
          status: "success",
          result: {
            ledger_hash: "9D346B0C050CA0C7B96A761942912785A27CFC5F3407A39AF03DA0BE9C6A4298",
            ledger_index: 100,
            validated: true,
            ledger: {
              ledger_hash: "9D346B0C050CA0C7B96A761942912785A27CFC5F3407A39AF03DA0BE9C6A4298",
              ledger_index: 100,
            },
          },
        };
      },
    });
    expect(ledger).toEqual({
      ledgerHash: "0x9d346b0c050ca0c7b96a761942912785a27cfc5f3407a39af03da0be9c6a4298",
      ledgerIndex: 100n,
      validated: true,
    });
    await expect(readValidatedXrplLedger({
      async request() {
        return { status: "success", result: { ledger_hash: "9D346B0C050CA0C7B96A761942912785A27CFC5F3407A39AF03DA0BE9C6A4298", ledger_index: 100, validated: true, ledger: { ledger_index: 101 } } };
      },
    })).rejects.toMatchObject({ reason: "MALFORMED" });
  });

  it("parses one native XRP Payment and bounds the tx search range", async () => {
    let request: unknown;
    const payment = await readValidatedXrplPayment({
      async request(payload) {
        request = payload;
        return {
          status: "success",
          result: {
            hash: txHash,
            validated: true,
            ledger_index: 56865245,
            tx_json: {
              hash: txHash,
              TransactionType: "Payment",
              Account: account,
              Destination: destination,
              Amount: "123456",
              DestinationTag: 9,
              Memos: [{ Memo: { MemoData: "FE00AB" } }],
            },
            meta: { TransactionResult: "tesSUCCESS" },
          },
        };
      },
    }, txHash, { minLedgerIndex: 56865000n, maxLedgerIndex: 56865300n });
    expect(request).toEqual({ command: "tx", transaction: txHash, binary: false, api_version: XRPL_PUBLIC_API_VERSION, min_ledger: 56865000, max_ledger: 56865300 });
    expect(payment).toEqual({
      txHash: `0x${txHash.toLowerCase()}`,
      source: account,
      destination,
      amountDrops: 123456n,
      ledgerIndex: 56865245n,
      memoData: "0xfe00ab",
      destinationTag: 9n,
      result: "tesSUCCESS",
      validated: true,
    });
  });
});

describe("XRPL public read failures", () => {
  it("fails closed for invalid input, unavailable RPC, unvalidated data, and malformed Payment", async () => {
    await expect(readValidatedXrplAccountInfo({ async request() { return {}; } }, "not-an-account"))
      .rejects.toMatchObject({ reason: "MALFORMED" });
    await expect(readValidatedXrplAccountInfo({ async request() { throw new Error("offline"); } }, account))
      .rejects.toMatchObject({ reason: "UNAVAILABLE" });
    await expect(readValidatedXrplAccountInfo({ async request() { return { status: "success", result: { validated: false } }; } }, account))
      .rejects.toMatchObject({ reason: "UNVALIDATED" });
    await expect(readValidatedXrplPayment({ async request() { return { status: "success", result: { validated: true, hash: txHash, ledger_index: 1, tx_json: { TransactionType: "Payment", Account: account, Destination: destination, Amount: { currency: "USD" } }, meta: { TransactionResult: "tesSUCCESS" } } }; } }, txHash))
      .rejects.toMatchObject({ reason: "MALFORMED" });
    await expect(readValidatedXrplPayment({ async request() { return { status: "error", result: { error: "txnNotFound" } }; } }, txHash))
      .rejects.toBeInstanceOf(XrplPublicReadError);
    await expect(readValidatedXrplPayment({ async request() { return { status: "success", result: {} }; } }, txHash, { minLedgerIndex: 10n, maxLedgerIndex: 2n }))
      .rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(readValidatedXrplPayment({ async request() { return { status: "success", result: {} }; } }, txHash, { minLedgerIndex: BigInt(Number.MAX_SAFE_INTEGER) + 1n, maxLedgerIndex: BigInt(Number.MAX_SAFE_INTEGER) + 2n }))
      .rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(readValidatedXrplPayment({ async request() { return { status: "success", result: { validated: true, hash: txHash, ledger_index: 56865300, tx_json: { hash: txHash, TransactionType: "Payment", Account: account, Destination: destination, Amount: "1" }, meta: { TransactionResult: "tesSUCCESS" } } }; } }, txHash, { minLedgerIndex: 56865000n, maxLedgerIndex: 56865200n }))
      .rejects.toMatchObject({ reason: "MALFORMED" });
  });
});
