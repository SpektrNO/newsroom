#!/usr/bin/env bash
# Smoke checks for scaffold-monorepo acceptance (local).
# Prerequisites: Postgres up, migrations applied, web serving on :3000
#   docker compose up -d postgres
#   pnpm db:migrate
#   pnpm --filter @newsroom/web build && pnpm --filter @newsroom/web start
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "== health =="
HEALTH="$(curl -sS "$BASE_URL/api/health")"
echo "$HEALTH"
echo "$HEALTH" | grep -q '"database":"ok"'
echo "$HEALTH" | grep -q '"ollama"'

EMAIL="verify-$(date +%s)@example.com"
PASS='VerifyPass123!'

echo "== sign-up =="
curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  -X POST "$BASE_URL/api/auth/sign-up/email" \
  -d "{\"name\":\"Verify\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | grep -q '"user"'

echo "== session =="
SESSION="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$BASE_URL/api/auth/get-session")"
echo "$SESSION" | grep -q "$EMAIL"

echo "== worker stub =="
pnpm --filter @newsroom/worker start >/dev/null

echo "== ai unit tests =="
pnpm --filter @newsroom/ai test >/dev/null

echo "OK scaffold verification passed (user $EMAIL)"
