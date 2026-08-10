import type { Hex } from "viem";
import { parseDemoConfig, stringifyDemoWire, type DemoDomainConfig } from "@xrp-payguard/demo";
import { processDemoActorRequest } from "@xrp-payguard/demo/server";
import { createCoston2DemoStateReader } from "./chain-state.js";

interface RequestLike {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  setHeader(name: string, value: string): void;
  send(body: string): void;
}

const MAX_BODY_BYTES = 160 * 1024;

export function loadDemoConfig(environment: NodeJS.ProcessEnv = process.env): DemoDomainConfig {
  const value = environment.PAYGUARD_INTERACTIVE_DEMO_CONFIG;
  if (!value || value.length > 32 * 1024) throw new Error("interactive demo config is unavailable");
  return parseDemoConfig(JSON.parse(value));
}

export async function handleDemoConfig(request: RequestLike, response: ResponseLike): Promise<void> {
  secureHeaders(response);
  if (request.method !== "GET") return json(response, 405, { status: "METHOD_NOT_ALLOWED" });
  try {
    json(response, 200, loadDemoConfig());
  } catch {
    json(response, 503, { status: "UNAVAILABLE", mode: "SIMULATED_FCC_COSTON2_TESTNET_V1" });
  }
}

export async function handleDemoActor(actor: 1 | 2 | 3, request: RequestLike, response: ResponseLike): Promise<void> {
  secureHeaders(response);
  if (request.method !== "POST") return json(response, 405, { status: "METHOD_NOT_ALLOWED" });
  const contentLength = Number(singleHeader(request.headers["content-length"]) ?? "0");
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_BODY_BYTES) {
    return json(response, 413, { status: "INVALID_REQUEST" });
  }
  const contentType = singleHeader(request.headers["content-type"]) ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return json(response, 415, { status: "INVALID_REQUEST" });
  try {
    const config = loadDemoConfig();
    const privateKey = process.env[`PAYGUARD_DEMO_ACTOR_${actor}_PRIVATE_KEY`] as Hex | undefined;
    if (!privateKey) throw new Error("actor unavailable");
    const result = await processDemoActorRequest({
      actor,
      privateKey,
      config,
      request: request.body,
      stateReader: createCoston2DemoStateReader(config),
    });
    json(response, 200, result);
  } catch (error) {
    const invalid = error instanceof Error && /(?:invalid|malformed|outside|stale|mismatch|unknown|required|cannot|failed|expired|not active)/i.test(error.message);
    json(response, invalid ? 400 : 503, { status: invalid ? "INVALID_REQUEST" : "UNAVAILABLE" });
  }
}

function secureHeaders(response: ResponseLike): void {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
}

function json(response: ResponseLike, status: number, value: unknown): void {
  response.status(status).send(stringifyDemoWire(value));
}

function singleHeader(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
