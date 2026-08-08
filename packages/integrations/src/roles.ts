import { encodeAbiParameters, getAddress, isAddress, keccak256, stringToHex, zeroAddress, zeroHash, type Hex } from "viem";

const MAX_UINT32 = (1n << 32n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const ROLE_DOMAIN = keccak256(stringToHex("PAYGUARD_ROLE_ASSIGNMENT_V1"));

export type WorkspaceRole = "OWNER" | "POLICY_AUTHOR" | "FUNDER" | "EXECUTOR" | "PAYEE" | "AUDITOR";
export type WorkspaceUnavailableReason = "RPC_UNCONFIGURED" | "RPC_UNAVAILABLE" | "REGISTRY_UNFINALIZED" | "REGISTRY_INVALID";

export interface PublicRoleAssignmentV1 {
  account: Hex;
  role: WorkspaceRole;
  active: boolean;
  assignmentNonce: bigint;
}

export interface PublicWorkspaceSnapshotV1 {
  chainId: bigint;
  workspaceId: Hex;
  owner: Hex;
  version: number;
  roles: PublicRoleAssignmentV1[];
  roleHash: Hex;
}

export interface PublicRoleAssignmentWireV1 {
  account: Hex;
  role: WorkspaceRole;
  active: boolean;
  assignmentNonce: string;
}

export interface PublicWorkspaceSnapshotWireV1 {
  chainId: string;
  workspaceId: Hex;
  owner: Hex;
  version: string;
  roles: PublicRoleAssignmentWireV1[];
  roleHash: Hex;
}

export interface WorkspacePermissionsV1 {
  canCreatePolicy: boolean;
  canFund: boolean;
  canExecute: boolean;
  canViewPayee: boolean;
  canAudit: boolean;
  canEmergencyStop: boolean;
  canAuthorize: false;
}

export interface PublicWorkspaceAvailableState {
  status: "READY";
  snapshot: PublicWorkspaceSnapshotV1;
  publicFacts: true;
}

export interface PublicWorkspaceUnavailableState {
  status: "UNAVAILABLE";
  reason: WorkspaceUnavailableReason;
  publicFacts: false;
}

export type PublicWorkspaceReadState = PublicWorkspaceAvailableState | PublicWorkspaceUnavailableState;

const WIRE_FIELDS = new Set<keyof PublicWorkspaceSnapshotWireV1>(["chainId", "workspaceId", "owner", "version", "roles", "roleHash"]);
const ROLE_FIELDS = new Set<keyof PublicRoleAssignmentWireV1>(["account", "role", "active", "assignmentNonce"]);
const ROLES = new Set<WorkspaceRole>(["OWNER", "POLICY_AUTHOR", "FUNDER", "EXECUTOR", "PAYEE", "AUDITOR"]);
const ROLE_CODES: Record<WorkspaceRole, number> = { OWNER: 0, POLICY_AUTHOR: 1, FUNDER: 2, EXECUTOR: 3, PAYEE: 4, AUDITOR: 5 };

export function roleAssignmentHash(assignment: PublicRoleAssignmentV1): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "address" }, { type: "uint8" }, { type: "bool" }, { type: "uint64" }],
    [ROLE_DOMAIN, assignment.account, ROLE_CODES[assignment.role], assignment.active, assignment.assignmentNonce],
  ));
}

export function workspaceRoleHash(snapshot: Omit<PublicWorkspaceSnapshotV1, "roleHash">): Hex {
  const assignmentHashes = snapshot.roles.map(roleAssignmentHash).sort();
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }, { type: "bytes32" }, { type: "address" }, { type: "uint32" }, { type: "bytes32[]" }],
    [ROLE_DOMAIN, snapshot.chainId, snapshot.workspaceId, snapshot.owner, snapshot.version, assignmentHashes],
  ));
}

export function decodePublicWorkspaceSnapshot(value: unknown): PublicWorkspaceSnapshotV1 {
  const record = objectWithFields(value, WIRE_FIELDS, "workspace");
  const chainId = quotedUint(record.chainId, "chainId", (1n << 256n) - 1n);
  if (chainId === 0n) throw new Error("chainId must be non-zero");
  const workspaceId = nonZeroBytes32(record.workspaceId, "workspaceId");
  const owner = publicAddress(record.owner, "owner");
  const version = Number(quotedUint(record.version, "version", MAX_UINT32));
  if (version === 0) throw new Error("workspace version must be non-zero");
  if (!Array.isArray(record.roles) || record.roles.length === 0 || record.roles.length > 64) throw new Error("workspace roles invalid");
  const roles = record.roles.map((value, index) => decodeRole(value, `roles[${index}]`));
  const keys = new Set<string>();
  for (const role of roles) {
    const key = `${role.account.toLowerCase()}:${role.role}`;
    if (keys.has(key)) throw new Error("duplicate workspace role assignment");
    keys.add(key);
  }
  if (!roles.some((role) => role.account.toLowerCase() === owner.toLowerCase() && role.role === "OWNER" && role.active)) {
    throw new Error("active owner assignment missing");
  }
  const roleHash = nonZeroBytes32(record.roleHash, "roleHash");
  const expectedHash = workspaceRoleHash({ chainId, workspaceId, owner, version, roles });
  if (roleHash.toLowerCase() !== expectedHash.toLowerCase()) throw new Error("workspace role hash mismatch");
  return { chainId, workspaceId, owner, version, roles, roleHash };
}

