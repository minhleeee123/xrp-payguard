import { describe, expect, it } from "vitest";
import { decodePublicWebEvidenceIndex, fetchPublicWebEvidenceIndex, type PublicWebEvidenceIndex } from "../src/web-evidence.js";

const entry = {
  path: "/evidence/coston2/example.json",
  suite: "example",
  status: "PASS",
  recordedAt: "2026-08-09T00:00:00Z",
  chainId: "114",
  testnetOnly: true,
  noPrivateKeyRecorded: true,
  noCredentialRecorded: true,
  noPolicyPlaintextOrCiphertextRecorded: true,
} as const;

const index: PublicWebEvidenceIndex = {
  schemaVersion: 1,
  status: "AVAILABLE",
  testnetOnly: true,
  staticShellOnly: true,
  entries: [entry],
};

describe("public web evidence index", () => {
  it("accepts only testnet, public-safe entries", () => {
    expect(decodePublicWebEvidenceIndex(index)).toEqual(index);
    expect(() => decodePublicWebEvidenceIndex({ ...index, testnetOnly: false })).toThrow(/unavailable/);
    expect(() => decodePublicWebEvidenceIndex({ ...index, entries: [{ ...entry, path: "/private/key.json" }] })).toThrow(/invalid/);
    expect(() => decodePublicWebEvidenceIndex({ ...index, entries: [{ ...entry, noCredentialRecorded: false }] })).toThrow(/unsafe/);
  });

  it("rejects unsupported fields at the entry boundary", () => {
    expect(() => decodePublicWebEvidenceIndex({ ...index, entries: [{ ...entry, ciphertext: "x" }] })).toThrow(/unknown|unsafe|invalid/);
  });

  it("fetches and decodes the same-origin index without asserting live execution", async () => {
    const observed: { path: string | undefined; accept: string | undefined } = { path: undefined, accept: undefined };
    const result = await fetchPublicWebEvidenceIndex(async (path, init) => {
      observed.path = String(path);
      observed.accept = new Headers(init?.headers).get("accept") ?? undefined;
      return new Response(JSON.stringify(index), { status: 200, headers: { "content-type": "application/json" } });
    });
    expect(result.entries).toHaveLength(1);
    expect(observed).toEqual({ path: "/evidence/index.json", accept: "application/json" });
    await expect(fetchPublicWebEvidenceIndex(async () => new Response("", { status: 503 }))).rejects.toThrow(/HTTP 503/);
  });
});
