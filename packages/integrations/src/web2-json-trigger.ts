import type { Hex } from "@xrp-payguard/protocol";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  keccak256,
  padHex,
  stringToHex,
  zeroHash,
  type AbiParameter,
} from "viem";
import type {
  FdcTriggerVerifier,
  TriggerFailure,
  TriggerVerification,
} from "./triggers.js";

const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_CANONICAL_JSON_BYTES = 8_192;
const MAX_JQ_BYTES = 4_096;
const MAX_ABI_SIGNATURE_BYTES = 2_048;
const MAX_ABI_ENCODED_DATA_BYTES = 65_536;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_NODES = 256;
const MAX_ALLOWLIST_ENTRIES = 64;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;
const HEADER_NAME = /^[a-z0-9][a-z0-9-]{0,126}$/;
const FORBIDDEN_PUBLIC_FIELD = /(?:^|[-_])(api[-_]?key|authorization|cookie|credential|password|private[-_]?key|secret|seed|token)(?:$|[-_])/i;
const FORBIDDEN_JQ = /(?:\$ENV|\b(?:debug|def|env|foreach|include|import|input|inputs|module|now|recurse|reduce|until|while)\b)/;
const ABI_COMPONENT_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const WEB2_JSON_SCHEMA_DOMAIN_V1 = padHex(stringToHex("PAYGUARD_WEB2_SCHEMA_V1"), { dir: "right", size: 32 });
const WEB2_JSON_SOURCE_DOMAIN_V1 = padHex(stringToHex("PAYGUARD_WEB2_SOURCE_V1"), { dir: "right", size: 32 });
const WEB2_JSON_REPLAY_DOMAIN_V1 = padHex(stringToHex("PAYGUARD_WEB2_REPLAY_V1"), { dir: "right", size: 32 });
const WEB2_JSON_INPUT_DOMAIN_V1 = padHex(stringToHex("PAYGUARD_WEB2_INPUT_V1"), { dir: "right", size: 32 });

export const FDC_WEB2_JSON_V1 = padHex(stringToHex("Web2Json"), { dir: "right", size: 32 });
export const FDC_PUBLIC_WEB2_SOURCE_V1 = padHex(stringToHex("PublicWeb2"), { dir: "right", size: 32 });
export const WEB2_JSON_SEMANTIC_TRUST_V1 = "ATTESTED_RESPONSE_ONLY_SOURCE_TRUTH_NOT_GUARANTEED" as const;
export const WEB2_JSON_FRESHNESS_FIELD_V1 = "observedAt" as const;

export type Web2JsonHttpMethodV1 = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Exact official IWeb2Json request-body fields. Every string becomes public FDC input. */
export interface Web2JsonRequestBodyV1 {
  url: string;
  httpMethod: Web2JsonHttpMethodV1;
  headers: string;
  queryParams: string;
  body: string;
  postProcessJq: string;
  abiSignature: string;
}

export interface Web2JsonRequestV1 {
  attestationType: typeof FDC_WEB2_JSON_V1;
  sourceId: typeof FDC_PUBLIC_WEB2_SOURCE_V1;
  messageIntegrityCode: Hex;
  requestBody: Web2JsonRequestBodyV1;
}

export interface Web2JsonResponseV1 {
  attestationType: typeof FDC_WEB2_JSON_V1;
  sourceId: typeof FDC_PUBLIC_WEB2_SOURCE_V1;
  votingRound: bigint;
  lowestUsedTimestamp: bigint;
  requestBody: Web2JsonRequestBodyV1;
  responseBody: { abiEncodedData: Hex };
}

/** Local wrapper around the official request/response consumed by an injected proof verifier. */
export interface Web2JsonTriggerProofV1 {
  request: Web2JsonRequestV1;
  response: Web2JsonResponseV1;
  finalized: boolean;
}

/**
 * Governance-frozen source descriptor. A production consumer must populate its
 * own allowlist from separately verified Flare-supported source evidence.
 */
export interface Web2JsonSourcePolicyV1 extends Web2JsonRequestBodyV1 {
  sourceId: typeof FDC_PUBLIC_WEB2_SOURCE_V1;
  schemaCommitment: Hex;
  semanticTrust: typeof WEB2_JSON_SEMANTIC_TRUST_V1;
}

