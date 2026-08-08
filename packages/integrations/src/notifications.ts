import { encodeAbiParameters, keccak256, stringToHex, zeroHash, type Hex } from "viem";

const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_NOTIFICATIONS = 256;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

export const PUBLIC_NOTIFICATION_V1 = keccak256(stringToHex("PUBLIC_NOTIFICATION_V1"));
export const PUBLIC_NOTIFICATION_EXPORT_V1 = keccak256(stringToHex("PUBLIC_NOTIFICATION_EXPORT_V1"));

export type PublicNotificationKind =
  | "REQUEST_READY"
  | "REQUEST_DENIED"
  | "REQUEST_EXECUTED"
  | "REQUEST_EXPIRED"
  | "VAULT_STOPPED"
  | "FUNDING_DELAYED"
  | "EVIDENCE_VERIFIED";

export type PublicNotificationSeverity = "INFO" | "WARNING";

export type NotificationUnavailableReason =
  | "RPC_UNCONFIGURED"
  | "RPC_UNAVAILABLE"
  | "FEED_UNFINALIZED"
  | "FEED_INVALID";

export interface PublicNotificationV1 {
  schema: Hex;
  chainId: bigint;
  eventId: Hex;
  kind: PublicNotificationKind;
  severity: PublicNotificationSeverity;
  reference: Hex;
  requestId: Hex;
  blockNumber: bigint;
  observedAt: bigint;
  notificationHash: Hex;
}

export interface PublicNotificationWireV1 {
  schema: Hex;
  chainId: string;
  eventId: Hex;
  kind: PublicNotificationKind;
  severity: PublicNotificationSeverity;
  reference: Hex;
  requestId: Hex;
  blockNumber: string;
  observedAt: string;
  notificationHash: Hex;
}

export interface PublicNotificationFeedV1 {
  schema: Hex;
  chainId: bigint;
  generatedAt: bigint;
  notifications: PublicNotificationV1[];
  feedHash: Hex;
}

export interface PublicNotificationFeedWireV1 {
  schema: Hex;
  chainId: string;
  generatedAt: string;
  notifications: PublicNotificationWireV1[];
  feedHash: Hex;
}

export interface PublicNotificationAvailableState {
  status: "READY";
  feed: PublicNotificationFeedV1;
  publicFacts: true;
}

export interface PublicNotificationUnavailableState {
  status: "UNAVAILABLE";
  reason: NotificationUnavailableReason;
  publicFacts: false;
}

export type PublicNotificationReadState = PublicNotificationAvailableState | PublicNotificationUnavailableState;

export interface PublicNotificationExportV1 {
  schema: Hex;
  chainId: bigint;
  generatedAt: bigint;
  exportedAt: bigint;
  status: "AVAILABLE" | "UNAVAILABLE";
  reason: NotificationUnavailableReason | null;
  notifications: PublicNotificationV1[];
  feedHash: Hex;
  exportHash: Hex;
}

export interface PublicNotificationExportWireV1 {
  schema: Hex;
  chainId: string;
  generatedAt: string;
  exportedAt: string;
  status: "AVAILABLE" | "UNAVAILABLE";
  reason: NotificationUnavailableReason | null;
  notifications: PublicNotificationWireV1[];
  feedHash: Hex;
  exportHash: Hex;
}

const NOTIFICATION_FIELDS = new Set<keyof PublicNotificationWireV1>([
  "schema", "chainId", "eventId", "kind", "severity", "reference", "requestId", "blockNumber", "observedAt", "notificationHash",
]);
const FEED_FIELDS = new Set<keyof PublicNotificationFeedWireV1>(["schema", "chainId", "generatedAt", "notifications", "feedHash"]);
const EXPORT_FIELDS = new Set<keyof PublicNotificationExportWireV1>([
  "schema", "chainId", "generatedAt", "exportedAt", "status", "reason", "notifications", "feedHash", "exportHash",
]);
const KINDS = new Set<PublicNotificationKind>([
  "REQUEST_READY", "REQUEST_DENIED", "REQUEST_EXECUTED", "REQUEST_EXPIRED", "VAULT_STOPPED", "FUNDING_DELAYED", "EVIDENCE_VERIFIED",
]);
const SEVERITIES = new Set<PublicNotificationSeverity>(["INFO", "WARNING"]);
const STATUSES = new Set<PublicNotificationExportV1["status"]>(["AVAILABLE", "UNAVAILABLE"]);
const REASONS = new Set<NotificationUnavailableReason>(["RPC_UNCONFIGURED", "RPC_UNAVAILABLE", "FEED_UNFINALIZED", "FEED_INVALID"]);
const KIND_CODES: Record<PublicNotificationKind, number> = {
  REQUEST_READY: 0,
  REQUEST_DENIED: 1,
  REQUEST_EXECUTED: 2,
  REQUEST_EXPIRED: 3,
  VAULT_STOPPED: 4,
  FUNDING_DELAYED: 5,
  EVIDENCE_VERIFIED: 6,
};
const SEVERITY_CODES: Record<PublicNotificationSeverity, number> = { INFO: 0, WARNING: 1 };
const STATUS_CODES: Record<PublicNotificationExportV1["status"], number> = { AVAILABLE: 0, UNAVAILABLE: 1 };
const REASON_CODES: Record<NotificationUnavailableReason, number> = {
  RPC_UNCONFIGURED: 1,
  RPC_UNAVAILABLE: 2,
  FEED_UNFINALIZED: 3,
  FEED_INVALID: 4,
};

