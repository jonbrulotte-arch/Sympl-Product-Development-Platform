#!/bin/bash
# Production deploy to 10.0.10.106:8010
set -e

BRANCH=claude/tender-gauss-iovx5c
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
git pull origin "$BRANCH"

echo ""
echo "--- Installing dependencies ---"
npm install --production=false

echo ""
echo "--- Syncing database schema ---"
npx prisma db push

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
