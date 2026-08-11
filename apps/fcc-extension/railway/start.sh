#!/bin/sh
set -eu

fail() {
  echo "payguard FCC startup rejected: $1" >&2
  exit 1
}

[ "${MODE:-}" = "1" ] || fail "this image is restricted to simulated mode"
[ "${SIMULATED_TEE:-}" = "true" ] || fail "SIMULATED_TEE must be true"
[ "${CHAIN_ID:-}" = "114" ] || fail "CHAIN_ID must be Coston2 (114)"
[ "${PORT:-}" = "8080" ] || fail "PORT must expose the body-opaque FCC gateway"
[ -n "${INITIAL_OWNER:-}" ] || fail "INITIAL_OWNER is required"
[ -n "${EXTENSION_ID:-}" ] || fail "EXTENSION_ID is required"
[ -n "${GOVERNANCE_SIGNERS:-}" ] || fail "GOVERNANCE_SIGNERS is required"
[ -n "${GOVERNANCE_THRESHOLD:-}" ] || fail "GOVERNANCE_THRESHOLD is required"

mkdir -p /var/lib/payguard/policies /run/payguard-redis
chmod 700 /var/lib/payguard /var/lib/payguard/policies /run/payguard-redis
/app/render-proxy-config.sh

redis-server \
  --bind 127.0.0.1 \
  --port 6379 \
  --protected-mode yes \
  --save "" \
  --appendonly no \
  --dir /run/payguard-redis &
redis_pid=$!
proxy_pid=
tee_pid=
gateway_pid=

cleanup() {
  trap - TERM INT EXIT
  for pid in "$gateway_pid" "$tee_pid" "$proxy_pid" "$redis_pid"; do
    [ -z "$pid" ] || kill "$pid" 2>/dev/null || true
  done
  for pid in "$gateway_pid" "$tee_pid" "$proxy_pid" "$redis_pid"; do
    [ -z "$pid" ] || wait "$pid" 2>/dev/null || true
  done
}

trap cleanup TERM INT EXIT

ready=0
attempt=0
while [ "$attempt" -lt 30 ]; do
  if redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
    ready=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
[ "$ready" -eq 1 ] || fail "Redis did not become ready"

/app/tee-proxy &
proxy_pid=$!
/app/payguard-fcc &
tee_pid=$!
/app/payguard-gateway &
gateway_pid=$!

while kill -0 "$redis_pid" 2>/dev/null && \
      kill -0 "$proxy_pid" 2>/dev/null && \
      kill -0 "$tee_pid" 2>/dev/null && \
      kill -0 "$gateway_pid" 2>/dev/null; do
  sleep 1
done

fail "a required FCC process exited"
