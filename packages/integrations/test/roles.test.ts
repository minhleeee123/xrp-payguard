import { describe, expect, it } from "vitest";
import { padHex, stringToHex, type Hex } from "viem";
import {
  decodePublicWorkspaceSnapshot,
  encodePublicWorkspaceSnapshot,
  unavailableWorkspaceState,
  workspacePermissions,
  workspaceRoleHash,
  type PublicRoleAssignmentV1,
} from "../src/roles.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const owner = "0x0000000000000000000000000000000000000012" as Hex;
const executor = "0x0000000000000000000000000000000000000013" as Hex;
const auditor = "0x0000000000000000000000000000000000000014" as Hex;
const assignments: PublicRoleAssignmentV1[] = [
  { account: owner, role: "OWNER", active: true, assignmentNonce: 1n },
  { account: executor, role: "EXECUTOR", active: true, assignmentNonce: 2n },
  { account: auditor, role: "AUDITOR", active: true, assignmentNonce: 3n },
];
const body = { chainId: 114n, workspaceId: id("workspace"), owner, version: 1, roles: assignments };
const baseWire = {
  chainId: "114", workspaceId: body.workspaceId, owner, version: "1",
  roles: assignments.map((assignment) => ({ ...assignment, assignmentNonce: assignment.assignmentNonce.toString() })),
  roleHash: workspaceRoleHash(body),
};

describe("public workspace role assignments", () => {
  it("round-trips canonical role state and never grants authorization", () => {
    const decoded = decodePublicWorkspaceSnapshot(baseWire);
    expect(encodePublicWorkspaceSnapshot(decoded)).toEqual(baseWire);
    expect(workspacePermissions(decoded, owner)).toMatchObject({ canCreatePolicy: true, canFund: true, canExecute: true, canEmergencyStop: true, canAuthorize: false });
    expect(workspacePermissions(decoded, executor)).toMatchObject({ canExecute: true, canCreatePolicy: false, canAuthorize: false });
    expect(workspacePermissions(decoded, auditor)).toMatchObject({ canAudit: true, canExecute: false, canAuthorize: false });
  });

  it("rejects private fields, duplicate roles, owner loss, numeric nonces, and hash drift", () => {
    expect(() => decodePublicWorkspaceSnapshot({ ...baseWire, policy: "private" })).toThrow(/unknown public workspace field/);
    expect(() => decodePublicWorkspaceSnapshot({ ...baseWire, roles: [...baseWire.roles, baseWire.roles[1]] })).toThrow(/duplicate/);
    expect(() => decodePublicWorkspaceSnapshot({ ...baseWire, roles: baseWire.roles.map((role) => role.role === "OWNER" ? { ...role, active: false } : role) })).toThrow(/owner/);
    expect(() => decodePublicWorkspaceSnapshot({ ...baseWire, roles: baseWire.roles.map((role) => ({ ...role, assignmentNonce: Number(role.assignmentNonce) })) })).toThrow(/quoted/);
    expect(() => decodePublicWorkspaceSnapshot({ ...baseWire, roleHash: id("forged") })).toThrow(/hash/);
  });

  it("represents an unconfigured workspace registry without inventing permissions", () => {
    expect(unavailableWorkspaceState()).toEqual({ status: "UNAVAILABLE", reason: "RPC_UNCONFIGURED", publicFacts: false });
    expect(unavailableWorkspaceState("REGISTRY_INVALID").publicFacts).toBe(false);
  });
});
