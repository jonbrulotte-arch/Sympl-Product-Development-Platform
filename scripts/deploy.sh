#!/bin/bash
# Test-server deploy (pm2). Production uses scripts/deploy-prod.sh.
set -e

BRANCH=venv-prod
PORT="${PORT:-8010}"

echo "=== SYMPL DEPLOY ==="
date
echo ""

echo "--- Pulling latest code ---"
git pull --ff-only origin "$BRANCH"

echo ""
echo "--- Installing dependencies ---"
npm install

echo ""
echo "--- Data migrations (idempotent) ---"
# Must run before db push: it moves data out of columns db push would drop.
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
echo "--- Restarting app ---"
if pm2 describe sympl > /dev/null 2>&1; then
  pm2 restart sympl --update-env
else
  echo "No pm2 process named 'sympl' yet; starting one on port $PORT."
  echo "(If the app is already running outside pm2, stop it first: sudo fuser -k $PORT/tcp)"
  PORT="$PORT" pm2 start npm --name sympl -- start
  pm2 save
fi

echo ""
echo "=== Deploy complete ==="
pm2 status
