import {
  concatHex,
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  numberToHex,
  recoverMessageAddress,
  stringToHex,
} from "viem";
import { isIP } from "node:net";

import { COSTON2_CHAIN_ID } from "./fcc-foundation-registration.mjs";
import { PAYGUARD_EXTENSION_ID, PAYGUARD_FOUNDATION_SENDER } from "./fcc-code-version.mjs";

export const FOUNDATION_SCHEMA_VERSION = 1;
export const FOUNDATION_CODE_VERSION = keccak256(stringToHex("0.1.0-payguard"));
export const FOUNDATION_OP_TYPE = stringToHex("PAYGUARD", { size: 32 });
export const FOUNDATION_OP_COMMAND = stringToHex("PING_V1", { size: 32 });
export const TEE_ACTION_RESULT_PREFIX = stringToHex("TEE_ACTION_RESULT", { size: 32 });
export const PROXY_ACTION_RESULT_PREFIX = stringToHex("PROXY_ACTION_RESULT", { size: 32 });
export const FOUNDATION_DOMAIN = keccak256(stringToHex("PAYGUARD_FCC_FOUNDATION_V1"));

const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;
const signaturePattern = /^0x[0-9a-fA-F]{130}$/;
const halfCurveOrder = BigInt("0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0");
const responseType = {
  type: "tuple",
  components: [
    { name: "schemaVersion", type: "uint16" },
    { name: "chainId", type: "uint256" },
    { name: "sender", type: "address" },
    { name: "extensionId", type: "uint256" },
    { name: "codeVersion", type: "bytes32" },
    { name: "requestNonce", type: "bytes32" },
    { name: "payloadHash", type: "bytes32" },
    { name: "bindingHash", type: "bytes32" },
  ],
};

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} fields are not exact`);
}

function bytes32(value, label) {
  if (typeof value !== "string" || !bytes32Pattern.test(value) || /^0x0{64}$/i.test(value)) throw new Error(`${label} must be non-zero bytes32`);
  return value.toLowerCase();
}

function canonicalSignature(value, label) {
  if (typeof value !== "string" || !signaturePattern.test(value)) throw new Error(`${label} must be a 65-byte signature`);
  const r = BigInt(`0x${value.slice(2, 66)}`);
  const s = BigInt(`0x${value.slice(66, 130)}`);
  const v = Number.parseInt(value.slice(130, 132), 16);
  if (r === 0n || s === 0n || s > halfCurveOrder || ![0, 1].includes(v)) throw new Error(`${label} is non-canonical`);
  return value;
}

export function actionResultHash(result) {
  return keccak256(concatHex([
    keccak256(result.data),
    result.id,
    keccak256(stringToHex(result.submissionTag)),
    numberToHex(result.status, { size: 1 }),
  ]));
}

export function actionResultSigningDigest(resultHash, prefix) {
  return keccak256(encodeAbiParameters([
    { type: "tuple", components: [
      { name: "prefix", type: "bytes32" },
      { name: "chainId", type: "uint256" },
      { name: "dataHash", type: "bytes32" },
    ] },
  ], [{ prefix, chainId: BigInt(COSTON2_CHAIN_ID), dataHash: resultHash }]));
}

export function foundationBindingHash(response) {
  return keccak256(encodeAbiParameters([
    { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint16" },
    { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" },
    { type: "bytes32" }, { type: "bytes32" },
  ], [
    FOUNDATION_DOMAIN, FOUNDATION_OP_TYPE, FOUNDATION_OP_COMMAND, response.schemaVersion,
    response.chainId, response.sender, response.extensionId, response.codeVersion,
    response.requestNonce, response.payloadHash,
  ]));
}

function decodeFoundationResponse(data) {
  if (typeof data !== "string" || !isHex(data) || data === "0x" || data.length > 2048) throw new Error("foundation result data is invalid or oversized");
  let response;
  try {
    [response] = decodeAbiParameters([responseType], data, { strict: true });
  } catch (error) {
    throw new Error("foundation result data is not canonical ABI", { cause: error });
  }
  const canonical = encodeAbiParameters([responseType], [response]);
  if (canonical.toLowerCase() !== data.toLowerCase()) throw new Error("foundation result data is not canonical ABI");
  return response;
}

export async function verifyFoundationActionResponse(value, expected) {
  exactKeys(value, ["result", "signature", "proxySignature"], "action response");
  exactKeys(value.result, ["id", "submissionTag", "status", "log", "opType", "opCommand", "additionalResultStatus", "version", "data"], "action result");
  const result = value.result;
  if (bytes32(result.id, "action ID") !== bytes32(expected.instructionId, "expected instruction ID")) throw new Error("action ID mismatch");
  if (result.submissionTag !== "submit" || result.status !== 1 || result.log !== "ok") throw new Error("foundation action did not complete successfully");
  if (result.opType?.toLowerCase() !== FOUNDATION_OP_TYPE || result.opCommand?.toLowerCase() !== FOUNDATION_OP_COMMAND) throw new Error("foundation operation domain mismatch");
  if (result.additionalResultStatus !== "0x" || result.version !== "0.1.0-payguard") throw new Error("foundation result version or additional status mismatch");
  const response = decodeFoundationResponse(result.data);
  const expectedTee = getAddress(expected.teeId);
  const expectedProxy = getAddress(expected.proxyId);
  if (!isAddress(expectedTee) || !isAddress(expectedProxy) || expectedTee === expectedProxy) throw new Error("expected machine identities are invalid");
  const expectedNonce = bytes32(expected.requestNonce, "expected request nonce");
  const expectedPayload = bytes32(expected.payloadHash, "expected payload hash");
  if (
    Number(response.schemaVersion) !== FOUNDATION_SCHEMA_VERSION || response.chainId !== BigInt(COSTON2_CHAIN_ID)
      || getAddress(response.sender) !== PAYGUARD_FOUNDATION_SENDER || response.extensionId !== PAYGUARD_EXTENSION_ID
      || response.codeVersion.toLowerCase() !== FOUNDATION_CODE_VERSION || response.requestNonce.toLowerCase() !== expectedNonce
      || response.payloadHash.toLowerCase() !== expectedPayload
  ) throw new Error("foundation response binding mismatch");
  const bindingHash = foundationBindingHash(response);
  if (response.bindingHash.toLowerCase() !== bindingHash) throw new Error("foundation binding hash mismatch");
  const innerHash = actionResultHash(result);
  const teeDigest = actionResultSigningDigest(innerHash, TEE_ACTION_RESULT_PREFIX);
  const proxyDigest = actionResultSigningDigest(innerHash, PROXY_ACTION_RESULT_PREFIX);
  const [teeSigner, proxySigner] = await Promise.all([
    recoverMessageAddress({ message: { raw: teeDigest }, signature: canonicalSignature(value.signature, "TEE signature") }),
    recoverMessageAddress({ message: { raw: proxyDigest }, signature: canonicalSignature(value.proxySignature, "proxy signature") }),
  ]);
  if (teeSigner !== expectedTee || proxySigner !== expectedProxy) throw new Error("foundation result signer mismatch");
  return {
    status: "verified",
    instructionId: result.id.toLowerCase(),
    resultHash: innerHash,
    bindingHash,
    teeSigner,
    proxySigner,
    response: {
      schemaVersion: Number(response.schemaVersion), chainId: Number(response.chainId), sender: getAddress(response.sender),
      extensionId: response.extensionId.toString(), codeVersion: response.codeVersion.toLowerCase(),
      requestNonce: response.requestNonce.toLowerCase(), payloadHash: response.payloadHash.toLowerCase(),
    },
  };
}

export function encodeFoundationResponse(response) {
  return encodeAbiParameters([responseType], [response]);
}

function resultOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("result origin must be valid HTTPS"); }
  if (
    url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/"
      || url.search || url.hash || isIP(url.hostname) !== 0 || url.hostname === "localhost" || !url.hostname.includes(".")
  ) throw new Error("result origin must be a credential-free public HTTPS origin");
  return url.origin;
}

export async function pollAndVerifyFoundationResult({
  origin,
  expected,
  fetcher = fetch,
  attempts = 15,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const normalizedOrigin = resultOrigin(origin);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 30) throw new Error("result polling attempts must be between 1 and 30");
  const instructionId = bytes32(expected?.instructionId, "expected instruction ID");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetcher(`${normalizedOrigin}/action/result/${instructionId}`, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: { accept: "application/json" },
      });
    } catch (error) {
      throw new Error("FCC result endpoint request failed closed", { cause: error });
    }
    if ([202, 404].includes(response.status)) {
      if (attempt === attempts) throw new Error("FCC result was not ready within the bounded polling window");
      await delay(2_000);
      continue;
    }
    if (response.status !== 200) throw new Error(`FCC result endpoint returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") throw new Error("FCC result endpoint did not return application/json");
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > 512 * 1024) throw new Error("FCC result response exceeds the public envelope limit");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 512 * 1024) throw new Error("FCC result response is empty or oversized");
    let value;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch (error) {
      throw new Error("FCC result response is not strict UTF-8 JSON", { cause: error });
    }
    return verifyFoundationActionResponse(value, expected);
  }
  throw new Error("FCC result polling failed closed");
}
