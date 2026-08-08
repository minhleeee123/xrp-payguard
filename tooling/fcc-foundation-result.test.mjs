import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex } from "viem";

import {
  actionResultHash,
  actionResultSigningDigest,
  encodeFoundationResponse,
  FOUNDATION_CODE_VERSION,
  FOUNDATION_OP_COMMAND,
  FOUNDATION_OP_TYPE,
  foundationBindingHash,
  pollAndVerifyFoundationResult,
  PROXY_ACTION_RESULT_PREFIX,
  TEE_ACTION_RESULT_PREFIX,
  verifyFoundationActionResponse,
} from "./fcc-foundation-result.mjs";
import { PAYGUARD_EXTENSION_ID, PAYGUARD_FOUNDATION_SENDER } from "./fcc-code-version.mjs";

async function fixture() {
  const tee = privateKeyToAccount(toHex(Uint8Array.from({ length: 32 }, (_, index) => index + 1)));
  const proxy = privateKeyToAccount(toHex(Uint8Array.from({ length: 32 }, (_, index) => index + 33)));
  const instructionId = keccak256(toHex("instruction"));
  const requestNonce = keccak256(toHex("nonce"));
  const payloadHash = keccak256(toHex("payload"));
  const response = {
    schemaVersion: 1, chainId: 114n, sender: PAYGUARD_FOUNDATION_SENDER, extensionId: PAYGUARD_EXTENSION_ID,
    codeVersion: FOUNDATION_CODE_VERSION, requestNonce, payloadHash, bindingHash: `0x${"00".repeat(32)}`,
  };
  response.bindingHash = foundationBindingHash(response);
  const result = {
    id: instructionId, submissionTag: "submit", status: 1, log: "ok", opType: FOUNDATION_OP_TYPE,
    opCommand: FOUNDATION_OP_COMMAND, additionalResultStatus: "0x", version: "0.1.0-payguard",
    data: encodeFoundationResponse(response),
  };
  const innerHash = actionResultHash(result);
  const teeEthereumSignature = await tee.signMessage({ message: { raw: actionResultSigningDigest(innerHash, TEE_ACTION_RESULT_PREFIX) } });
  const proxyEthereumSignature = await proxy.signMessage({ message: { raw: actionResultSigningDigest(innerHash, PROXY_ACTION_RESULT_PREFIX) } });
  const goStyleRecoveryByte = (signature) => `${signature.slice(0, -2)}${(Number.parseInt(signature.slice(-2), 16) - 27).toString(16).padStart(2, "0")}`;
  return {
    expected: { instructionId, requestNonce, payloadHash, teeId: tee.address, proxyId: proxy.address },
    value: {
      result,
      signature: goStyleRecoveryByte(teeEthereumSignature),
      proxySignature: goStyleRecoveryByte(proxyEthereumSignature),
    },
  };
}

test("verifies exact PayGuard response and both pinned FCC signing domains", async () => {
  const { value, expected } = await fixture();
  const verified = await verifyFoundationActionResponse(value, expected);
  assert.equal(verified.status, "verified");
  assert.equal(verified.teeSigner, expected.teeId);
  assert.equal(verified.proxySigner, expected.proxyId);
  assert.equal(verified.response.payloadHash, expected.payloadHash);
});

test("fails closed on result, binding, signer, and schema drift", async () => {
  const cases = [
    async ({ value }) => { value.result.status = 0; },
    async ({ value }) => { value.result.submissionTag = "threshold"; },
    async ({ value }) => { value.result.opCommand = FOUNDATION_OP_TYPE; },
    async ({ value }) => { value.result.version = "other"; },
    async ({ expected }) => { expected.payloadHash = keccak256(toHex("wrong")); },
    async ({ value }) => { value.proxySignature = value.signature; },
    async ({ value }) => { value.result.data = `${value.result.data}00`; },
    async ({ value }) => { value.extra = true; },
  ];
  for (const mutate of cases) {
    const item = await fixture();
    await mutate(item);
    await assert.rejects(() => verifyFoundationActionResponse(item.value, item.expected));
  }
});

test("rejects high-S and malformed signatures before recovery", async () => {
  const { value, expected } = await fixture();
  value.signature = `0x${"11".repeat(32)}${"ff".repeat(32)}00`;
  await assert.rejects(() => verifyFoundationActionResponse(value, expected), /non-canonical/);
  value.signature = "0x1234";
  await assert.rejects(() => verifyFoundationActionResponse(value, expected), /65-byte/);
});

test("polls only a bounded strict HTTPS JSON result path", async () => {
  const { value, expected } = await fixture();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push([url, options]);
    if (calls.length === 1) return new Response("", { status: 404 });
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  };
  const verified = await pollAndVerifyFoundationResult({ origin: "https://machine.example/", expected, fetcher, attempts: 2, delay: async () => {} });
  assert.equal(verified.status, "verified");
  assert.equal(calls[1][0], `https://machine.example/action/result/${expected.instructionId}`);
  assert.equal(calls[1][1].redirect, "error");
  await assert.rejects(() => pollAndVerifyFoundationResult({ origin: "https://machine.example/path", expected, fetcher }));
  await assert.rejects(() => pollAndVerifyFoundationResult({ origin: "https://127.0.0.1", expected, fetcher }));
});

test("poller fails closed on timeout, content type, and body bounds", async () => {
  const { value, expected } = await fixture();
  await assert.rejects(() => pollAndVerifyFoundationResult({
    origin: "https://machine.example", expected, attempts: 1,
    fetcher: async () => new Response("", { status: 202 }), delay: async () => {},
  }), /bounded polling window/);
  await assert.rejects(() => pollAndVerifyFoundationResult({
    origin: "https://machine.example", expected,
    fetcher: async () => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "text/plain" } }),
  }), /application\/json/);
  await assert.rejects(() => pollAndVerifyFoundationResult({
    origin: "https://machine.example", expected,
    fetcher: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json", "content-length": "600000" } }),
  }), /exceeds/);
});
