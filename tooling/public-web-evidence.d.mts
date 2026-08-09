export interface PublicWebEvidenceEntry {
  path: string;
  data: Record<string, unknown>;
}

export function assertPublicSafe(value: unknown, path?: string, field?: string): void;
export function collectPublicWebEvidence(repositoryRoot: string): Promise<PublicWebEvidenceEntry[]>;
export function buildPublicWebEvidenceManifest(entries: PublicWebEvidenceEntry[]): Record<string, unknown>;
export function createPublicWebEvidencePlugin(repositoryRoot: string): {
  name: string;
  apply: "build";
  generateBundle(this: { emitFile(file: { type: "asset"; fileName: string; source: string }): void }): Promise<void>;
};
