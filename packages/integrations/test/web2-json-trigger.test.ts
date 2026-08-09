import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, padHex, stringToHex, type Hex } from "viem";
import {
  FDC_PUBLIC_WEB2_SOURCE_V1,
  FDC_WEB2_JSON_V1,
  WEB2_JSON_SEMANTIC_TRUST_V1,
  verifyWeb2JsonTrigger,
  web2JsonInputCommitmentV1,
  web2JsonReplayCommitmentV1,
  web2JsonSchemaCommitmentV1,
  web2JsonSourceCommitmentV1,
  type ExpectedWeb2JsonTriggerV1,
  type Web2JsonSourcePolicyV1,
  type Web2JsonTriggerProofV1,
} from "../src/web2-json-trigger.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const postProcessJq = ". | {invoiceHash: .invoice_hash, paid: .paid, observedAt: .observed_at}";
const abiComponents = [
  { name: "invoiceHash", type: "bytes32" },
  { name: "paid", type: "bool" },
  { name: "observedAt", type: "uint64" },
] as const;
const abiSignature = JSON.stringify({ type: "tuple", components: abiComponents });
const dataAt = (observedAt: bigint, paid = true): Hex => encodeAbiParameters(
  [{ type: "tuple", components: abiComponents }],
  [{ invoiceHash: id("invoice-123"), paid, observedAt }],
);
const abiEncodedData = dataAt(100n);

const sourcePolicy: Web2JsonSourcePolicyV1 = {
  sourceId: FDC_PUBLIC_WEB2_SOURCE_V1,
  url: "https://status.payguard.invalid/v1/invoices/123",
  httpMethod: "GET",
  headers: '{"accept":"application/json"}',
  queryParams: '{"network":"coston2"}',
  body: "{}",
  postProcessJq,
  abiSignature,
  schemaCommitment: web2JsonSchemaCommitmentV1(postProcessJq, abiSignature),
  semanticTrust: WEB2_JSON_SEMANTIC_TRUST_V1,
};

const expected: ExpectedWeb2JsonTriggerV1 = {
  sourcePolicy,
  messageIntegrityCode: id("web2-json-mic"),
  responseDataHash: keccak256(abiEncodedData),
  minTimestamp: 90n,
  maxAgeSeconds: 30n,
};

function proof(): Web2JsonTriggerProofV1 {
  const requestBody = {
    url: sourcePolicy.url,
    httpMethod: sourcePolicy.httpMethod,
    headers: sourcePolicy.headers,
    queryParams: sourcePolicy.queryParams,
    body: sourcePolicy.body,
    postProcessJq: sourcePolicy.postProcessJq,
    abiSignature: sourcePolicy.abiSignature,
  };
  return {
    request: {
      attestationType: FDC_WEB2_JSON_V1,
      sourceId: FDC_PUBLIC_WEB2_SOURCE_V1,
      messageIntegrityCode: expected.messageIntegrityCode,
      requestBody: { ...requestBody },
    },
    response: {
      attestationType: FDC_WEB2_JSON_V1,
      sourceId: FDC_PUBLIC_WEB2_SOURCE_V1,
      votingRound: 11n,
      lowestUsedTimestamp: (1n << 64n) - 1n,
      requestBody: { ...requestBody },
      responseBody: { abiEncodedData },
    },
    finalized: true,
  };
}

const sourceAllowlist = [web2JsonSourceCommitmentV1(sourcePolicy)];
const verifier = { verify: async () => id("verified-web2-json-proof") };