type NotificationBody = Omit<PublicNotificationV1, "schema" | "notificationHash">;

export function publicNotificationHash(body: NotificationBody): Hex {
  validateNotificationBody(body);
  return keccak256(encodeAbiParameters(
    [
      { type: "bytes32" }, { type: "uint256" }, { type: "bytes32" }, { type: "uint8" }, { type: "uint8" },
      { type: "bytes32" }, { type: "bytes32" }, { type: "uint64" }, { type: "uint64" },
    ],
    [
      PUBLIC_NOTIFICATION_V1, body.chainId, body.eventId, KIND_CODES[body.kind], SEVERITY_CODES[body.severity],
      body.reference, body.requestId, body.blockNumber, body.observedAt,
    ],
  ));
}

export function decodePublicNotification(value: unknown): PublicNotificationV1 {
  const record = objectWithFields(value, NOTIFICATION_FIELDS, "notification");
  const schema = bytes32(record.schema, "schema");
  if (schema !== PUBLIC_NOTIFICATION_V1) throw new Error("unsupported public notification schema");
  const body: NotificationBody = {
    chainId: quotedUint(record.chainId, "chainId", MAX_UINT256),
    eventId: nonZeroBytes32(record.eventId, "eventId"),
    kind: enumValue(record.kind, KINDS, "kind"),
    severity: enumValue(record.severity, SEVERITIES, "severity"),
    reference: nonZeroBytes32(record.reference, "reference"),
    requestId: bytes32(record.requestId, "requestId"),
    blockNumber: quotedUint(record.blockNumber, "blockNumber", MAX_UINT64),
    observedAt: quotedUint(record.observedAt, "observedAt", MAX_UINT64),
  };
  validateNotificationBody(body);
  const notificationHash = nonZeroBytes32(record.notificationHash, "notificationHash");
  if (notificationHash !== publicNotificationHash(body)) throw new Error("notification hash mismatch");
  return { schema: PUBLIC_NOTIFICATION_V1, ...body, notificationHash };
}

export function encodePublicNotification(notification: PublicNotificationV1): PublicNotificationWireV1 {
  const canonical = decodePublicNotification({
    schema: notification.schema,
    chainId: notification.chainId.toString(),
    eventId: notification.eventId,
    kind: notification.kind,
    severity: notification.severity,
    reference: notification.reference,
    requestId: notification.requestId,
    blockNumber: notification.blockNumber.toString(),
    observedAt: notification.observedAt.toString(),
    notificationHash: notification.notificationHash,
  });
  return {
    schema: canonical.schema,
    chainId: canonical.chainId.toString(),
    eventId: canonical.eventId,
    kind: canonical.kind,
    severity: canonical.severity,
    reference: canonical.reference,
    requestId: canonical.requestId,
    blockNumber: canonical.blockNumber.toString(),
    observedAt: canonical.observedAt.toString(),
    notificationHash: canonical.notificationHash,
  };
}

export function publicNotificationFeedHash(input: Omit<PublicNotificationFeedV1, "feedHash">): Hex {
  validateFeedInput(input);
  const hashes = input.notifications.map((notification) => notification.notificationHash.toLowerCase() as Hex).sort();
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes32[]" }],
    [PUBLIC_NOTIFICATION_V1, input.chainId, input.generatedAt, hashes],
  ));
}

