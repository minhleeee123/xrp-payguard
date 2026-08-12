import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("V2 deployment copy boundary", () => {
  it("uses V2 for every active live surface and confines V1 to protocol, rollback, or legacy sandbox copy", () => {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    const landing = readFileSync(new URL("../src/landing.ts", import.meta.url), "utf8");
    const model = readFileSync(new URL("../src/model.ts", import.meta.url), "utf8");
    const combined = `${landing}\n${main}\n${model}`;
    expect(combined).toContain("V2 LIVE CANDIDATE");
    expect(combined).toContain("LIVE FCC · COSTON2 V2");
    expect(combined).toContain("LEGACY V1 SANDBOX");
    expect(combined).toContain("HISTORICAL V1 SIMULATION EVIDENCE");
    expect(combined).not.toMatch(/LIVE FCC · COSTON2 V1|LIVE V1 ·|Use live V1 domain|Live V1 policy|V1 operator connected|Create V1 request|Fund V1 vault/);
    expect(main).not.toContain("fetchInteractiveDemoConfig");
    expect(combined).toContain("POLICY_SCHEMA_V1");
  });
});
