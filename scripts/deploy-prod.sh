#!/bin/bash
# Production deploy to 10.0.10.106:8010
set -e

BRANCH=venv-prod
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_PYTHON="${SYMPLPM_VENV_PYTHON:-$APP_DIR/venv/bin/python}"
MANAGER="$APP_DIR/scripts/sympl_manager.py"

echo "=== SYMPLPM PROD DEPLOY ==="
date
echo "Server : 10.0.10.106"
echo "Port   : 8010"
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
if "$VENV_PYTHON" "$MANAGER" status &>/dev/null; then
  "$VENV_PYTHON" "$MANAGER" restart
else
  PORT=8010 NODE_ENV=production "$VENV_PYTHON" "$MANAGER" start
fi

echo ""
"$VENV_PYTHON" "$MANAGER" status
echo "=== Deploy complete ==="
