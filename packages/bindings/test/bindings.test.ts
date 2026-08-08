import { describe, expect, it } from "vitest";
import { PayGuardActionRouterAbi, PayGuardPolicyRegistryAbi, PayGuardVaultAbi } from "../src/index.js";

const names = (abi: readonly unknown[]) => new Set(abi.flatMap((item) => {
  if (typeof item !== "object" || item === null) return [];
  const name = (item as { name?: unknown }).name;
  return typeof name === "string" ? [name] : [];
}));

describe("generated PayGuard bindings", () => {
  it("expose the frozen public state-machine surface", () => {
    for (const name of ["registerMachine", "registerPolicy", "getPolicy"]) expect(names(PayGuardPolicyRegistryAbi).has(name)).toBe(true);
    for (const name of ["deposit", "reserve", "release", "execute"]) expect(names(PayGuardVaultAbi).has(name)).toBe(true);
    for (const name of ["createRequest", "submitEvaluation", "execute", "expire"]) expect(names(PayGuardActionRouterAbi).has(name)).toBe(true);
  });

  it("contain no private policy fields", () => {
    const serialized = JSON.stringify([PayGuardActionRouterAbi, PayGuardPolicyRegistryAbi, PayGuardVaultAbi]);
    expect(serialized).not.toContain("privateSalt");
    expect(serialized).not.toContain("ciphertext");
    expect(serialized).not.toContain("policyPlaintext");
  });
});
