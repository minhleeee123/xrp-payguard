import type { PublicRequestReadiness, PublicRequestStatus } from "@xrp-payguard/integrations";

export const APP_VIEWS = ["studio", "vaults", "requests", "demo", "payee", "auditor", "team"] as const;
export type View = (typeof APP_VIEWS)[number];

const APP_VIEW_SET = new Set<string>(APP_VIEWS);
const LANDING_HASHES = new Set(["#landing", "#why", "#guardians", "#journey", "#use-cases", "#evidence", "#limits"]);

export type AppRoute =
  | { surface: "app"; view: View }
  | { surface: "landing"; anchor: string };

export function parseAppRoute(hash: string): AppRoute {
  const normalized = hash.trim().toLowerCase();
  if (LANDING_HASHES.has(normalized)) return { surface: "landing", anchor: normalized.slice(1) };
  if (normalized.startsWith("#app/")) {
    const candidate = normalized.slice(5);
    if (candidate === "overview") return { surface: "app", view: "demo" };
    if (APP_VIEW_SET.has(candidate)) return { surface: "app", view: candidate as View };
  }
  return { surface: "app", view: "demo" };
}

export function appViewHash(view: View): string {
  return `#app/${view}`;
}

export function requestStateLabels(status: PublicRequestStatus, readiness: PublicRequestReadiness): {
  canonical: string;
  timing: string;
  needsExpiryFinalization: boolean;
} {
  return {
    canonical: label(status),
    timing: label(readiness),
    needsExpiryFinalization: status !== "EXPIRED" && readiness === "EXPIRED",
  };
}

export function unixTimeHint(value: string): string | null {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const seconds = BigInt(value);
  if (seconds === 0n || seconds > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const date = new Date(Number(seconds) * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export function durationHint(value: string): string | null {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const seconds = BigInt(value);
  if (seconds === 0n) return "ad-hoc / disabled";
  const units: readonly [bigint, string][] = [[86_400n, "day"], [3_600n, "hour"], [60n, "minute"]];
  for (const [size, name] of units) {
    if (seconds % size !== 0n) continue;
    const count = seconds / size;
    return `${count} ${name}${count === 1n ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}
