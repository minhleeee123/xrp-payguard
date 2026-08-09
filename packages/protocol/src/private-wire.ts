import { hexToBytes, type Hex } from "viem";
import { normalizePolicy } from "./codec.js";
import type { PolicyV1 } from "./types.js";

const fields = [
  "schemaVersion", "chainId", "registry", "vault", "router", "owner", "policyId",
  "policyVersion", "asset", "referenceCurrency", "maxPerAction", "dailyCap",
  "rollingCap", "rollingWindowSeconds", "startAt", "endAt", "scheduleIntervalSeconds",
  "scheduleGraceSeconds", "cooldownSeconds", "maxOccurrences", "allowTargets",
  "denyTargets", "allowRequesters", "allowActionTypes", "requireFtso", "ftsoFeedId",
  "maxPriceAgeSeconds",
  "requireFdc", "fdcAttestationType", "fdcSourceId", "fdcSourceAddressHash",
  "fdcReceivingAddressHash", "fdcMemoMode", "fdcRequireDestinationTag",
  "fdcDestinationTag", "fdcMinReceivedAmount", "fdcMaxReceivedAmount",
  "maxFdcAgeSeconds", "fdcConsumer", "privateSalt", "submissionNonce",
] as const;

type PrivatePolicyField = (typeof fields)[number];
type PrivatePolicyWireV1 = Record<PrivatePolicyField, unknown>;

const decimal = (value: bigint): string => value.toString(10);

export function serializePrivatePolicyV1(policy: PolicyV1): string {
  const value = normalizePolicy(policy);
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    chainId: decimal(value.chainId),
    registry: value.registry,
    vault: value.vault,
    router: value.router,
    owner: value.owner,
    policyId: value.policyId,
    policyVersion: value.policyVersion,
    asset: value.asset,
    referenceCurrency: value.referenceCurrency,
    maxPerAction: decimal(value.maxPerAction),
    dailyCap: decimal(value.dailyCap),
    rollingCap: decimal(value.rollingCap),
    rollingWindowSeconds: decimal(value.rollingWindowSeconds),
    startAt: decimal(value.startAt),
    endAt: decimal(value.endAt),
    scheduleIntervalSeconds: decimal(value.scheduleIntervalSeconds),
    scheduleGraceSeconds: decimal(value.scheduleGraceSeconds),
    cooldownSeconds: decimal(value.cooldownSeconds),
    maxOccurrences: value.maxOccurrences,
    allowTargets: value.allowTargets,
    denyTargets: value.denyTargets,
    allowRequesters: value.allowRequesters,
    allowActionTypes: value.allowActionTypes,
    requireFtso: value.requireFtso,
    ftsoFeedId: value.ftsoFeedId,
    maxPriceAgeSeconds: decimal(value.maxPriceAgeSeconds),
    requireFdc: value.requireFdc,
    fdcAttestationType: value.fdcAttestationType,
    fdcSourceId: value.fdcSourceId,
    fdcSourceAddressHash: value.fdcSourceAddressHash,
    fdcReceivingAddressHash: value.fdcReceivingAddressHash,
    fdcMemoMode: value.fdcMemoMode,
    fdcRequireDestinationTag: value.fdcRequireDestinationTag,
    fdcDestinationTag: value.fdcDestinationTag,
    fdcMinReceivedAmount: decimal(value.fdcMinReceivedAmount),
    fdcMaxReceivedAmount: decimal(value.fdcMaxReceivedAmount),
    maxFdcAgeSeconds: decimal(value.maxFdcAgeSeconds),
    fdcConsumer: value.fdcConsumer,
    privateSalt: value.privateSalt,
    submissionNonce: value.submissionNonce,
  } satisfies PrivatePolicyWireV1);
}

export function privatePolicyBytesV1(policy: PolicyV1): Uint8Array {
  return new TextEncoder().encode(serializePrivatePolicyV1(policy));
}

