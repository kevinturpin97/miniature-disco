#!/usr/bin/env bash
# PostgreSQL backup script for Greenhouse SaaS
# Runs inside the postgres container, invoked by the backup service cron.
#
# Usage:
#   ./backup-postgres.sh
#
# Environment variables (from .env):
#   POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST
#   BACKUP_RETENTION_DAYS (default: 30)

set -euo pipefail

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/greenhouse_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] Starting PostgreSQL backup..."

# Dump database with compression
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h "${POSTGRES_HOST:-postgres}" \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    --no-owner \
    --no-acl \
    --format=custom \
    --compress=9 \
    -f "${BACKUP_FILE}"

FILESIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date -Iseconds)] Backup completed: ${BACKUP_FILE} (${FILESIZE})"

# Clean up old backups
DELETED=$(find "${BACKUP_DIR}" -name "greenhouse_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "${DELETED}" -gt 0 ]; then
    echo "[$(date -Iseconds)] Cleaned ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

# List current backups
echo "[$(date -Iseconds)] Current backups:"
ls -lh "${BACKUP_DIR}"/greenhouse_*.sql.gz 2>/dev/null || echo "  (none)"

echo "[$(date -Iseconds)] Backup process finished."
