import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ActionRequestV1, Hex, SpendStateV1 } from "@xrp-payguard/protocol";
import { getAddress, isAddress, zeroAddress } from "viem";
import { Relay, RelayCapacityError } from "./relay.js";
import type { EvaluationEnvelope, MachineDescriptor } from "./types.js";

const MAX_BODY_BYTES = 1_024 * 1_024;
const MAX_MACHINE_RESPONSE_BYTES = 512 * 1_024;
const DEFAULT_RATE_LIMIT_MAX = 30;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_MAX_TRACKED_CLIENTS = 1_024;
const FORBIDDEN_KEYS = new Set(["policy", "privateSalt", "ciphertext", "policyPlaintext", "allow", "decision", "publicReasonClass", "reservedAmount", "result"]);
const BIGINT_KEYS = new Set(["chainId", "requestNonce", "amount", "scheduleSlot", "createdAt", "graceDeadline", "expiry", "availableBalance", "accountedAt", "lastAccountingAt", "now", "timestamp", "value", "reservedAmount", "issuedAt", "policyNonce", "receiptNonce", "maxPerAction", "dailyCap", "rollingCap"]);

export interface RelayDomainBinding {
  chainId: bigint;
  registry: Hex;
  vault: Hex;
  router: Hex;
}

export interface RelayServerOptions {
  binding: RelayDomainBinding;
  rateLimit?: { maxRequests: number; windowMs: number };
  maxTrackedClients?: number;
  nowMs?: () => number;
  metrics?: { bearerToken: string };
}

interface RateWindow {
  startedAt: number;
  count: number;
}

export function createRelayServer(relay: Relay, options: RelayServerOptions): Server {
  const binding = normalizeBinding(options.binding);
  const rateLimit = normalizeRateLimit(options.rateLimit);
  const maxTrackedClients = positiveInteger(options.maxTrackedClients ?? DEFAULT_MAX_TRACKED_CLIENTS, "maxTrackedClients");
  const nowMs = options.nowMs ?? Date.now;
  const metricsToken = normalizeMetricsToken(options.metrics);
  const windows = new Map<string, RateWindow>();
  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/healthz") {
        return sendJson(response, 200, {
          status: "ok",
          service: "payguard-relay",
          version: "0.1.0",
          binding: { ...binding, chainId: binding.chainId.toString() },
          dependencyStatus: "not-probed",
          limits: { ...relay.healthBinding(), rateLimit },
        });
      }
      if (request.method === "GET" && request.url === "/metrics") {
        if (!metricsToken) return sendJson(response, 404, { error: "not found" });
        if (!authorizedMetricsRequest(request.headers.authorization, metricsToken)) {
          return sendJson(response, 401, { error: "metrics unavailable" }, { "www-authenticate": "Bearer" });
        }
        return sendText(response, 200, relay.prometheusMetrics(), "text/plain; version=0.0.4; charset=utf-8");
      }
      if (request.method !== "POST" || request.url !== "/v1/evaluate") return sendJson(response, 404, { error: "not found" });
      if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
        return sendJson(response, 415, { error: "content type must be application/json" });
      }
      const client = request.socket.remoteAddress ?? "unknown";
      if (!consumeRateLimit(windows, client, nowMs(), rateLimit, maxTrackedClients)) {
        return sendJson(response, 429, { error: "relay rate limit exceeded" }, { "retry-after": String(Math.ceil(rateLimit.windowMs / 1_000)) });
      }
      const body = await readBody(request);
      const payload = JSON.parse(body, bigintReviver) as unknown;
      rejectForbiddenKeys(payload);
      if (!isEvaluatePayload(payload)) return sendJson(response, 400, { error: "malformed public evaluation request" });
      if (!matchesBinding(payload.request, binding)) return sendJson(response, 422, { error: "request is outside the relay domain binding" });
      const outcome = await relay.evaluate(payload.request, payload.state, payload.machines);
      return sendJson(response, 200, outcome);
    } catch (error) {
      if (error instanceof RelayCapacityError) return sendJson(response, 503, { error: "relay capacity unavailable" });
      return sendJson(response, 400, { error: "relay request unavailable" });
    }
  });
}

