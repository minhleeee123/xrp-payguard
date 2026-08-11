import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Hex } from "viem";
import { getAddress, isAddress } from "viem";
import type { LiveEvaluationAuthorization, LiveRelayRuntime } from "./live-types.js";

const REQUEST_ID = /^0x[0-9a-fA-F]{64}$/;
const MAX_INGRESS_BODY = 192 * 1024;
const MAX_CONTROL_BODY = 128;
const DEFAULT_RATE_MAX = 30;
const DEFAULT_RATE_WINDOW_MS = 60_000;

interface LiveHttpOptions {
  allowedOrigins: readonly string[];
  rateLimit?: { maxRequests: number; windowMs: number };
  nowMs?: () => number;
}

interface RateWindow { startedAt: number; count: number }

export function createLiveRelayServer(runtime: LiveRelayRuntime, options: LiveHttpOptions): Server {
  const allowedOrigins = new Set(options.allowedOrigins.map(normalizeOrigin));
  const rate = options.rateLimit ?? { maxRequests: DEFAULT_RATE_MAX, windowMs: DEFAULT_RATE_WINDOW_MS };
  if (!Number.isSafeInteger(rate.maxRequests) || rate.maxRequests <= 0
    || !Number.isSafeInteger(rate.windowMs) || rate.windowMs <= 0) throw new Error("live relay rate limit is invalid");
  const nowMs = options.nowMs ?? Date.now;
  const windows = new Map<string, RateWindow>();

  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (request.method === "OPTIONS") {
      if (!origin || !allowedOrigins.has(normalizeOrigin(origin))) return sendJson(response, 403, { error: "origin unavailable" });
      return sendEmpty(response, 204, corsHeaders(origin));
    }
    const cors = origin && allowedOrigins.has(normalizeOrigin(origin)) ? corsHeaders(origin) : {};
    if (origin && Object.keys(cors).length === 0) return sendJson(response, 403, { error: "origin unavailable" });
    try {
      if (request.method === "GET" && request.url === "/healthz") {
        const config = await runtime.config();
        return sendJson(response, 200, {
          status: "ready",
          service: "payguard-live-fcc-relay",
          mode: config.mode,
          chainId: config.chainId,
          machineCount: config.machines.length,
          simulatedTee: true,
          hardwareTeeVerified: false,
          verifiedPayGuardRelease: false,
        }, cors);
      }
      if (request.method === "GET" && request.url === "/v1/config") {
        return sendJson(response, 200, await runtime.config(), cors);
      }
      if (!consume(windows, request.socket.remoteAddress ?? "unknown", nowMs(), rate)) {
        return sendJson(response, 429, { error: "relay rate limit exceeded" }, { ...cors, "retry-after": String(Math.ceil(rate.windowMs / 1_000)) });
      }
      const ingress = request.url?.match(/^\/v1\/ingress\/([123])$/);
      if (request.method === "POST" && ingress) {
        requireJson(request);
        const body = await readBody(request, MAX_INGRESS_BODY);
        return sendJson(response, 200, await runtime.ingress(Number(ingress[1]) as 1 | 2 | 3, JSON.parse(body)), cors);
      }
      const evaluation = request.url?.match(/^\/v1\/requests\/(0x[0-9a-fA-F]{64})\/evaluate$/);
      if (request.method === "POST" && evaluation) {
        requireJson(request);
        const body = await readBody(request, MAX_CONTROL_BODY);
        const parsed = JSON.parse(body) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length !== 0) {
          throw new Error("evaluation accepts an empty object only");
        }
        const requestId = evaluation[1];
        if (!requestId || !REQUEST_ID.test(requestId)) throw new Error("request ID is invalid");
        return sendJson(response, 200, await runtime.evaluate(
          requestId.toLowerCase() as Hex,
          evaluationAuthorization(request),
        ), cors);
      }
      return sendJson(response, 404, { error: "not found" }, cors);
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : 422;
      return sendJson(response, status, { error: "live FCC request unavailable" }, cors);
    }
  });
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("allowed web origin is invalid");
  }
  return url.origin;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,accept,x-payguard-owner,x-payguard-issued-at,x-payguard-expiry,x-payguard-authorization",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function evaluationAuthorization(request: IncomingMessage): LiveEvaluationAuthorization {
  const owner = request.headers["x-payguard-owner"];
  const issuedAt = request.headers["x-payguard-issued-at"];
  const expiry = request.headers["x-payguard-expiry"];
  const signature = request.headers["x-payguard-authorization"];
  if (typeof owner !== "string" || !isAddress(owner)
    || typeof issuedAt !== "string" || !/^(0|[1-9][0-9]*)$/.test(issuedAt)
    || typeof expiry !== "string" || !/^(0|[1-9][0-9]*)$/.test(expiry)
    || typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("evaluation authorization is invalid");
  }
  return { owner: getAddress(owner), issuedAt: BigInt(issuedAt), expiry: BigInt(expiry), signature: signature as Hex };
}

function requireJson(request: IncomingMessage): void {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new Error("content type must be application/json");
  }
}

async function readBody(request: IncomingMessage, maximum: number): Promise<string> {
  const length = Number(request.headers["content-length"] ?? "0");
  if (!Number.isFinite(length) || length > maximum) throw new Error("request body is too large");
  let total = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > maximum) throw new Error("request body is too large");
    chunks.push(bytes);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) throw new Error("request body is empty");
  return body;
}

function consume(windows: Map<string, RateWindow>, key: string, now: number, rate: { maxRequests: number; windowMs: number }): boolean {
  const current = windows.get(key);
  if (!current || now < current.startedAt || now - current.startedAt >= rate.windowMs) {
    if (windows.size >= 2_048 && !current) windows.delete(windows.keys().next().value as string);
    windows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= rate.maxRequests) return false;
  current.count += 1;
  return true;
}

function sendEmpty(response: ServerResponse, status: number, headers: Record<string, string>): void {
  response.writeHead(status, { "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers });
  response.end();
}

function sendJson(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString(10) : item);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...headers,
  });
  response.end(body);
}