export function parsePrivatePolicyV1(serialized: string): PolicyV1 {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("encrypted policy plaintext must be JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("encrypted policy plaintext must be an object");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== fields.length || Object.keys(record).some((key) => !fields.includes(key as PrivatePolicyField))) {
    throw new Error("encrypted policy plaintext has unknown or missing fields");
  }
  const quoted = (key: PrivatePolicyField): bigint => {
    const item = record[key];
    if (typeof item !== "string" || !/^(0|[1-9][0-9]*)$/.test(item)) throw new Error(`${key} must be a canonical decimal string`);
    return BigInt(item);
  };
  const number = (key: PrivatePolicyField): number => {
    const item = record[key];
    if (!Number.isInteger(item) || (item as number) < 0) throw new Error(`${key} must be an unsigned integer`);
    return item as number;
  };
  const hex = (key: PrivatePolicyField): Hex => {
    const item = record[key];
    if (typeof item !== "string" || !/^0x[0-9a-fA-F]+$/.test(item) || hexToBytes(item as Hex).length === 0) throw new Error(`${key} must be hex`);
    return item as Hex;
  };
  const list = (key: PrivatePolicyField): Hex[] => {
    const item = record[key];
    if (!Array.isArray(item)) throw new Error(`${key} must be an explicit array`);
    return item.map((entry) => {
      if (typeof entry !== "string" || !/^0x[0-9a-fA-F]+$/.test(entry)) throw new Error(`${key} contains non-hex data`);
      return entry as Hex;
    });
  };
  if (typeof record.requireFtso !== "boolean") throw new Error("requireFtso must be boolean");
  if (typeof record.requireFdc !== "boolean") throw new Error("requireFdc must be boolean");
  if (typeof record.fdcRequireDestinationTag !== "boolean") throw new Error("fdcRequireDestinationTag must be boolean");
  return normalizePolicy({
    schemaVersion: number("schemaVersion"), chainId: quoted("chainId"), registry: hex("registry"),
    vault: hex("vault"), router: hex("router"), owner: hex("owner"), policyId: hex("policyId"),
    policyVersion: number("policyVersion"), asset: hex("asset"), referenceCurrency: hex("referenceCurrency"),
    maxPerAction: quoted("maxPerAction"), dailyCap: quoted("dailyCap"), rollingCap: quoted("rollingCap"),
    rollingWindowSeconds: quoted("rollingWindowSeconds"), startAt: quoted("startAt"), endAt: quoted("endAt"),
    scheduleIntervalSeconds: quoted("scheduleIntervalSeconds"), scheduleGraceSeconds: quoted("scheduleGraceSeconds"),
    cooldownSeconds: quoted("cooldownSeconds"), maxOccurrences: number("maxOccurrences"),
    allowTargets: list("allowTargets"), denyTargets: list("denyTargets"), allowRequesters: list("allowRequesters"),
    allowActionTypes: list("allowActionTypes"), requireFtso: record.requireFtso, ftsoFeedId: hex("ftsoFeedId"),
    maxPriceAgeSeconds: quoted("maxPriceAgeSeconds"), privateSalt: hex("privateSalt"), submissionNonce: hex("submissionNonce"),
    requireFdc: record.requireFdc, fdcAttestationType: hex("fdcAttestationType"), fdcSourceId: hex("fdcSourceId"),
    fdcSourceAddressHash: hex("fdcSourceAddressHash"), fdcReceivingAddressHash: hex("fdcReceivingAddressHash"),
    fdcMemoMode: number("fdcMemoMode"), fdcRequireDestinationTag: record.fdcRequireDestinationTag,
    fdcDestinationTag: number("fdcDestinationTag"), fdcMinReceivedAmount: quoted("fdcMinReceivedAmount"),
    fdcMaxReceivedAmount: quoted("fdcMaxReceivedAmount"), maxFdcAgeSeconds: quoted("maxFdcAgeSeconds"),
    fdcConsumer: hex("fdcConsumer"),
  });
}
