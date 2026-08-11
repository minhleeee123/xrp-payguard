import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

export function createMonitorServer(monitor, { bearerToken, publicOrigin = "https://xrp-payguard.vercel.app" }) {
  const token = normalizeToken(bearerToken);
  const allowedOrigin = normalizeOrigin(publicOrigin);
  return createServer((request, response) => {
    try {
      if (request.method === "GET" && request.url === "/healthz") {
        return sendJson(response, 200, monitor.publicHealth(), corsHeaders(request.headers.origin, allowedOrigin));
      }
      if (request.method === "GET" && ["/metrics", "/v1/status", "/v1/incidents"].includes(request.url ?? "")) {
        if (!authorized(request.headers.authorization, token)) {
          return sendJson(response, 401, { error: "operator authentication required" }, { "www-authenticate": "Bearer" });
        }
        if (request.url === "/metrics") return sendText(response, 200, monitor.prometheus());
        if (request.url === "/v1/status") return sendJson(response, 200, monitor.operatorStatus());
        return sendJson(response, 200, monitor.incidents());
      }
      return sendJson(response, 404, { error: "not found" });
    } catch {
      return sendJson(response, 503, { error: "monitor unavailable" });
    }
  });
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("monitor public origin is invalid");
  }
  return url.origin;
}

function corsHeaders(origin, allowedOrigin) {
  return origin === allowedOrigin
    ? { "access-control-allow-origin": allowedOrigin, vary: "Origin" }
    : {};
}

function normalizeToken(value) {
  if (typeof value !== "string" || value.length < 32 || value.length > 256 || /\s/.test(value)) throw new Error("monitor bearer token is invalid");
  return value;
}

function authorized(header, token) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(token).digest();
  return timingSafeEqual(left, right);
}

function sendJson(response, status, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, securityHeaders("application/json; charset=utf-8", body, headers));
  response.end(body);
}

function sendText(response, status, body) {
  response.writeHead(status, securityHeaders("text/plain; version=0.0.4; charset=utf-8", body));
  response.end(body);
}

function securityHeaders(contentType, body, extra = {}) {
  return {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    ...extra,
  };
}
