import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  array,
  exact,
  liveHeader,
  nonEmpty,
  parsePlanVerifyCLI,
  readJson,
  record,
  timestamp,
} from "./candidate-public.mjs";

export const REQUIRED_OUTAGE_DRILLS = [
  "one-fcc-unavailable",
  "two-fcc-unavailable",
  "all-fcc-unavailable",
  "fdc-unavailable",
  "ftso-unavailable-or-stale",
  "fassets-unavailable",
  "smart-account-unavailable",
  "rpc-unavailable",
  "relay-unavailable",
  "restart-supported-identity",
  "restart-unsupported-identity",
];

export function validateOutageDrillEvidence(value) {
  const evidence = liveHeader(value, "payguard-coston2-v2-outage-drills");
  const drills = array(evidence.drills, "drills", REQUIRED_OUTAGE_DRILLS.length);
  const seen = new Set();
  for (const [index, item] of drills.entries()) {
    const drill = record(item, `drills[${index}]`);
    const id = nonEmpty(drill.id, `drills[${index}].id`);
    if (!REQUIRED_OUTAGE_DRILLS.includes(id) || seen.has(id)) throw new Error(`drills[${index}].id is unknown or duplicate`);
    seen.add(id);
    exact(drill.liveFaultInjected, true, `drills[${index}].liveFaultInjected`);
    exact(drill.failClosed, true, `drills[${index}].failClosed`);
    exact(drill.mockSuccessObserved, false, `drills[${index}].mockSuccessObserved`);
    if (!["no-execution", "deny", "unavailable"].includes(drill.observedOutcome)) throw new Error(`drills[${index}].observedOutcome is invalid`);
    timestamp(drill.startedAt, `drills[${index}].startedAt`);
    timestamp(drill.recoveredAt, `drills[${index}].recoveredAt`);
    exact(drill.recoveryVerified, true, `drills[${index}].recoveryVerified`);
    nonEmpty(drill.publicCheckpoint, `drills[${index}].publicCheckpoint`);
  }
  for (const id of REQUIRED_OUTAGE_DRILLS) if (!seen.has(id)) throw new Error(`missing outage drill ${id}`);
  const assertions = record(evidence.assertions, "assertions");
  for (const key of ["sameRelease", "noMockFallback", "noUnsupportedIdentityRestore", "canonicalStatePreserved", "noPrivateMaterial"]) {
    exact(assertions[key], true, `assertions.${key}`);
  }
  return { status: "verified", drills: drills.length };
}

export function outageDrillPlan() {
  return {
    status: "planned",
    verified: false,
    network: "flare-coston2",
    requiredDrills: REQUIRED_OUTAGE_DRILLS,
    command: "pnpm candidate:outage:verify -- <public-evidence.json>",
    rule: "Each real fault must fail closed, recover explicitly, and produce only public-safe checkpoints",
  };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const cli = parsePlanVerifyCLI(process.argv.slice(2));
    console.log(JSON.stringify(cli.mode === "plan" ? outageDrillPlan() : validateOutageDrillEvidence(await readJson(resolve(cli.path)))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