export class HttpMachineTransport {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async evaluate(machine: MachineDescriptor, request: ActionRequestV1, state: SpendStateV1, signal: AbortSignal): Promise<EvaluationEnvelope> {
    const response = await this.fetcher(machine.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stringifyPublic({ request, state }),
      signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw new Error("machine unavailable");
    const body = await readBoundedMachineBody(response);
    const envelope = JSON.parse(body, bigintReviver) as unknown;
    if (!envelope || typeof envelope !== "object") throw new Error("machine result malformed");
    return envelope as EvaluationEnvelope;
  }
}

async function readBoundedMachineBody(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > MAX_MACHINE_RESPONSE_BYTES) throw new Error("machine result too large");
  if (!response.body) throw new Error("machine result missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MACHINE_RESPONSE_BYTES) throw new Error("machine result too large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

async function readBody(request: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  const body = stringifyPublic(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end(body);
}

function sendText(response: ServerResponse, status: number, body: string, contentType: string): void {
  response.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function stringifyPublic(value: unknown): string {
  return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item);
}

function bigintReviver(key: string, value: unknown): unknown {
  if (BIGINT_KEYS.has(key) && typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return value;
}

function rejectForbiddenKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) rejectForbiddenKeys(item);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error("private field rejected");
    rejectForbiddenKeys(item);
  }
}

function isEvaluatePayload(value: unknown): value is { request: ActionRequestV1; state: SpendStateV1; machines: MachineDescriptor[] } {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return !!payload.request && !!payload.state && Array.isArray(payload.machines) && payload.machines.length === 3;
}

function normalizeBinding(binding: RelayDomainBinding): RelayDomainBinding {
  if (binding.chainId !== 114n || !isAddress(binding.registry) || !isAddress(binding.vault) || !isAddress(binding.router)) {
    throw new Error("relay binding must be a valid Coston2 domain");
  }
  const registry = getAddress(binding.registry) as Hex;
  const vault = getAddress(binding.vault) as Hex;
  const router = getAddress(binding.router) as Hex;
  if ([registry, vault, router].some((address) => address === zeroAddress)) throw new Error("relay binding addresses must be non-zero");
  return { chainId: binding.chainId, registry, vault, router };
}

function normalizeRateLimit(value: RelayServerOptions["rateLimit"]): { maxRequests: number; windowMs: number } {
  return {
    maxRequests: positiveInteger(value?.maxRequests ?? DEFAULT_RATE_LIMIT_MAX, "rateLimit.maxRequests"),
    windowMs: positiveInteger(value?.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS, "rateLimit.windowMs"),
  };
}

function normalizeMetricsToken(value: RelayServerOptions["metrics"]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value.bearerToken !== "string" || value.bearerToken.length < 32 || value.bearerToken.length > 4_096
    || /[\r\n]/.test(value.bearerToken)) throw new Error("metrics bearer token is invalid");
  return value.bearerToken;
}

function authorizedMetricsRequest(authorization: string | undefined, token: string): boolean {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}

function consumeRateLimit(
  windows: Map<string, RateWindow>,
  client: string,
  now: number,
  limit: { maxRequests: number; windowMs: number },
  maxTrackedClients: number,
): boolean {
  if (!Number.isFinite(now)) return false;
  const existing = windows.get(client);
  if (!existing || now < existing.startedAt || now - existing.startedAt >= limit.windowMs) {
    if (!existing && windows.size >= maxTrackedClients) {
      const oldest = windows.keys().next().value as string | undefined;
      if (oldest) windows.delete(oldest);
    }
    windows.set(client, { startedAt: now, count: 1 });
    return true;
  }
  if (existing.count >= limit.maxRequests) return false;
  existing.count += 1;
  return true;
}

function matchesBinding(request: ActionRequestV1, binding: RelayDomainBinding): boolean {
  return request.chainId === binding.chainId
    && request.registry.toLowerCase() === binding.registry.toLowerCase()
    && request.vault.toLowerCase() === binding.vault.toLowerCase()
    && request.router.toLowerCase() === binding.router.toLowerCase();
}
