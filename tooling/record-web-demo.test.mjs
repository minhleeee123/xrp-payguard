import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEMO_ORIGIN,
  DEMO_OUTPUT,
  isExpectedDemoFaviconFailure,
  parseDemoCLI,
  verifyDemoManifest,
} from "./record-web-demo.mjs";

const entry = (path, chainId = "114") => ({
  path,
  chainId,
  testnetOnly: true,
  noPrivateKeyRecorded: true,
  noCredentialRecorded: true,
  noPolicyPlaintextOrCiphertextRecorded: true,
});

function manifest() {
  const coston2 = Array.from({ length: 22 }, (_, index) => entry(`/evidence/coston2/${index}.json`));
  return {
    schemaVersion: 1,
    status: "AVAILABLE",
    testnetOnly: true,
    staticShellOnly: true,
    entries: [
      ...coston2,
      entry("/evidence/simulation/coston2-simulated-policy-lifecycle-2026-08-09.json"),
      entry("/evidence/simulation/coston2-interactive-demo-deployment-2026-08-10.json"),
      entry("/evidence/simulation/fcc-local-three-machine-2026-08-09.json", null),
    ],
  };
}

describe("public web demo recorder", () => {
  it("pins the production origin and ignored local output", () => {
    assert.equal(DEMO_ORIGIN, "https://xrp-payguard.vercel.app");
    assert.match(DEMO_OUTPUT, /^evidence\/local\/[^/]+\.mp4$/);
    assert.deepEqual(parseDemoCLI(["record"]), { overwrite: false });
    assert.deepEqual(parseDemoCLI(["record", "--overwrite"]), { overwrite: true });
    assert.throws(() => parseDemoCLI([]), /usage/);
    assert.throws(() => parseDemoCLI(["record", "--output", ".env"]), /usage/);
  });

  it("accepts only the exact public-safe reviewed manifest baseline", () => {
    assert.deepEqual(verifyDemoManifest(manifest()), { entries: 25, chain114: 24, simulations: 3 });
    assert.throws(() => verifyDemoManifest({ ...manifest(), staticShellOnly: false }), /unsafe/);
    const unsafe = manifest();
    unsafe.entries[0] = { ...unsafe.entries[0], noCredentialRecorded: false };
    assert.throws(() => verifyDemoManifest(unsafe), /unsafe/);
    const missing = manifest();
    missing.entries.pop();
    assert.throws(() => verifyDemoManifest(missing), /baseline/);
  });

  it("ignores only Chrome's exact raw-JSON favicon fallback", () => {
    assert.equal(isExpectedDemoFaviconFailure(404, `${DEMO_ORIGIN}/favicon.ico`), true);
    assert.equal(isExpectedDemoFaviconFailure(500, `${DEMO_ORIGIN}/favicon.ico`), false);
    assert.equal(isExpectedDemoFaviconFailure(404, `${DEMO_ORIGIN}/evidence/index.json`), false);
    assert.equal(isExpectedDemoFaviconFailure(404, "https://example.com/favicon.ico"), false);
  });
});
