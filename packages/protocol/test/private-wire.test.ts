import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { policyCommitment } from "../src/codec.js";
import { parsePrivatePolicyV1, privatePolicyBytesV1, serializePrivatePolicyV1 } from "../src/private-wire.js";
import type { PolicyV1 } from "../src/types.js";

const vector = JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/v1.json"), "utf8"));
const policy = {
  ...vector.policy,
  chainId: BigInt(vector.policy.chainId), maxPerAction: BigInt(vector.policy.maxPerAction),
  dailyCap: BigInt(vector.policy.dailyCap), rollingCap: BigInt(vector.policy.rollingCap),
  rollingWindowSeconds: BigInt(vector.policy.rollingWindowSeconds), startAt: BigInt(vector.policy.startAt),
  endAt: BigInt(vector.policy.endAt), scheduleIntervalSeconds: BigInt(vector.policy.scheduleIntervalSeconds),
  scheduleGraceSeconds: BigInt(vector.policy.scheduleGraceSeconds), cooldownSeconds: BigInt(vector.policy.cooldownSeconds),
  maxPriceAgeSeconds: BigInt(vector.policy.maxPriceAgeSeconds),
  fdcMinReceivedAmount: BigInt(vector.policy.fdcMinReceivedAmount),
  fdcMaxReceivedAmount: BigInt(vector.policy.fdcMaxReceivedAmount),
  maxFdcAgeSeconds: BigInt(vector.policy.maxFdcAgeSeconds),
} as PolicyV1;

describe("private POLICY_SCHEMA_V1 wire", () => {
  it("uses quoted decimals and preserves the policy commitment", () => {
    const serialized = serializePrivatePolicyV1(policy);
    expect(serialized).toContain('"chainId":"114"');
    expect(serialized).toContain('"rollingWindowSeconds":"86400"');
    expect(serialized).toContain('"privateSalt":"0x');
    expect(privatePolicyBytesV1(policy)).toEqual(new TextEncoder().encode(serialized));
    expect(policyCommitment(parsePrivatePolicyV1(serialized))).toBe(policyCommitment(policy));
  });

  it("rejects numeric bigints, unknown fields, and missing arrays", () => {
    const wire = JSON.parse(serializePrivatePolicyV1(policy));
    expect(() => parsePrivatePolicyV1(JSON.stringify({ ...wire, maxPerAction: 100 }))).toThrow(/canonical decimal/);
    expect(() => parsePrivatePolicyV1(JSON.stringify({ ...wire, unexpected: true }))).toThrow(/unknown or missing/);
    expect(() => parsePrivatePolicyV1(JSON.stringify({ ...wire, allowTargets: null }))).toThrow(/explicit array/);
  });
});
