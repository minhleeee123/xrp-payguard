import { describe, expect, it } from "vitest";
import { getAddress, type Hex } from "viem";
import { buildXrplPaymentAbiEncodedRequest } from "../src/fdc-request.js";
import {
  COSTON2_FDC_XRPL_PROOF_URL,
  fetchCoston2XrplPaymentProof,
  parseCoston2XrplPaymentProof,
} from "../src/fdc-proof.js";

const transactionId = `0x${"ab".repeat(32)}` as Hex;
const proofOwner = "0x00000000000000000000000000000000000000c3";
const messageIntegrityCode = `0x${"cd".repeat(32)}` as Hex;
const sourceAddress = "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn";
const blockTimestamp = "1700000000";

const request = buildXrplPaymentAbiEncodedRequest({
  network: "testnet",
  transactionId,
  proofOwner,
  messageIntegrityCode,
});

function payload(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    response: {
      attestationType: request.attestationType,
      sourceId: request.sourceId,
      votingRound: "42",
      lowestUsedTimestamp: blockTimestamp,
      requestBody: { transactionId, proofOwner: getAddress(proofOwner) },
      responseBody: {
        blockNumber: "123456",
        blockTimestamp,
        sourceAddress,
        sourceAddressHash: `0x${"11".repeat(32)}`,
        receivingAddressHash: `0x${"22".repeat(32)}`,
        intendedReceivingAddressHash: `0x${"33".repeat(32)}`,
        spentAmount: "1000100",
        intendedSpentAmount: "1000100",
        receivedAmount: "1000000",
        intendedReceivedAmount: "1000000",
        hasMemoData: true,
        firstMemoData: "0xfe00ab",
        hasDestinationTag: true,
        destinationTag: "7",
        status: "0",
      },
    },
    proof: [`0x${"44".repeat(32)}`, `0x${"55".repeat(32)}`],
    ...patch,
  };
}

function response(body: unknown, status = 200, contentType = "application/json", contentLength?: string): {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
} {
  return {
    status,
    headers: {
      get: (name: string) => name.toLowerCase() === "content-type"
        ? contentType
        : name.toLowerCase() === "content-length" ? contentLength ?? null : null,
    },
    json: async () => body,
  };
}

describe("Coston2 FDC XRPPayment proof parser", () => {
  it("parses a DA response and preserves the public XRPPayment binding", () => {
    const parsed = parseCoston2XrplPaymentProof(payload(), {
      votingRoundId: 42n,
      requestBytes: request.abiEncodedRequest,
    });
    expect(parsed.status).toBe("AVAILABLE");
    expect(parsed.votingRoundId).toBe(42n);
    expect(parsed.requestBytes).toBe(request.abiEncodedRequest.toLowerCase());
    expect(parsed.merkleProof).toHaveLength(2);
    expect(parsed.response).toMatchObject({
      attestationType: request.attestationType,
      sourceId: request.sourceId,
      votingRound: 42n,
      lowestUsedTimestamp: 1_700_000_000n,
      requestBody: { transactionId, proofOwner: getAddress(proofOwner) },
      responseBody: {
        blockNumber: 123456n,
        blockTimestamp: 1_700_000_000n,
        sourceAddress,
        spentAmount: 1000100n,
        receivedAmount: 1000000n,
        firstMemoData: "0xfe00ab",
        destinationTag: 7n,
        status: 0,
      },
    });
  });

  it("fails closed for not-ready, request/response drift, status, and timestamp errors", () => {
    expect(() => parseCoston2XrplPaymentProof({}, { votingRoundId: 42n, requestBytes: request.abiEncodedRequest }))
      .toThrow(expect.objectContaining({ reason: "NOT_READY" }));
    const zeroMicRequest = `0x${request.abiEncodedRequest.slice(2, 2 + 128)}${"0".repeat(64)}${request.abiEncodedRequest.slice(2 + 192)}` as Hex;
    expect(() => parseCoston2XrplPaymentProof(payload(), { votingRoundId: 42n, requestBytes: zeroMicRequest }))
      .toThrow(expect.objectContaining({ reason: "INVALID_INPUT" }));
    expect(() => parseCoston2XrplPaymentProof(payload({ response: { ...(payload().response as Record<string, unknown>), sourceId: `0x${"99".repeat(32)}` } }), { votingRoundId: 42n, requestBytes: request.abiEncodedRequest }))
      .toThrow(expect.objectContaining({ reason: "DRIFT" }));
    expect(() => parseCoston2XrplPaymentProof(payload({ response: { ...(payload().response as Record<string, unknown>), lowestUsedTimestamp: "1700000001" } }), { votingRoundId: 42n, requestBytes: request.abiEncodedRequest }))
      .toThrow(expect.objectContaining({ reason: "DRIFT" }));
    expect(() => parseCoston2XrplPaymentProof(payload({ response: { ...(payload().response as Record<string, unknown>), responseBody: { ...((payload().response as Record<string, unknown>).responseBody as Record<string, unknown>), status: "3" } } }), { votingRoundId: 42n, requestBytes: request.abiEncodedRequest }))
      .toThrow(expect.objectContaining({ reason: "MALFORMED" }));
    expect(() => parseCoston2XrplPaymentProof(payload({ response: { ...(payload().response as Record<string, unknown>), responseBody: { ...((payload().response as Record<string, unknown>).responseBody as Record<string, unknown>), hasMemoData: false, firstMemoData: "0x01" } } }), { votingRoundId: 42n, requestBytes: request.abiEncodedRequest }))
      .toThrow(expect.objectContaining({ reason: "MALFORMED" }));
  });
});

