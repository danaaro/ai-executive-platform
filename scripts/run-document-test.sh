#!/usr/bin/env bash
# Boots a throwaway dev server the document test can reach, runs the test, and
# always tears the server down again.
#
# The server runs with:
#   ALLOW_UNAUTHED_AGENT_ROUTES=1  — dev-only middleware bypass (src/middleware.ts)
#   DATABASE_URL=                  — skips project auth + persistence, so no
#                                    Clerk session or seeded project is needed
# Neither can take effect in a production build (NODE_ENV gate in middleware).
set -euo pipefail

PORT="${PORT:-3019}"
LOG="$(mktemp -t susiesbrain-doctest)"

cleanup() {
  if [[ -n "${DEV_PID:-}" ]] && kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "Starting dev server on :$PORT (test mode)…"
ALLOW_UNAUTHED_AGENT_ROUTES=1 DATABASE_URL= npx next dev -p "$PORT" >"$LOG" 2>&1 &
DEV_PID=$!

for _ in $(seq 1 60); do
  if grep -q "Ready in" "$LOG" 2>/dev/null; then break; fi
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "Dev server died before becoming ready:"; cat "$LOG"; exit 1
  fi
  sleep 1
done

if ! grep -q "Ready in" "$LOG" 2>/dev/null; then
  echo "Dev server did not become ready in 60s:"; tail -30 "$LOG"; exit 1
fi
echo "Ready. Running the document test (a full generation takes ~2 minutes)…"
echo

BASE_URL="http://localhost:$PORT" npx tsx scripts/test-document-stream.ts
