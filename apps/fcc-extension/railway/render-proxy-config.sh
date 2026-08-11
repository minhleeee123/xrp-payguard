#!/bin/sh
set -eu

fail() {
  echo "payguard proxy configuration rejected: $1" >&2
  exit 1
}

required() {
  eval "value=\${$1:-}"
  [ -n "$value" ] || fail "$1 is required"
}

safe_atom() {
  value=$1
  label=$2
  case "$value" in
    *[!A-Za-z0-9._:@%+=,/-]*) fail "$label contains unsupported characters" ;;
  esac
}

for name in FCC_INDEXER_HOST FCC_INDEXER_PORT FCC_INDEXER_DATABASE \
  FCC_INDEXER_USERNAME FCC_INDEXER_PASSWORD PROXY_PRIVATE_KEY; do
  required "$name"
done

safe_atom "$FCC_INDEXER_HOST" FCC_INDEXER_HOST
safe_atom "$FCC_INDEXER_DATABASE" FCC_INDEXER_DATABASE
safe_atom "$FCC_INDEXER_USERNAME" FCC_INDEXER_USERNAME
safe_atom "$FCC_INDEXER_PASSWORD" FCC_INDEXER_PASSWORD

case "$FCC_INDEXER_PORT" in
  *[!0-9]*|'') fail "FCC_INDEXER_PORT must be numeric" ;;
esac
case "$PROXY_PRIVATE_KEY" in
  *[!0-9A-Fa-f]*|'') fail "PROXY_PRIVATE_KEY must be hexadecimal" ;;
esac
[ "${#PROXY_PRIVATE_KEY}" -eq 64 ] || fail "PROXY_PRIVATE_KEY must contain 64 hex characters"

target=${PROXY_CONFIG_PATH:-/app/config/config.toml}
mkdir -p "$(dirname "$target")"
umask 077

{
cat <<EOF
redis_port = "127.0.0.1:6379"
private_key_variable = "PROXY_PRIVATE_KEY"
initial_signing_policy_offset = 2
signing_policy_fetch_interval = "20s"

chain_id = 114

[db]
host = "$FCC_INDEXER_HOST"
port = $FCC_INDEXER_PORT
database = "$FCC_INDEXER_DATABASE"
username = "$FCC_INDEXER_USERNAME"
EOF
printf 'pass%s = "%s"\n' word "$FCC_INDEXER_PASSWORD"
cat <<EOF
log_queries = false

[addresses]
flare_systems_manager = "0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52"
relay = "0xa10B672D1c62e5457b17af63d4302add6A99d7dE"
voter_registry = "0x6a0AF07b7972177B176d3D422555cbc98DfDe914"

[ports]
internal = "6663"
external = "6664"

[info_timing]
cycle_internal = "10s"
cycle_queue_response_wait = "2s"

[voting]
proposal_expiration = "12s"
max_pending_request = 10000
EOF
} >"$target"

chmod 600 "$target"
