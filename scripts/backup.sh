#!/usr/bin/env bash
# Full Sympl backup: database (via API) + uploaded files.
#
# Usage:
#   scripts/backup.sh <APP_URL> <API_TOKEN> [BACKUP_DIR]
#
# Example crontab entry (daily at 2:00 AM):
#   0 2 * * * /opt/sympl/scripts/backup.sh https://app.example.com sbk_abc123 /var/backups/sympl >> /var/log/sympl-backup.log 2>&1
#
# The script:
#   1. Calls POST /api/admin/backup/run to create an encrypted database dump
#   2. Creates a tarball of data/uploads/ alongside the database backup
#   3. Prunes old upload archives beyond the retain count from the API config

set -euo pipefail

APP_URL="${1:?Usage: backup.sh <APP_URL> <API_TOKEN> [BACKUP_DIR]}"
API_TOKEN="${2:?Usage: backup.sh <APP_URL> <API_TOKEN> [BACKUP_DIR]}"
BACKUP_DIR="${3:-/var/backups/sympl}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%S)"

echo "[$(date -Iseconds)] Starting full backup..."

# 1. Database backup via API
echo "[$(date -Iseconds)] Triggering database backup..."
DB_RESULT=$(curl -sf -X POST "${APP_URL}/api/admin/backup/run" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"triggeredBy":"cron"}') || {
  echo "[$(date -Iseconds)] ERROR: Database backup API call failed"
  exit 1
}
echo "[$(date -Iseconds)] Database backup: ${DB_RESULT}"

# 2. Upload files backup
UPLOADS_DIR="${APP_DIR}/data/uploads"
if [ -d "${UPLOADS_DIR}" ] && [ "$(ls -A "${UPLOADS_DIR}" 2>/dev/null)" ]; then
  UPLOADS_ARCHIVE="${BACKUP_DIR}/sympl-uploads-${TIMESTAMP}.tar.gz"
  mkdir -p "${BACKUP_DIR}"
  echo "[$(date -Iseconds)] Archiving uploads to ${UPLOADS_ARCHIVE}..."
  tar -czf "${UPLOADS_ARCHIVE}" -C "${APP_DIR}/data" uploads
  UPLOADS_SIZE=$(stat -c%s "${UPLOADS_ARCHIVE}" 2>/dev/null || stat -f%z "${UPLOADS_ARCHIVE}" 2>/dev/null || echo "unknown")
  echo "[$(date -Iseconds)] Uploads archive: ${UPLOADS_SIZE} bytes"

  # Prune old upload archives (keep same count as DB backups)
  RETAIN=$(echo "${DB_RESULT}" | grep -o '"retainCount":[0-9]*' | grep -o '[0-9]*' || echo "")
  if [ -z "${RETAIN}" ]; then
    # Fall back: count current .pgenc files as the retain target
    RETAIN=$(ls -1 "${BACKUP_DIR}"/sympl-backup-*.pgenc 2>/dev/null | wc -l)
  fi
  if [ "${RETAIN}" -gt 0 ] 2>/dev/null; then
    ls -1t "${BACKUP_DIR}"/sympl-uploads-*.tar.gz 2>/dev/null | tail -n +$((RETAIN + 1)) | while read -r old; do
      echo "[$(date -Iseconds)] Pruning old upload archive: ${old}"
      rm -f "${old}"
    done
  fi
else
  echo "[$(date -Iseconds)] No uploads directory found or empty, skipping file backup"
fi

echo "[$(date -Iseconds)] Full backup complete."
