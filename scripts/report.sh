#!/bin/bash

PGPASSWORD=changeme
APP_DIR=~/homelab/ngnix-web/www/Sympl-Product-Development-Platform
DB_USER=sympl
DB_HOST=127.0.0.1
DB_NAME=sympl_db

echo "=== SYMPL RESOURCE REPORT ==="
date
echo ""

echo "--- Process (pm2) ---"
pm2 show sympl | grep -E "memory|cpu|uptime|restarts|status"
echo ""

echo "--- Node Process Memory ---"
ps -p $(pm2 jlist | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['pid'])") -o pid,%cpu,%mem,rss,vsz,etime
echo ""

echo "--- Database Size ---"
PGPASSWORD=$PGPASSWORD psql -U $DB_USER -h $DB_HOST -d $DB_NAME -c \
  "SELECT pg_size_pretty(pg_database_size('$DB_NAME')) AS total_db_size;"
echo ""

echo "--- Top 10 Largest Tables ---"
PGPASSWORD=$PGPASSWORD psql -U $DB_USER -h $DB_HOST -d $DB_NAME -c \
  "SELECT tablename, pg_size_pretty(pg_total_relation_size(quote_ident(tablename))) AS size
   FROM pg_tables WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(quote_ident(tablename)) DESC LIMIT 10;"
echo ""

echo "--- Disk Usage (app directory) ---"
du -sh $APP_DIR/
du -sh $APP_DIR/.next/
du -sh $APP_DIR/node_modules/
echo ""

echo "--- Overall Server Memory ---"
free -h
echo ""

echo "--- Overall Disk ---"
df -h /
