import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIVE_MACHINE_SET,
  RETAINED_MACHINE_SET,
  STALE_MACHINE_C,
  evaluatePausePostcondition,
  evaluatePausePreflight,
} from "./fcc-stale-machine-pause.mjs";
import { PAYGUARD_EXTENSION_ID, PAYGUARD_EXTENSION_OWNER } from "./fcc-code-version.mjs";

const base = {
  chainId: 114,
  managerRuntimePresent: true,
  signer: PAYGUARD_EXTENSION_OWNER,
  owner: PAYGUARD_EXTENSION_OWNER,
  extensionId: PAYGUARD_EXTENSION_ID,
  status: 2,
  machine: { teeId: STALE_MACHINE_C, url: ACTIVE_MACHINE_SET[2].url },
  activeMachines: ACTIVE_MACHINE_SET,
  retainedStatuses: [2, 2, 2],
};

describe("guarded stale machine pause", () => {
  it("allows only the exact known pre-pause Coston2 state", () => {
    assert.equal(evaluatePausePreflight(base).status, "ready");
    for (const changed of [
      { ...base, chainId: 14 },
      { ...base, status: 3 },
      { ...base, activeMachines: RETAINED_MACHINE_SET },
      { ...base, retainedStatuses: [2, 1, 2] },
    ]) assert.equal(evaluatePausePreflight(changed).status, "failed");
  });

  it("requires C removed and exactly A/B/D retained in production", () => {
    assert.equal(evaluatePausePostcondition({ ...base, status: 3, activeMachines: RETAINED_MACHINE_SET }).status, "verified");
    assert.equal(evaluatePausePostcondition({ ...base, status: 3, activeMachines: ACTIVE_MACHINE_SET }).status, "failed");
    assert.equal(evaluatePausePostcondition({ ...base, status: 2, activeMachines: RETAINED_MACHINE_SET }).status, "failed");
  });
});