export interface ExpectedWeb2JsonTriggerV1 {
  sourcePolicy: Web2JsonSourcePolicyV1;
  messageIntegrityCode: Hex;
  responseDataHash: Hex;
  minTimestamp: bigint;
  maxAgeSeconds: bigint;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function isHex32(value: unknown): value is Hex {
  return typeof value === "string" && HEX32.test(value);
}

function isNonZeroHex32(value: unknown): value is Hex {
  return isHex32(value) && value.toLowerCase() !== zeroHash;
}

function isUint64(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n && value <= MAX_UINT64;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function exactRequestBody(left: Web2JsonRequestBodyV1, right: Web2JsonRequestBodyV1): boolean {
  return left.url === right.url && left.httpMethod === right.httpMethod && left.headers === right.headers
    && left.queryParams === right.queryParams && left.body === right.body
    && left.postProcessJq === right.postProcessJq && left.abiSignature === right.abiSignature;
}

function validateJsonValue(value: unknown, depth: number, nodes: { count: number }): value is JsonValue {
  nodes.count += 1;
  if (nodes.count > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isSafeInteger(value);
  if (typeof value === "string") return utf8Length(value) <= 2_048;
  if (Array.isArray(value)) return value.length <= 64
    && value.every((entry) => validateJsonValue(entry, depth + 1, nodes));
  if (typeof value !== "object") return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 64) return false;
  const keys = entries.map(([key]) => key);
  if (keys.some((key) => key.length === 0 || key.length > 128 || FORBIDDEN_PUBLIC_FIELD.test(key))) return false;
  if (!keys.every((key, index) => index === 0 || keys[index - 1]! < key)) return false;
  return entries.every(([, entry]) => validateJsonValue(entry, depth + 1, nodes));
}

function parseCanonicalJson(value: unknown, requireObject: boolean): JsonValue | undefined {
  if (typeof value !== "string" || utf8Length(value) > MAX_CANONICAL_JSON_BYTES) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
  if (requireObject && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) return undefined;
  if (!validateJsonValue(parsed, 0, { count: 0 }) || JSON.stringify(parsed) !== value) return undefined;
  return parsed;
}

function validHeaders(value: unknown): boolean {
  const parsed = parseCanonicalJson(value, true);
  if (parsed === undefined || parsed === null || Array.isArray(parsed) || typeof parsed !== "object") return false;
  return Object.entries(parsed).every(([name, entry]) => HEADER_NAME.test(name)
    && !FORBIDDEN_PUBLIC_FIELD.test(name) && typeof entry === "string"
    && utf8Length(entry) <= 1_024 && !/[\r\n]/.test(entry));
}

function validPublicUrl(value: unknown): value is string {
  if (typeof value !== "string" || utf8Length(value) > 2_048) return false;
  try {
    const parsed = new URL(value);
    const ipLiteral = /^\[.*\]$|^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(parsed.hostname);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === ""
      && parsed.search === "" && parsed.hash === "" && parsed.hostname.includes(".")
      && parsed.hostname !== "localhost" && !ipLiteral && parsed.href === value;
  } catch {
    return false;
  }
}

function validJq(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(".") && utf8Length(value) > 0
    && utf8Length(value) <= MAX_JQ_BYTES && !FORBIDDEN_JQ.test(value);
}

interface Web2JsonTupleSchemaV1 {
  parameter: AbiParameter;
  freshnessIndex: number;
}

function validPrimitiveAbiType(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (["address", "bool", "bytes", "string"].includes(value) || /^bytes(?:[1-9]|[12][0-9]|3[0-2])$/.test(value)) return true;
  const integer = /^(u?int)([0-9]{0,3})$/.exec(value);
  if (integer === null) return false;
  const width = integer[2] === "" ? 256 : Number(integer[2]);
  return width >= 8 && width <= 256 && width % 8 === 0;
}

function parseAbiSignature(value: unknown): Web2JsonTupleSchemaV1 | undefined {
  if (typeof value !== "string" || utf8Length(value) === 0 || utf8Length(value) > MAX_ABI_SIGNATURE_BYTES) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || record.type !== "tuple" || !Array.isArray(record.components)
    || record.components.length === 0 || record.components.length > 16) return undefined;
  const components: Array<{ name: string; type: string }> = [];
  for (const candidate of record.components) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return undefined;
    const component = candidate as Record<string, unknown>;
    if (Object.keys(component).length !== 2 || typeof component.name !== "string" || !ABI_COMPONENT_NAME.test(component.name)
      || !validPrimitiveAbiType(component.type)) return undefined;
    components.push({ name: component.name, type: component.type });
  }
  if (new Set(components.map(({ name }) => name)).size !== components.length) return undefined;
  const freshnessIndex = components.findIndex(({ name, type }) => name === WEB2_JSON_FRESHNESS_FIELD_V1 && type === "uint64");
  if (freshnessIndex < 0) return undefined;
  const normalized = JSON.stringify({ type: "tuple", components });
  if (normalized !== value) return undefined;
  return { parameter: { type: "tuple", components } as AbiParameter, freshnessIndex };
}

