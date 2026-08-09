export interface PublicWebEvidenceEntry {
  path: `/evidence/${string}`;
  suite: string;
  status: string;
  recordedAt: string | null;
  chainId: string | null;
  testnetOnly: boolean;
  noPrivateKeyRecorded: boolean;
  noCredentialRecorded: boolean;
  noPolicyPlaintextOrCiphertextRecorded: boolean;
}

export interface PublicWebEvidenceIndex {
  schemaVersion: 1;
  status: "AVAILABLE";
  testnetOnly: true;
  staticShellOnly: true;
  entries: readonly PublicWebEvidenceEntry[];
}

const INDEX_PATH = "/evidence/index.json";
const INDEX_FIELDS = new Set(["schemaVersion", "status", "testnetOnly", "staticShellOnly", "entries"]);
const ENTRY_FIELDS = new Set([
  "path", "suite", "status", "recordedAt", "chainId", "testnetOnly",
  "noPrivateKeyRecorded", "noCredentialRecorded", "noPolicyPlaintextOrCiphertextRecorded",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") throw new Error(`${field} must be a string or null`);
  return value;
}

function booleanField(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be boolean`);
  return value;
}

export function decodePublicWebEvidenceIndex(value: unknown): PublicWebEvidenceIndex {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.status !== "AVAILABLE"
    || value.testnetOnly !== true || value.staticShellOnly !== true || !Array.isArray(value.entries)) {
    throw new Error("public web evidence index is unavailable or unsupported");
  }
  if (Object.keys(value).some((key) => !INDEX_FIELDS.has(key))) throw new Error("public web evidence index has unknown fields");
  const entries = value.entries.map((candidate, index): PublicWebEvidenceEntry => {
    if (!isRecord(candidate) || typeof candidate.path !== "string"
      || !candidate.path.startsWith("/evidence/") || !candidate.path.endsWith(".json")
      || typeof candidate.suite !== "string" || typeof candidate.status !== "string") {
      throw new Error(`public web evidence entry ${index} is invalid`);
    }
    if (Object.keys(candidate).some((key) => !ENTRY_FIELDS.has(key))) throw new Error(`public web evidence entry ${index} has unknown fields`);
    return {
      path: candidate.path as `/evidence/${string}`,
      suite: candidate.suite,
      status: candidate.status,
      recordedAt: stringOrNull(candidate.recordedAt, `entry ${index} recordedAt`),
      chainId: stringOrNull(candidate.chainId, `entry ${index} chainId`),
      testnetOnly: booleanField(candidate.testnetOnly, `entry ${index} testnetOnly`),
      noPrivateKeyRecorded: booleanField(candidate.noPrivateKeyRecorded, `entry ${index} noPrivateKeyRecorded`),
      noCredentialRecorded: booleanField(candidate.noCredentialRecorded, `entry ${index} noCredentialRecorded`),
      noPolicyPlaintextOrCiphertextRecorded: booleanField(candidate.noPolicyPlaintextOrCiphertextRecorded, `entry ${index} noPolicyPlaintextOrCiphertextRecorded`),
    };
  });
  if (entries.some((entry) => !entry.testnetOnly || !entry.noPrivateKeyRecorded || !entry.noCredentialRecorded || !entry.noPolicyPlaintextOrCiphertextRecorded)) {
    throw new Error("public web evidence index contains an unsafe entry");
  }
  return { schemaVersion: 1, status: "AVAILABLE", testnetOnly: true, staticShellOnly: true, entries };
}

export async function fetchPublicWebEvidenceIndex(
  fetcher: typeof fetch = fetch,
  path = INDEX_PATH,
): Promise<PublicWebEvidenceIndex> {
  const response = await fetcher(path, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`public web evidence index returned HTTP ${response.status}`);
  return decodePublicWebEvidenceIndex(await response.json());
}

export { INDEX_PATH as PUBLIC_WEB_EVIDENCE_INDEX_PATH };
