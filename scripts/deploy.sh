#!/bin/bash
# Dev/staging deploy — uses PM2 (primary server)
set -e

BRANCH=claude/tender-gauss-iovx5c
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== SYMPL DEPLOY ==="
date
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
echo "--- Restarting app ---"
if pm2 describe sympl &>/dev/null; then
  pm2 restart sympl
else
  pm2 start npm --name sympl -- start
  pm2 save
fi

echo ""
echo "=== Deploy complete ==="
pm2 status
