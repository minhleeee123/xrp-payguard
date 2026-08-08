import { describe, expect, it } from "vitest";
import { type Hex } from "viem";
import { buildXrplPaymentAbiEncodedRequest } from "../src/fdc-request.js";
import {
  COSTON2_XRPL_PAYMENT_PREPARE_URL,
  prepareCoston2XrplPaymentRequest,
} from "../src/fdc-verifier.js";

const transactionId = `0x${"ab".repeat(32)}` as Hex;
const proofOwner = "0x00000000000000000000000000000000000000c3";
const apiKey = "runtime-only-test-key";
const messageIntegrityCode = `0x${"cd".repeat(32)}` as Hex;

function response(payload: unknown, status = 200, contentType = "application/json", contentLength?: string): {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
} {
  return {
    status,
    headers: { get: (name: string) => name.toLowerCase() === "content-type" ? contentType : name.toLowerCase() === "content-length" ? contentLength ?? null : null },
    json: async () => payload,
  };
}

describe("Coston2 FDC XRPPayment prepare client", () => {
  it("pins the official URL, sends only the public request body, and verifies every ABI word", async () => {
    const encoded = buildXrplPaymentAbiEncodedRequest({ network: "testnet", transactionId, proofOwner, messageIntegrityCode });
    const prepared = await prepareCoston2XrplPaymentRequest({
      transactionId,
      proofOwner,
      apiKey,
      fetcher: async (url, init) => {
        expect(url).toBe(COSTON2_XRPL_PAYMENT_PREPARE_URL);
        expect(init.method).toBe("POST");
        expect(init.headers["content-type"]).toBe("application/json");
        expect(init.headers["x-api-key"]).toBe(apiKey);
        const body = JSON.parse(init.body) as Record<string, unknown>;
        expect(body).toEqual({
          attestationType: encoded.attestationType,
          sourceId: encoded.sourceId,
          requestBody: encoded.requestBody,
        });
        return response({ status: "VALID", abiEncodedRequest: encoded.abiEncodedRequest });
      },
    });
    expect(prepared).toEqual({ ...encoded, status: "VALID" });
  });

  it("accepts an explicit MIC only when it matches the encoded request", async () => {
    const encoded = buildXrplPaymentAbiEncodedRequest({ network: "testnet", transactionId, proofOwner, messageIntegrityCode });
    await expect(prepareCoston2XrplPaymentRequest({
      transactionId, proofOwner, apiKey,
      fetcher: async () => response({ status: "VALID", abiEncodedRequest: encoded.abiEncodedRequest, messageIntegrityCode }),
    })).resolves.toMatchObject({ messageIntegrityCode });
    await expect(prepareCoston2XrplPaymentRequest({
      transactionId, proofOwner, apiKey,
      fetcher: async () => response({ status: "VALID", abiEncodedRequest: encoded.abiEncodedRequest, messageIntegrityCode: `0x${"ef".repeat(32)}` }),
    })).rejects.toMatchObject({ reason: "DRIFT" });
  });

  it("fails closed for missing credentials, verifier rejection, transport/HTTP errors, content drift, and oversize output", async () => {
    await expect(prepareCoston2XrplPaymentRequest({ transactionId, proofOwner, apiKey: "", fetcher: async () => response({}) }))
      .rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(prepareCoston2XrplPaymentRequest({ transactionId, proofOwner, apiKey, fetcher: async () => response({ status: "INVALID" }) }))
      .rejects.toMatchObject({ reason: "REJECTED" });
    await expect(prepareCoston2XrplPaymentRequest({ transactionId, proofOwner, apiKey, fetcher: async () => { throw new Error("offline"); } }))
      .rejects.toMatchObject({ reason: "UNAVAILABLE" });
    await expect(prepareCoston2XrplPaymentRequest({ transactionId, proofOwner, apiKey, fetcher: async () => response({}, 503) }))
      .rejects.toMatchObject({ reason: "HTTP_ERROR" });
    await expect(prepareCoston2XrplPaymentRequest({ transactionId, proofOwner, apiKey, fetcher: async () => response({}, 200, "text/plain") }))
      .rejects.toMatchObject({ reason: "MALFORMED" });
    await expect(prepareCoston2XrplPaymentRequest({ transactionId, proofOwner, apiKey, fetcher: async () => response({}, 200, "application/json", "262145") }))
      .rejects.toMatchObject({ reason: "MALFORMED" });
    await expect(prepareCoston2XrplPaymentRequest({
      transactionId, proofOwner, apiKey,
      fetcher: async () => response({ status: "VALID", abiEncodedRequest: `0x${"00".repeat(160)}` }),
    })).rejects.toMatchObject({ reason: "DRIFT" });
  });
});
