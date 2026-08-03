#!/usr/bin/env bash
# Assert docker-compose.yml keeps Postgres/Ollama published on loopback by default.
# Fails if a bare host-port mapping (all interfaces) sneaks back in.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="$ROOT/docker-compose.yml"

if [[ ! -f "$COMPOSE" ]]; then
  echo "assert-compose-bind: missing $COMPOSE" >&2
  exit 1
fi

fail=0

check_port() {
  local port="$1"
  local lines
  lines="$(grep -E "\"[^\"]*${port}:${port}\"" "$COMPOSE" || true)"
  if [[ -z "$lines" ]]; then
    echo "assert-compose-bind: no published mapping for :${port} in docker-compose.yml" >&2
    fail=1
    return
  fi

  # Bare "PORT:PORT" (or "0.0.0.0:PORT:PORT" as the only/default form) = all interfaces.
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    if echo "$line" | grep -qE "\"${port}:${port}\""; then
      echo "assert-compose-bind: bare \"${port}:${port}\" publishes on all interfaces" >&2
      echo "  found: $line" >&2
      fail=1
      continue
    fi
    if ! echo "$line" | grep -qE '\$\{COMPOSE_HOST_BIND:-127\.0\.0\.1\}:'"${port}:${port}"; then
      echo "assert-compose-bind: :${port} must default to loopback via \${COMPOSE_HOST_BIND:-127.0.0.1}" >&2
      echo "  found: $line" >&2
      fail=1
    fi
  done <<<"$lines"
}

check_port 5432
check_port 11434

if [[ "$fail" -ne 0 ]]; then
  echo "assert-compose-bind: FAILED (see docs/ops-local.md#compose-network-binding)" >&2
  exit 1
fi

echo "assert-compose-bind: OK (Postgres + Ollama default to 127.0.0.1)"
