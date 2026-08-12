import { describe, expect, it } from "vitest";
import { ZERO_BYTES32 } from "@xrp-payguard/protocol";
import {
  STUDIO_TEMPLATES,
  StudioValidationError,
  compileStudioDraft,
  createStudioEntropy,
  normalizeStudioAddress,
  studioTemplateDraft,
  validateStudioDraft,
  type StudioEntropy,
} from "../src/model.js";

const entropy: StudioEntropy = {
  privateSalt: `0x${"11".repeat(32)}`,
  submissionNonce: `0x${"22".repeat(32)}`,
};

describe("Policy Studio authoring model", () => {
  it("provides distinct, copy-on-read templates", () => {
    expect(STUDIO_TEMPLATES.map((template) => template.id)).toEqual([
      "personal-recurring",
      "delegated-allowance",
      "treasury-vendor",
    ]);
    const first = studioTemplateDraft("personal-recurring");
    first.policyName = "changed";
    expect(studioTemplateDraft("personal-recurring").policyName).toBe("weekly-subscription");
    expect(studioTemplateDraft("delegated-allowance").scheduleIntervalSeconds).toBe("0");
  });

  it("compiles an exact domain-bound commitment with a separated data map", () => {
    const result = compileStudioDraft(studioTemplateDraft("personal-recurring"), entropy);
    const repeated = compileStudioDraft(studioTemplateDraft("personal-recurring"), entropy);
    expect(result.publicEvidence.policyCommitment).toBe(repeated.publicEvidence.policyCommitment);
    expect(result.publicEvidence.chainId).toBe("114");
    expect(result.publicEvidence.custodyThreshold).toBe(3);
    expect(result.publicAtActivation.map((item) => item.label)).toContain("Contract domain");
    expect(result.publicAtRequest.map((item) => item.label)).toContain("Target, asset, and amount");
    expect(result.privateInFcc.map((item) => item.label)).toContain("Per-action / daily cap");

    const publicJson = JSON.stringify(result.publicEvidence);
    expect(publicJson).not.toContain(entropy.privateSalt);
    expect(publicJson).not.toContain(entropy.submissionNonce);
    expect(publicJson).not.toContain("weekly-subscription");
    expect(publicJson).not.toContain(result.policy.asset);
  });

  it("converts human FTestXRP amounts and freezes the delegated requester privately", () => {
    const requester = "0x00000000000000000000000000000000000000b2";
    const draft = { ...studioTemplateDraft("delegated-allowance"), requester, maxPerAction: "0.1", dailyCap: "0.25" };
    const result = compileStudioDraft(draft, entropy);
    expect(result.policy.maxPerAction).toBe(100_000n);
    expect(result.policy.dailyCap).toBe(250_000n);
    expect(result.policy.allowRequesters).toEqual([requester]);
    expect(JSON.stringify(result.publicEvidence)).not.toContain(requester);
  });

  it("changes the commitment when ephemeral private entropy changes", () => {
    const draft = studioTemplateDraft("personal-recurring");
    const first = compileStudioDraft(draft, entropy);
    const second = compileStudioDraft(draft, { ...entropy, privateSalt: `0x${"33".repeat(32)}` });
    expect(first.publicEvidence.policyCommitment).not.toBe(second.publicEvidence.policyCommitment);
  });

  it("uses two independent non-zero 32-byte entropy values", () => {
    let counter = 0;
    const generated = createStudioEntropy((bytes) => {
      counter += 1;
      bytes.fill(counter);
      return bytes;
    });
    expect(generated.privateSalt).toBe(`0x${"01".repeat(32)}`);
    expect(generated.submissionNonce).toBe(`0x${"02".repeat(32)}`);
    expect(generated.privateSalt).not.toBe(ZERO_BYTES32);
  });

  it("reports field-specific address, amount, cap, time, and schedule failures", () => {
    const invalid = {
      ...studioTemplateDraft("personal-recurring"),
      owner: "not-an-address",
      requester: "not-an-address",
      maxPerAction: "-1",
      dailyCap: "50",
      startAt: "1000",
      endAt: "1000",
      scheduleIntervalSeconds: "60",
      scheduleGraceSeconds: "60",
    };
    const issues = validateStudioDraft(invalid);
    expect(issues.map((issue) => issue.field)).toEqual(expect.arrayContaining([
      "owner", "requester", "maxPerAction", "endAt", "scheduleGraceSeconds",
    ]));
    expect(() => compileStudioDraft(invalid, entropy)).toThrow(StudioValidationError);
  });

  it("rejects zero deployment addresses and unsafe entropy", () => {
    const zeroDomain = { ...studioTemplateDraft("personal-recurring"), registry: "0x0000000000000000000000000000000000000000" };
    expect(validateStudioDraft(zeroDomain).some((issue) => issue.field === "registry")).toBe(true);
    expect(() => compileStudioDraft(studioTemplateDraft("personal-recurring"), { ...entropy, privateSalt: ZERO_BYTES32 })).toThrow(/private salt/);
    expect(() => compileStudioDraft(studioTemplateDraft("personal-recurring"), { ...entropy, submissionNonce: entropy.privateSalt })).toThrow(/distinct/);
    expect(() => normalizeStudioAddress("not-an-address")).toThrow();
  });
});