export function encodePublicWorkspaceSnapshot(snapshot: PublicWorkspaceSnapshotV1): PublicWorkspaceSnapshotWireV1 {
  const wire: PublicWorkspaceSnapshotWireV1 = {
    chainId: snapshot.chainId.toString(), workspaceId: snapshot.workspaceId, owner: snapshot.owner, version: snapshot.version.toString(),
    roles: snapshot.roles.map((role) => ({ account: role.account, role: role.role, active: role.active, assignmentNonce: role.assignmentNonce.toString() })),
    roleHash: snapshot.roleHash,
  };
  decodePublicWorkspaceSnapshot(wire);
  return wire;
}

export function workspacePermissions(snapshot: PublicWorkspaceSnapshotV1, account: Hex): WorkspacePermissionsV1 {
  const normalized = publicAddress(account, "account");
  const isOwner = snapshot.owner.toLowerCase() === normalized.toLowerCase()
    && snapshot.roles.some((role) => role.account.toLowerCase() === normalized.toLowerCase() && role.role === "OWNER" && role.active);
  const activeRoles = new Set(snapshot.roles.filter((role) => role.active && role.account.toLowerCase() === normalized.toLowerCase()).map((role) => role.role));
  const has = (role: WorkspaceRole): boolean => isOwner || activeRoles.has(role);
  return {
    canCreatePolicy: has("POLICY_AUTHOR"), canFund: has("FUNDER"), canExecute: has("EXECUTOR"), canViewPayee: has("PAYEE"),
    canAudit: has("AUDITOR"), canEmergencyStop: isOwner, canAuthorize: false,
  };
}

export function publicWorkspaceReadState(snapshot: PublicWorkspaceSnapshotV1): PublicWorkspaceAvailableState {
  const canonical = decodePublicWorkspaceSnapshot(encodePublicWorkspaceSnapshot(snapshot));
  return { status: "READY", snapshot: canonical, publicFacts: true };
}

export function unavailableWorkspaceState(reason: WorkspaceUnavailableReason = "RPC_UNCONFIGURED"): PublicWorkspaceUnavailableState {
  return { status: "UNAVAILABLE", reason, publicFacts: false };
}

function decodeRole(value: unknown, label: string): PublicRoleAssignmentV1 {
  const record = objectWithFields(value, ROLE_FIELDS, label);
  const account = publicAddress(record.account, `${label}.account`);
  const role = enumValue(record.role, ROLES, `${label}.role`);
  if (typeof record.active !== "boolean") throw new Error(`${label}.active must be boolean`);
  const assignmentNonce = quotedUint(record.assignmentNonce, `${label}.assignmentNonce`, MAX_UINT64);
  return { account, role, active: record.active, assignmentNonce };
}

function objectWithFields(value: unknown, allowed: ReadonlySet<string>, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new Error(`unknown public ${label} field: ${key}`);
  for (const key of allowed) if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`missing public ${label} field: ${key}`);
  return record;
}

function quotedUint(value: unknown, label: string, max: bigint): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new Error(`${label} must be a quoted unsigned decimal`);
  const parsed = BigInt(value);
  if (parsed > max) throw new Error(`${label} exceeds supported range`);
  return parsed;
}

function bytes32(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !HEX32.test(value)) throw new Error(`${label} must be bytes32`);
  return value.toLowerCase() as Hex;
}

function nonZeroBytes32(value: unknown, label: string): Hex {
  const parsed = bytes32(value, label);
  if (parsed === zeroHash) throw new Error(`${label} must be non-zero bytes32`);
  return parsed;
}

function publicAddress(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isAddress(value) || getAddress(value) === zeroAddress) throw new Error(`${label} must be a non-zero address`);
  return getAddress(value) as Hex;
}

function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new Error(`${label} is unsupported`);
  return value as T;
}
