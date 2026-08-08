import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ActionRequestV1, SpendStateV1 } from "@xrp-payguard/protocol";
import { Relay } from "./relay.js";
import type { EvaluationEnvelope, MachineDescriptor } from "./types.js";

const MAX_BODY_BYTES = 1_024 * 1_024;
const FORBIDDEN_KEYS = new Set(["policy", "privateSalt", "ciphertext", "policyPlaintext", "allow", "decision", "publicReasonClass", "reservedAmount", "result"]);
const BIGINT_KEYS = new Set(["chainId", "requestNonce", "amount", "scheduleSlot", "createdAt", "graceDeadline", "expiry", "availableBalance", "dailySpend", "rollingSpend", "lastExecutionAt", "now", "timestamp", "value", "maxPerAction", "dailyCap", "rollingCap"]);

export function createRelayServer(relay: Relay): Server {
  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/healthz") {
        return sendJson(response, 200, { status: "ok", service: "payguard-relay", version: "0.1.0" });
      }
      if (request.method !== "POST" || request.url !== "/v1/evaluate") return sendJson(response, 404, { error: "not found" });
      const body = await readBody(request);
      const payload = JSON.parse(body, bigintReviver) as unknown;
      rejectForbiddenKeys(payload);
      if (!isEvaluatePayload(payload)) return sendJson(response, 400, { error: "malformed public evaluation request" });
      const outcome = await relay.evaluate(payload.request, payload.state, payload.machines);
      return sendJson(response, 200, outcome);
    } catch {
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
    });
    if (!response.ok) throw new Error("machine unavailable");
    const body = await response.text();
    const envelope = JSON.parse(body, bigintReviver) as unknown;
    if (!envelope || typeof envelope !== "object") throw new Error("machine result malformed");
    return envelope as EvaluationEnvelope;
  }
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

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = stringifyPublic(value);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
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
