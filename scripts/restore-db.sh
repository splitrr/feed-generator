#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/restore-db.sh "Data Backups/feedgen-backup-YYYYMMDD-HHMMSS.sqlite"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd -P)"
SOURCE_BACKUP_REL="${1:-}"

if [ -z "$SOURCE_BACKUP_REL" ]; then
  echo "Usage: $0 'Data Backups/<backup-file>.sqlite'" >&2
  exit 1
fi

SOURCE_BACKUP_ABS="$REPO_DIR/$SOURCE_BACKUP_REL"
if [ ! -f "$SOURCE_BACKUP_ABS" ]; then
  echo "ERROR: Backup file not found: $SOURCE_BACKUP_ABS" >&2
  exit 1
fi

# Load env if present to honor FEEDGEN_SQLITE_LOCATION
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_DIR/.env"
  set +a
fi

TARGET_DB="${FEEDGEN_SQLITE_LOCATION:-$REPO_DIR/data.sqlite}"
TARGET_DIR="$(dirname "$TARGET_DB")"
mkdir -p "$TARGET_DIR"

echo "Restoring backup to live DB"
echo "  from: $SOURCE_BACKUP_ABS"
echo "    to: $TARGET_DB"

# Ensure target app is stopped for a consistent restore
if lsof "$TARGET_DB" >/dev/null 2>&1; then
  echo "WARNING: Target DB appears to be open. Stop the app before restoring for consistency." >&2
fi

if command -v sqlite3 >/dev/null 2>&1; then
  # Use .restore for a clean restore into target
  rm -f "$TARGET_DB" "$TARGET_DB-wal" "$TARGET_DB-shm"
  sqlite3 "$TARGET_DB" ".timeout 5000" ".restore '$SOURCE_BACKUP_ABS'"
else
  cp -v "$SOURCE_BACKUP_ABS" "$TARGET_DB"
fi

echo "Restore complete: $TARGET_DB"