function validRequestBody(body: Web2JsonRequestBodyV1): boolean {
  if (!validPublicUrl(body.url) || !(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).includes(body.httpMethod)
    || !validHeaders(body.headers) || parseCanonicalJson(body.queryParams, true) === undefined
    || parseCanonicalJson(body.body, true) === undefined || !validJq(body.postProcessJq)
    || parseAbiSignature(body.abiSignature) === undefined) return false;
  return (body.httpMethod !== "GET" && body.httpMethod !== "DELETE") || body.body === "{}";
}

export function web2JsonSchemaCommitmentV1(postProcessJq: string, abiSignature: string): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "string" }, { type: "string" }],
    [WEB2_JSON_SCHEMA_DOMAIN_V1, postProcessJq, abiSignature],
  ));
}

export function web2JsonSourceCommitmentV1(source: Web2JsonSourcePolicyV1): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "string" }, { type: "string" },
      { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" },
      { type: "bytes32" }, { type: "bytes32" }],
    [WEB2_JSON_SOURCE_DOMAIN_V1, source.sourceId, source.url, source.httpMethod,
      keccak256(stringToHex(source.headers)), keccak256(stringToHex(source.queryParams)),
      keccak256(stringToHex(source.body)), source.schemaCommitment,
      keccak256(stringToHex(source.postProcessJq)), keccak256(stringToHex(source.semanticTrust))],
  ));
}

function sourceFromRequestBody(
  sourceId: typeof FDC_PUBLIC_WEB2_SOURCE_V1,
  body: Web2JsonRequestBodyV1,
): Web2JsonSourcePolicyV1 {
  return {
    ...body,
    sourceId,
    schemaCommitment: web2JsonSchemaCommitmentV1(body.postProcessJq, body.abiSignature),
    semanticTrust: WEB2_JSON_SEMANTIC_TRUST_V1,
  };
}

export function web2JsonReplayCommitmentV1(proof: Web2JsonTriggerProofV1): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }],
    [WEB2_JSON_REPLAY_DOMAIN_V1,
      web2JsonSourceCommitmentV1(sourceFromRequestBody(proof.request.sourceId, proof.request.requestBody)),
      proof.request.messageIntegrityCode, keccak256(proof.response.responseBody.abiEncodedData)],
  ));
}

export function web2JsonInputCommitmentV1(proof: Web2JsonTriggerProofV1): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" },
      { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint64" },
      { type: "uint64" }, { type: "bytes32" }],
    [WEB2_JSON_INPUT_DOMAIN_V1, proof.request.attestationType,
      web2JsonSourceCommitmentV1(sourceFromRequestBody(proof.request.sourceId, proof.request.requestBody)),
      proof.response.attestationType,
      web2JsonSourceCommitmentV1(sourceFromRequestBody(proof.response.sourceId, proof.response.requestBody)),
      proof.request.messageIntegrityCode, web2JsonReplayCommitmentV1(proof), proof.response.votingRound,
      proof.response.lowestUsedTimestamp, keccak256(proof.response.responseBody.abiEncodedData)],
  ));
}

function sourcePolicyFailure(source: Web2JsonSourcePolicyV1): TriggerFailure | undefined {
  if (source.semanticTrust !== WEB2_JSON_SEMANTIC_TRUST_V1) return "SEMANTIC_TRUST";
  if (!isHex32(source.sourceId) || source.sourceId.toLowerCase() !== FDC_PUBLIC_WEB2_SOURCE_V1.toLowerCase()
    || !validRequestBody(source)) return "MALFORMED";
  if (!isHex32(source.schemaCommitment)
    || web2JsonSchemaCommitmentV1(source.postProcessJq, source.abiSignature).toLowerCase()
      !== source.schemaCommitment.toLowerCase()) return "SCHEMA_MISMATCH";
  return undefined;
}

