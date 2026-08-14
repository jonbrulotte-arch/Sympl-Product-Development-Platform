#!/bin/bash
set -e

BRANCH=claude/tender-gauss-iovx5c

echo "=== SYMPL DEPLOY ==="
date
echo ""

echo "--- Pulling latest code ---"
git pull origin $BRANCH

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
pm2 restart sympl

echo ""
echo "=== Deploy complete ==="
pm2 status