describe("FDC Web2Json trigger adapter", () => {
  it("binds the allowlisted source, exact transform/schema, response, freshness, and semantic disclosure", async () => {
    const candidate = proof();
    const accepted = await verifyWeb2JsonTrigger(candidate, expected, 120n, verifier, sourceAllowlist);
    expect(accepted).toEqual({
      ok: true,
      inputCommitment: web2JsonInputCommitmentV1(candidate),
      proofCommitment: id("verified-web2-json-proof"),
    });
    expect(sourceAllowlist[0]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(web2JsonReplayCommitmentV1(candidate)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("fails closed unless the exact source descriptor is allowlisted", async () => {
    expect(await verifyWeb2JsonTrigger(proof(), expected, 120n, verifier, []))
      .toEqual({ ok: false, reason: "NOT_ALLOWLISTED" });
    expect(await verifyWeb2JsonTrigger(proof(), expected, 120n, verifier, [id("another-source")]))
      .toEqual({ ok: false, reason: "NOT_ALLOWLISTED" });
    expect(await verifyWeb2JsonTrigger(proof(), expected, 120n, verifier, [sourceAllowlist[0]!, sourceAllowlist[0]!]))
      .toEqual({ ok: false, reason: "NOT_ALLOWLISTED" });
    expect(await verifyWeb2JsonTrigger(proof(), expected, 120n, verifier, ["0x00" as Hex]))
      .toEqual({ ok: false, reason: "NOT_ALLOWLISTED" });
  });

  it("rejects schema drift and omission of the source-truth limitation", async () => {
    const wrongSchema: ExpectedWeb2JsonTriggerV1 = {
      ...expected,
      sourcePolicy: { ...sourcePolicy, schemaCommitment: id("wrong-schema") },
    };
    expect(await verifyWeb2JsonTrigger(proof(), wrongSchema, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "SCHEMA_MISMATCH" });

    const misleadingTrust = {
      ...expected,
      sourcePolicy: { ...sourcePolicy, semanticTrust: "SOURCE_IS_TRUTH" },
    } as unknown as ExpectedWeb2JsonTriggerV1;
    expect(await verifyWeb2JsonTrigger(proof(), misleadingTrust, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "SEMANTIC_TRUST" });
  });

  it("rejects non-public, non-canonical, or nondeterministic source configuration", async () => {
    const credentialUrl = `https://${["fixture-user", "fixture-value"].join(":")}@status.payguard.invalid/v1/invoices/123`;
    const authorizationHeader = JSON.stringify({ authorization: ["opaque", "fixture"].join("-") });
    const cases: Web2JsonSourcePolicyV1[] = [
      { ...sourcePolicy, url: "http://status.payguard.invalid/v1/invoices/123" },
      { ...sourcePolicy, url: credentialUrl },
      { ...sourcePolicy, url: "https://status.payguard.invalid/v1/invoices/123?token=value" },
      { ...sourcePolicy, url: "https://127.0.0.1/v1/invoices/123" },
      { ...sourcePolicy, headers: authorizationHeader },
      { ...sourcePolicy, headers: '{"Accept":"application/json"}' },
      { ...sourcePolicy, queryParams: '{"token":"forbidden"}' },
      { ...sourcePolicy, queryParams: '{"z":"last","a":"first"}' },
      { ...sourcePolicy, body: '{"private_key":"forbidden"}', httpMethod: "POST" },
      { ...sourcePolicy, body: '{"amount":1.25}', httpMethod: "POST" },
      { ...sourcePolicy, postProcessJq: ".value | now", schemaCommitment: web2JsonSchemaCommitmentV1(".value | now", abiSignature) },
      { ...sourcePolicy, abiSignature: "not an ABI schema", schemaCommitment: web2JsonSchemaCommitmentV1(postProcessJq, "not an ABI schema") },
      { ...sourcePolicy, abiSignature: "bool", schemaCommitment: web2JsonSchemaCommitmentV1(postProcessJq, "bool") },
      { ...sourcePolicy, abiSignature: '{"type":"tuple","components":[{"name":"paid","type":"bool"}]}', schemaCommitment: web2JsonSchemaCommitmentV1(postProcessJq, '{"type":"tuple","components":[{"name":"paid","type":"bool"}]}') },
      { ...sourcePolicy, body: '{"value":1}', httpMethod: "GET" },
    ];
    for (const invalidSource of cases) {
      const invalidExpected = { ...expected, sourcePolicy: invalidSource };
      const result = await verifyWeb2JsonTrigger(proof(), invalidExpected, 120n, verifier, [web2JsonSourceCommitmentV1(invalidSource)]);
      expect(result, invalidSource.url).toEqual({ ok: false, reason: "MALFORMED" });
    }
  });

  it("rejects request, response, type, finality, freshness, and data drift", async () => {
    const requestDrift = proof();
    requestDrift.request.requestBody.queryParams = '{"network":"mainnet"}';
    expect(await verifyWeb2JsonTrigger(requestDrift, expected, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "REQUEST_MISMATCH" });

    const responseRequestDrift = proof();
    responseRequestDrift.response.requestBody.postProcessJq = ".paid";
    expect(await verifyWeb2JsonTrigger(responseRequestDrift, expected, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "REQUEST_MISMATCH" });

    const wrongMic = proof();
    wrongMic.request.messageIntegrityCode = id("wrong-mic");
    expect(await verifyWeb2JsonTrigger(wrongMic, expected, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "REQUEST_MISMATCH" });

    const wrongType = proof();
    wrongType.response.attestationType = id("wrong-type") as typeof FDC_WEB2_JSON_V1;
    expect(await verifyWeb2JsonTrigger(wrongType, expected, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "ATTESTATION_TYPE" });

    const wrongSource = proof();
    wrongSource.response.sourceId = id("wrong-source") as typeof FDC_PUBLIC_WEB2_SOURCE_V1;
    expect(await verifyWeb2JsonTrigger(wrongSource, expected, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "REQUEST_MISMATCH" });

    const notFinal = proof();
    notFinal.finalized = false;
    expect(await verifyWeb2JsonTrigger(notFinal, expected, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "NOT_FINALIZED" });

    const wrongLowestUsedTimestamp = proof();
    wrongLowestUsedTimestamp.response.lowestUsedTimestamp = 100n;
    expect(await verifyWeb2JsonTrigger(wrongLowestUsedTimestamp, expected, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "MALFORMED" });

    const staleData = dataAt(89n);
    const stale = proof();
    stale.response.responseBody.abiEncodedData = staleData;
    expect(await verifyWeb2JsonTrigger(stale, { ...expected, responseDataHash: keccak256(staleData) }, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "STALE" });

    const futureData = dataAt(121n);
    const future = proof();
    future.response.responseBody.abiEncodedData = futureData;
    expect(await verifyWeb2JsonTrigger(future, { ...expected, responseDataHash: keccak256(futureData) }, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "STALE" });

    const wrongData = proof();
    wrongData.response.responseBody.abiEncodedData = dataAt(100n, false);
    expect(await verifyWeb2JsonTrigger(wrongData, expected, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "RESPONSE_MISMATCH" });

    const malformedData = padHex("0x01", { size: 32 });
    const malformedResponse = proof();
    malformedResponse.response.responseBody.abiEncodedData = malformedData;
    expect(await verifyWeb2JsonTrigger(malformedResponse,
      { ...expected, responseDataHash: keccak256(malformedData) }, 120n, verifier, sourceAllowlist))
      .toEqual({ ok: false, reason: "RESPONSE_MISMATCH" });
  });

  it("fails closed for unavailable/negative verifiers, both replay classes, and async proof drift", async () => {
    expect(await verifyWeb2JsonTrigger(proof(), expected, 120n, undefined, sourceAllowlist))
      .toEqual({ ok: false, reason: "VERIFIER_UNAVAILABLE" });
    expect(await verifyWeb2JsonTrigger(proof(), expected, 120n, { verify: async () => false }, sourceAllowlist))
      .toEqual({ ok: false, reason: "PROOF_INVALID" });
    expect(await verifyWeb2JsonTrigger(proof(), expected, 120n, { verify: async () => { throw new Error("down"); } }, sourceAllowlist))
      .toEqual({ ok: false, reason: "VERIFIER_UNAVAILABLE" });

    const candidate = proof();
    expect(await verifyWeb2JsonTrigger(candidate, expected, 120n, verifier, sourceAllowlist,
      new Set([web2JsonReplayCommitmentV1(candidate).toLowerCase()])))
      .toEqual({ ok: false, reason: "REPLAY" });
    expect(await verifyWeb2JsonTrigger(proof(), expected, 120n, verifier, sourceAllowlist, new Set(),
      new Set([id("verified-web2-json-proof").toLowerCase()])))
      .toEqual({ ok: false, reason: "REPLAY" });

    const concurrentlyUsed = new Set<string>();
    const concurrentCandidate = proof();
    expect(await verifyWeb2JsonTrigger(concurrentCandidate, expected, 120n, {
      verify: async () => {
        concurrentlyUsed.add(web2JsonReplayCommitmentV1(concurrentCandidate).toLowerCase());
        return id("concurrent-proof");
      },
    }, sourceAllowlist, concurrentlyUsed)).toEqual({ ok: false, reason: "REPLAY" });

    const mutable = proof();
    expect(await verifyWeb2JsonTrigger(mutable, expected, 120n, {
      verify: async () => {
        mutable.response.lowestUsedTimestamp = 101n;
        return id("mutated-proof");
      },
    }, sourceAllowlist)).toEqual({ ok: false, reason: "MALFORMED" });
  });
});