function decodeSourceObservedAt(schema: Web2JsonTupleSchemaV1, data: Hex): bigint | undefined {
  try {
    const decoded = decodeAbiParameters([schema.parameter], data)[0] as unknown;
    let value: unknown;
    if (Array.isArray(decoded)) value = decoded[schema.freshnessIndex];
    else if (typeof decoded === "object" && decoded !== null) {
      value = (decoded as Record<string, unknown>)[WEB2_JSON_FRESHNESS_FIELD_V1];
    }
    return isUint64(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function fail(reason: TriggerFailure): TriggerVerification {
  return { ok: false, reason };
}

/**
 * Verify an allowlisted Web2Json assertion. This proves exact attested bytes;
 * it deliberately does not promote the source's business assertion to truth.
 */
export async function verifyWeb2JsonTrigger(
  proof: Web2JsonTriggerProofV1,
  expected: ExpectedWeb2JsonTriggerV1,
  now: bigint,
  verifier: FdcTriggerVerifier<Web2JsonTriggerProofV1> | undefined,
  allowedSourceCommitments: readonly Hex[],
  usedReplayCommitments: ReadonlySet<string> = new Set(),
  usedProofCommitments: ReadonlySet<string> = new Set(),
): Promise<TriggerVerification> {
  if (!isHex32(proof.request.attestationType) || !isHex32(proof.response.attestationType)
    || proof.request.attestationType.toLowerCase() !== FDC_WEB2_JSON_V1.toLowerCase()
    || proof.response.attestationType.toLowerCase() !== FDC_WEB2_JSON_V1.toLowerCase()) return fail("ATTESTATION_TYPE");
  if (proof.finalized !== true) return fail("NOT_FINALIZED");
  try {
    const policyFailure = sourcePolicyFailure(expected.sourcePolicy);
    if (policyFailure !== undefined) return fail(policyFailure);
    const sourceCommitment = web2JsonSourceCommitmentV1(expected.sourcePolicy);
    if (allowedSourceCommitments.length === 0 || allowedSourceCommitments.length > MAX_ALLOWLIST_ENTRIES
      || allowedSourceCommitments.some((entry) => !isNonZeroHex32(entry))) return fail("NOT_ALLOWLISTED");
    const normalizedAllowlist = allowedSourceCommitments.map((entry) => entry.toLowerCase());
    if (new Set(normalizedAllowlist).size !== normalizedAllowlist.length
      || !normalizedAllowlist.includes(sourceCommitment.toLowerCase())) return fail("NOT_ALLOWLISTED");
    if (!isNonZeroHex32(expected.messageIntegrityCode) || !isNonZeroHex32(expected.responseDataHash)
      || !isUint64(expected.minTimestamp) || !isUint64(expected.maxAgeSeconds) || expected.maxAgeSeconds === 0n
      || !isUint64(now)) return fail("MALFORMED");
    if (!isHex32(proof.request.sourceId) || !isHex32(proof.response.sourceId)
      || proof.request.sourceId.toLowerCase() !== FDC_PUBLIC_WEB2_SOURCE_V1.toLowerCase()
      || proof.response.sourceId.toLowerCase() !== FDC_PUBLIC_WEB2_SOURCE_V1.toLowerCase()
      || !isNonZeroHex32(proof.request.messageIntegrityCode)
      || proof.request.messageIntegrityCode.toLowerCase() !== expected.messageIntegrityCode.toLowerCase()
      || !validRequestBody(proof.request.requestBody)
      || !exactRequestBody(proof.request.requestBody, expected.sourcePolicy)
      || !exactRequestBody(proof.response.requestBody, expected.sourcePolicy)
      || !exactRequestBody(proof.request.requestBody, proof.response.requestBody)) return fail("REQUEST_MISMATCH");
    if (!isUint64(proof.response.votingRound) || proof.response.votingRound === 0n
      || proof.response.lowestUsedTimestamp !== MAX_UINT64) return fail("MALFORMED");
    const data = proof.response.responseBody.abiEncodedData;
    if (typeof data !== "string" || !HEX_BYTES.test(data) || data === "0x"
      || (data.length - 2) / 2 > MAX_ABI_ENCODED_DATA_BYTES
      || (data.length - 2) / 2 % 32 !== 0
      || keccak256(data).toLowerCase() !== expected.responseDataHash.toLowerCase()) return fail("RESPONSE_MISMATCH");
    const schema = parseAbiSignature(expected.sourcePolicy.abiSignature);
    const observedAt = schema === undefined ? undefined : decodeSourceObservedAt(schema, data);
    if (observedAt === undefined) return fail("RESPONSE_MISMATCH");
    if (observedAt < expected.minTimestamp || observedAt > now
      || now - observedAt > expected.maxAgeSeconds) return fail("STALE");
    const replayCommitment = web2JsonReplayCommitmentV1(proof);
    if (usedReplayCommitments.has(replayCommitment.toLowerCase())) return fail("REPLAY");
    const inputCommitment = web2JsonInputCommitmentV1(proof);
    if (!verifier) return fail("VERIFIER_UNAVAILABLE");
    let proofCommitment: Hex | false;
    try {
      proofCommitment = await verifier.verify(proof);
    } catch {
      return fail("VERIFIER_UNAVAILABLE");
    }
    if (!isNonZeroHex32(proofCommitment)) return fail("PROOF_INVALID");
    if (usedProofCommitments.has(proofCommitment.toLowerCase())) return fail("REPLAY");
    if (usedReplayCommitments.has(replayCommitment.toLowerCase())) return fail("REPLAY");
    if (proof.finalized !== true || web2JsonReplayCommitmentV1(proof).toLowerCase() !== replayCommitment.toLowerCase()
      || web2JsonInputCommitmentV1(proof).toLowerCase() !== inputCommitment.toLowerCase()) return fail("MALFORMED");
    return { ok: true, inputCommitment, proofCommitment };
  } catch {
    return fail("MALFORMED");
  }
}