export function decodePublicNotificationFeed(value: unknown): PublicNotificationFeedV1 {
  const record = objectWithFields(value, FEED_FIELDS, "notification feed");
  const schema = bytes32(record.schema, "schema");
  if (schema !== PUBLIC_NOTIFICATION_V1) throw new Error("unsupported public notification feed schema");
  const chainId = quotedUint(record.chainId, "chainId", MAX_UINT256);
  if (chainId === 0n) throw new Error("chainId must be non-zero");
  const generatedAt = quotedUint(record.generatedAt, "generatedAt", MAX_UINT64);
  if (!Array.isArray(record.notifications) || record.notifications.length > MAX_NOTIFICATIONS) {
    throw new Error("notification feed size is invalid");
  }
  const notifications = record.notifications.map((notification, index) => {
    try {
      const decoded = decodePublicNotification(notification);
      if (decoded.chainId !== chainId) throw new Error("chain mismatch");
      if (decoded.observedAt > generatedAt) throw new Error("notification is newer than feed");
      return decoded;
    } catch (error) {
      throw new Error(`notifications[${index}] invalid: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  });
  assertUniqueNotifications(notifications);
  const feedHash = nonZeroBytes32(record.feedHash, "feedHash");
  if (feedHash !== publicNotificationFeedHash({ schema: PUBLIC_NOTIFICATION_V1, chainId, generatedAt, notifications })) {
    throw new Error("notification feed hash mismatch");
  }
  return { schema: PUBLIC_NOTIFICATION_V1, chainId, generatedAt, notifications: sortPublicNotifications(notifications), feedHash };
}

export function encodePublicNotificationFeed(feed: PublicNotificationFeedV1): PublicNotificationFeedWireV1 {
  const canonical = decodePublicNotificationFeed({
    schema: feed.schema,
    chainId: feed.chainId.toString(),
    generatedAt: feed.generatedAt.toString(),
    notifications: feed.notifications.map(encodePublicNotification),
    feedHash: feed.feedHash,
  });
  return {
    schema: canonical.schema,
    chainId: canonical.chainId.toString(),
    generatedAt: canonical.generatedAt.toString(),
    notifications: canonical.notifications.map(encodePublicNotification),
    feedHash: canonical.feedHash,
  };
}

export function buildPublicNotificationFeed(input: Omit<PublicNotificationFeedV1, "schema" | "feedHash">): PublicNotificationFeedV1 {
  const notifications = sortPublicNotifications(input.notifications.map((notification) => decodePublicNotification(encodePublicNotification(notification))));
  const body = { schema: PUBLIC_NOTIFICATION_V1, chainId: input.chainId, generatedAt: input.generatedAt, notifications };
  const feed = { ...body, feedHash: publicNotificationFeedHash(body) };
  return decodePublicNotificationFeed(encodePublicNotificationFeed(feed));
}

export function publicNotificationReadState(feed: PublicNotificationFeedV1): PublicNotificationAvailableState {
  return { status: "READY", feed: decodePublicNotificationFeed(encodePublicNotificationFeed(feed)), publicFacts: true };
}

export function unavailableNotificationState(reason: NotificationUnavailableReason = "RPC_UNCONFIGURED"): PublicNotificationUnavailableState {
  return { status: "UNAVAILABLE", reason, publicFacts: false };
}

export function buildPublicNotificationExport(feed: PublicNotificationFeedV1, exportedAt: bigint): PublicNotificationExportV1 {
  const canonicalFeed = decodePublicNotificationFeed(encodePublicNotificationFeed(feed));
  if (exportedAt < canonicalFeed.generatedAt || exportedAt > MAX_UINT64) throw new Error("exportedAt is outside feed range");
  const body = {
    schema: PUBLIC_NOTIFICATION_EXPORT_V1,
    chainId: canonicalFeed.chainId,
    generatedAt: canonicalFeed.generatedAt,
    exportedAt,
    status: "AVAILABLE" as const,
    reason: null,
    notifications: canonicalFeed.notifications,
    feedHash: canonicalFeed.feedHash,
  };
  const result = { ...body, exportHash: publicNotificationExportHash(body) };
  return decodePublicNotificationExport(encodePublicNotificationExport(result));
}

export function buildUnavailableNotificationExport(reason: NotificationUnavailableReason, exportedAt: bigint): PublicNotificationExportV1 {
  if (!REASONS.has(reason) || exportedAt < 0n || exportedAt > MAX_UINT64) throw new Error("invalid unavailable export");
  const body = {
    schema: PUBLIC_NOTIFICATION_EXPORT_V1,
    chainId: 0n,
    generatedAt: 0n,
    exportedAt,
    status: "UNAVAILABLE" as const,
    reason,
    notifications: [] as PublicNotificationV1[],
    feedHash: zeroHash,
  };
  const result = { ...body, exportHash: publicNotificationExportHash(body) };
  return decodePublicNotificationExport(encodePublicNotificationExport(result));
}

export function publicNotificationExportHash(input: Omit<PublicNotificationExportV1, "exportHash">): Hex {
  validateExportBody(input);
  const hashes = input.notifications.map((notification) => notification.notificationHash.toLowerCase() as Hex).sort();
  const reasonCode = input.reason === null ? 0 : REASON_CODES[input.reason];
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }, { type: "uint8" }, { type: "uint8" }, { type: "bytes32" }, { type: "bytes32[]" }],
    [PUBLIC_NOTIFICATION_EXPORT_V1, input.chainId, input.generatedAt, input.exportedAt, STATUS_CODES[input.status], reasonCode, input.feedHash, hashes],
  ));
}

export function decodePublicNotificationExport(value: unknown): PublicNotificationExportV1 {
  const record = objectWithFields(value, EXPORT_FIELDS, "notification export");
  const schema = bytes32(record.schema, "schema");
  if (schema !== PUBLIC_NOTIFICATION_EXPORT_V1) throw new Error("unsupported public notification export schema");
  const chainId = quotedUint(record.chainId, "chainId", MAX_UINT256);
  const generatedAt = quotedUint(record.generatedAt, "generatedAt", MAX_UINT64);
  const exportedAt = quotedUint(record.exportedAt, "exportedAt", MAX_UINT64);
  if (generatedAt > exportedAt) throw new Error("generatedAt is newer than export");
  const status = enumValue(record.status, STATUSES, "status");
  const reason = record.reason === null ? null : enumValue(record.reason, REASONS, "reason");
  const feedHash = bytes32(record.feedHash, "feedHash");
  if (status === "AVAILABLE" && (reason !== null || chainId === 0n || feedHash === zeroHash)) throw new Error("available export is incomplete");
  if (status === "UNAVAILABLE" && (reason === null || chainId !== 0n || generatedAt !== 0n || feedHash !== zeroHash)) throw new Error("unavailable export must contain no feed");
  if (!Array.isArray(record.notifications) || record.notifications.length > MAX_NOTIFICATIONS) throw new Error("notification export size is invalid");
  const notifications = record.notifications.map((notification, index) => {
    try {
      return decodePublicNotification(notification);
    } catch (error) {
      throw new Error(`notifications[${index}] invalid: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  });
  if (status === "UNAVAILABLE" && notifications.length > 0) throw new Error("unavailable export cannot contain notifications");
  assertUniqueNotifications(notifications);
  if (status === "AVAILABLE") {
    decodePublicNotificationFeed(encodePublicNotificationFeed({ schema: PUBLIC_NOTIFICATION_V1, chainId, generatedAt, notifications, feedHash }));
  }
  const body = { schema: PUBLIC_NOTIFICATION_EXPORT_V1, chainId, generatedAt, exportedAt, status, reason, notifications, feedHash };
  const exportHash = nonZeroBytes32(record.exportHash, "exportHash");
  if (exportHash !== publicNotificationExportHash(body)) throw new Error("notification export hash mismatch");
  return { ...body, notifications: sortPublicNotifications(notifications), exportHash };
}

export function encodePublicNotificationExport(exportValue: PublicNotificationExportV1): PublicNotificationExportWireV1 {
  const canonical = decodePublicNotificationExport({
    schema: exportValue.schema,
    chainId: exportValue.chainId.toString(),
    generatedAt: exportValue.generatedAt.toString(),
    exportedAt: exportValue.exportedAt.toString(),
    status: exportValue.status,
    reason: exportValue.reason,
    notifications: exportValue.notifications.map(encodePublicNotification),
    feedHash: exportValue.feedHash,
    exportHash: exportValue.exportHash,
  });
  return {
    schema: canonical.schema,
    chainId: canonical.chainId.toString(),
    generatedAt: canonical.generatedAt.toString(),
    exportedAt: canonical.exportedAt.toString(),
    status: canonical.status,
    reason: canonical.reason,
    notifications: canonical.notifications.map(encodePublicNotification),
    feedHash: canonical.feedHash,
    exportHash: canonical.exportHash,
  };
}

function validateNotificationBody(body: NotificationBody): void {
  if (body.chainId <= 0n || body.chainId > MAX_UINT256) throw new Error("chainId is out of range");
  if (body.blockNumber === 0n || body.blockNumber > MAX_UINT64) throw new Error("blockNumber is out of range");
  if (body.observedAt === 0n || body.observedAt > MAX_UINT64) throw new Error("observedAt is out of range");
  if (body.kind === "REQUEST_READY" || body.kind === "REQUEST_DENIED" || body.kind === "REQUEST_EXECUTED" || body.kind === "REQUEST_EXPIRED") {
    if (body.requestId === zeroHash) throw new Error("request notification requires requestId");
  } else if (body.requestId !== zeroHash) {
    throw new Error("non-request notification cannot contain requestId");
  }
  const expectedSeverity: PublicNotificationSeverity = body.kind === "REQUEST_DENIED" || body.kind === "REQUEST_EXPIRED"
    || body.kind === "VAULT_STOPPED" || body.kind === "FUNDING_DELAYED" ? "WARNING" : "INFO";
  if (body.severity !== expectedSeverity) throw new Error("notification severity does not match kind");
}

function validateFeedInput(input: Omit<PublicNotificationFeedV1, "feedHash">): void {
  if (input.schema !== PUBLIC_NOTIFICATION_V1) throw new Error("unsupported public notification feed schema");
  if (input.chainId === 0n || input.chainId > MAX_UINT256) throw new Error("chainId is out of range");
  if (input.generatedAt > MAX_UINT64) throw new Error("generatedAt is out of range");
  if (input.notifications.length > MAX_NOTIFICATIONS) throw new Error("notification feed size is invalid");
  assertUniqueNotifications(input.notifications);
  for (const notification of input.notifications) {
    if (notification.schema !== PUBLIC_NOTIFICATION_V1) throw new Error("notification schema mismatch");
    if (notification.chainId !== input.chainId) throw new Error("notification chain mismatch");
    if (notification.observedAt > input.generatedAt) throw new Error("notification is newer than feed");
    if (notification.notificationHash !== publicNotificationHash(notification)) throw new Error("notification hash mismatch");
  }
}

function validateExportBody(input: Omit<PublicNotificationExportV1, "exportHash">): void {
  if (input.schema !== PUBLIC_NOTIFICATION_EXPORT_V1) throw new Error("unsupported public notification export schema");
  if (input.chainId < 0n || input.chainId > MAX_UINT256 || input.generatedAt < 0n || input.generatedAt > MAX_UINT64) throw new Error("export feed metadata is out of range");
  if (input.exportedAt < 0n || input.exportedAt > MAX_UINT64) throw new Error("exportedAt is out of range");
  if (input.generatedAt > input.exportedAt) throw new Error("generatedAt is newer than export");
  if (input.status === "AVAILABLE") {
    if (input.reason !== null || input.chainId === 0n || input.feedHash === zeroHash) throw new Error("available export is incomplete");
  } else if (input.reason === null || input.chainId !== 0n || input.generatedAt !== 0n || input.feedHash !== zeroHash || input.notifications.length !== 0) {
    throw new Error("unavailable export must contain no feed");
  }
  if (input.notifications.length > MAX_NOTIFICATIONS) throw new Error("notification export size is invalid");
  assertUniqueNotifications(input.notifications);
  for (const notification of input.notifications) {
    if (notification.notificationHash !== publicNotificationHash(notification)) throw new Error("notification hash mismatch");
  }
  if (input.status === "AVAILABLE") {
    decodePublicNotificationFeed(encodePublicNotificationFeed({ schema: PUBLIC_NOTIFICATION_V1, chainId: input.chainId, generatedAt: input.generatedAt, notifications: input.notifications, feedHash: input.feedHash }));
  }
}

function assertUniqueNotifications(notifications: readonly PublicNotificationV1[]): void {
  const eventIds = new Set<string>();
  const hashes = new Set<string>();
  for (const notification of notifications) {
    const eventId = notification.eventId.toLowerCase();
    const hash = notification.notificationHash.toLowerCase();
    if (eventIds.has(eventId) || hashes.has(hash)) throw new Error("duplicate public notification");
    eventIds.add(eventId);
    hashes.add(hash);
  }
}

function sortPublicNotifications(notifications: readonly PublicNotificationV1[]): PublicNotificationV1[] {
  return [...notifications].sort((left, right) => {
    if (left.observedAt !== right.observedAt) return left.observedAt > right.observedAt ? -1 : 1;
    if (left.blockNumber !== right.blockNumber) return left.blockNumber > right.blockNumber ? -1 : 1;
    return left.eventId.toLowerCase().localeCompare(right.eventId.toLowerCase());
  });
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

function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new Error(`${label} is unsupported`);
  return value as T;
}
