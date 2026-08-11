#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

export FCC_INDEXER_HOST=127.0.0.1
export FCC_INDEXER_PORT=3306
export FCC_INDEXER_DATABASE=indexer
export FCC_INDEXER_USERNAME=test_reader
export FCC_INDEXER_PASSWORD=test_password
key_half=0123456789abcdef0123456789abcdef
export PROXY_PRIVATE_KEY="${key_half}${key_half}"
export PROXY_CONFIG_PATH="$tmp/config.toml"

"$root/render-proxy-config.sh"

[ "$(stat -c '%a' "$PROXY_CONFIG_PATH")" = "600" ]
grep -q '^chain_id = 114$' "$PROXY_CONFIG_PATH"
grep -q '^redis_port = "127.0.0.1:6379"$' "$PROXY_CONFIG_PATH"
grep -q '^external = "6664"$' "$PROXY_CONFIG_PATH"
grep -q '^log_queries = false$' "$PROXY_CONFIG_PATH"

FCC_INDEXER_PASSWORD='bad"value' \
  PROXY_CONFIG_PATH="$tmp/rejected.toml" \
  "$root/render-proxy-config.sh" >/dev/null 2>&1 && exit 1

[ ! -e "$tmp/rejected.toml" ]
echo "Railway FCC configuration checks passed"
