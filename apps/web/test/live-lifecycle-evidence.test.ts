import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeLiveV2LifecycleEvidence, fetchLiveV2LifecycleEvidence } from "../src/live-lifecycle-evidence.js";

const source = JSON.parse(readFileSync(
  new URL("../../../evidence/coston2/fcc-hosted-relay-lifecycle.json", import.meta.url),
  "utf8",
)) as Record<string, unknown>;

describe("wallet-free live V2 lifecycle evidence", () => {
  it("accepts only the hosted V2 candidate lifecycle and preserves its release boundary", () => {
    const decoded = decodeLiveV2LifecycleEvidence(source);
    expect(decoded.liveCandidate).toBe(true);
    expect(decoded.machines).toHaveLength(3);
    expect(decoded.steps).toHaveLength(13);
    expect(decoded.denyReason).toBe("CAP_EXCEEDED");
    expect(decoded.afterAllow).toEqual(decoded.afterDeny);
    expect(decoded.afterAllow.deposited).toBe(decoded.afterAllow.available + decoded.afterAllow.spent);
  });

  it("rejects release, client-decision, quorum, and conservation drift", () => {
    const assertions = source.assertions as Record<string, unknown>;
    expect(() => decodeLiveV2LifecycleEvidence({ ...source, assertions: { ...assertions, hardwareAttestationVerified: true } })).toThrow(/limitation/);
    expect(() => decodeLiveV2LifecycleEvidence({ ...source, assertions: { ...assertions, clientDecisionAccepted: true } })).toThrow(/limitation/);
    const identifiers = source.publicIdentifiers as Record<string, unknown>;
    const allow = identifiers.allow as Record<string, unknown>;
    expect(() => decodeLiveV2LifecycleEvidence({ ...source, publicIdentifiers: { ...identifiers, allow: { ...allow, submit: [] } } })).toThrow(/threshold/);
    const accounting = identifiers.accounting as Record<string, unknown>;
    const afterDeny = accounting.afterDeny as Record<string, unknown>;
    expect(() => decodeLiveV2LifecycleEvidence({ ...source, publicIdentifiers: { ...identifiers, accounting: { ...accounting, afterDeny: { ...afterDeny, available: "1" } } } })).toThrow(/conservation|transition/);
  });

  it("fetches only the supported same-origin evidence body", async () => {
    const decoded = await fetchLiveV2LifecycleEvidence(async () => new Response(JSON.stringify(source), { status: 200 }));
    expect(decoded.observedBlock).toBe(33_919_084n);
    await expect(fetchLiveV2LifecycleEvidence(async () => new Response("", { status: 404 }))).rejects.toThrow(/HTTP 404/);
  });
});