describe("Coston2 FDC XRPPayment proof client", () => {
  it("pins the DA URL and sends only the public round/request body", async () => {
    const proof = await fetchCoston2XrplPaymentProof({
      votingRoundId: 42n,
      requestBytes: request.abiEncodedRequest,
      apiKey: "runtime-only-da-key",
      fetcher: async (url, init) => {
        expect(url).toBe(COSTON2_FDC_XRPL_PROOF_URL);
        expect(init.method).toBe("POST");
        expect(init.headers["content-type"]).toBe("application/json");
        expect(init.headers["x-api-key"]).toBe("runtime-only-da-key");
        expect(JSON.parse(init.body)).toEqual({ votingRoundId: 42, requestBytes: request.abiEncodedRequest.toLowerCase() });
        return response(payload());
      },
    });
    expect(proof.status).toBe("AVAILABLE");
    expect(proof.response.responseBody.receivedAmount).toBe(1000000n);
  });

  it("fails closed for missing credentials, transport, HTTP, content, and size failures", async () => {
    await expect(fetchCoston2XrplPaymentProof({ votingRoundId: 42n, requestBytes: request.abiEncodedRequest, apiKey: "" }))
      .rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(fetchCoston2XrplPaymentProof({ votingRoundId: 42n, requestBytes: request.abiEncodedRequest, apiKey: "runtime", fetcher: async () => { throw new Error("offline"); } }))
      .rejects.toMatchObject({ reason: "UNAVAILABLE" });
    await expect(fetchCoston2XrplPaymentProof({ votingRoundId: 42n, requestBytes: request.abiEncodedRequest, apiKey: "runtime", fetcher: async () => response({}, 503) }))
      .rejects.toMatchObject({ reason: "HTTP_ERROR" });
    await expect(fetchCoston2XrplPaymentProof({ votingRoundId: 42n, requestBytes: request.abiEncodedRequest, apiKey: "runtime", fetcher: async () => response({}, 200, "text/plain") }))
      .rejects.toMatchObject({ reason: "MALFORMED" });
    await expect(fetchCoston2XrplPaymentProof({ votingRoundId: 42n, requestBytes: request.abiEncodedRequest, apiKey: "runtime", fetcher: async () => response({}, 200, "application/json", "not-a-length") }))
      .rejects.toMatchObject({ reason: "MALFORMED" });
    await expect(fetchCoston2XrplPaymentProof({ votingRoundId: 42n, requestBytes: request.abiEncodedRequest, apiKey: "runtime", fetcher: async () => response({}, 200, "application/json", "524289") }))
      .rejects.toMatchObject({ reason: "MALFORMED" });
  });
});
