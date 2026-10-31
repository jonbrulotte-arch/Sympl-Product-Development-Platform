#!/bin/bash
# Production deploy to 10.0.10.106:8010
set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Branch to deploy. Override with SYMPLPM_BRANCH in the shell or in .env
# (e.g. SYMPLPM_BRANCH=main) instead of editing this file on the server.
if [ -z "${SYMPLPM_BRANCH:-}" ] && [ -f "$APP_DIR/.env" ]; then
  SYMPLPM_BRANCH="$(sed -n 's/^SYMPLPM_BRANCH=//p' "$APP_DIR/.env" | tail -1 | tr -d "\"' ")"
fi
BRANCH="${SYMPLPM_BRANCH:-venv-prod}"
PORT=8010
VENV_PYTHON="${SYMPLPM_VENV_PYTHON:-$APP_DIR/venv/bin/python}"
MANAGER="$APP_DIR/scripts/sympl_manager.py"

echo "=== SYMPLPM PROD DEPLOY ==="
date
echo "Server : 10.0.10.106"
echo "Port   : $PORT"
echo "Branch : $BRANCH"
echo ""

echo "--- Pulling latest code ---"
git pull --ff-only origin "$BRANCH"
chmod +x "$APP_DIR/scripts/sympl_manager.py"

echo ""
echo "--- Installing dependencies ---"
npm install --production=false

echo ""
echo "--- Data migrations (idempotent) ---"
# Moves products to the product master model before db push drops the old
# columns. Exits non-zero (stopping the deploy) if a pre-flight check fails.
npm run db:migrate-product-master

echo ""
echo "--- Syncing database schema ---"
# stdin closed so a data-loss warning fails the deploy instead of prompting.
npx prisma db push < /dev/null

echo ""
echo "--- Generating Prisma client ---"
npx prisma generate

echo ""
echo "--- Building ---"
npm run build

echo ""
echo "--- Restarting SymplPM ---"
# Stop the whole process tree (the manager kills npm's process group and any
# leftover listener), then make sure nothing still holds the port. An old
# next-server left on the port keeps serving the previous build.
"$VENV_PYTHON" "$MANAGER" stop || true

port_pids() { fuser "$PORT/tcp" 2>/dev/null | tr -s ' ' | sed 's/^ //'; }
if [ -n "$(port_pids)" ]; then
  echo "Port $PORT still held by: $(port_pids) — freeing it"
  fuser -k "$PORT/tcp" >/dev/null 2>&1 || sudo -n fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
fi
for _ in $(seq 1 20); do [ -z "$(port_pids)" ] && break; sleep 0.5; done
if [ -n "$(port_pids)" ] || sudo -n fuser "$PORT/tcp" >/dev/null 2>&1; then
  echo "ERROR: port $PORT is still in use. Free it with: sudo fuser -k $PORT/tcp" >&2
  echo "Then start it with: $VENV_PYTHON $MANAGER start" >&2
  exit 1
fi

PORT=$PORT NODE_ENV=production "$VENV_PYTHON" "$MANAGER" start

echo ""
echo "--- Verifying the new build is being served ---"
BUILD_ID="$(cat "$APP_DIR/.next/BUILD_ID")"
ok=""
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://localhost:$PORT/_next/static/$BUILD_ID/_buildManifest.js" 2>/dev/null; then ok=1; break; fi
  sleep 1
done
if [ -z "$ok" ]; then
  echo "ERROR: port $PORT is not serving build $BUILD_ID." >&2
  echo "Check: sudo fuser $PORT/tcp; cat $APP_DIR/SymplPM.pid; tail -50 $APP_DIR/logs/app.log" >&2
  exit 1
fi
echo "Serving build $BUILD_ID on port $PORT."

echo ""
"$VENV_PYTHON" "$MANAGER" status
echo "=== Deploy complete ==="
