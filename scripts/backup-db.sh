#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root (this script lives in scripts/)
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd -P)"
BACKUP_DIR="$REPO_DIR/Data Backups"

# Load env if present (for FEEDGEN_SQLITE_LOCATION)
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_DIR/.env"
  set +a
fi

# Determine source DB
declare -a CANDIDATES
if [ -n "${FEEDGEN_SQLITE_LOCATION:-}" ]; then
  CANDIDATES+=("$FEEDGEN_SQLITE_LOCATION")
fi
CANDIDATES+=(
  "$REPO_DIR/data.sqlite"
  "/home/azureuser/feed-generator/data.sqlite"
)

SRC_DB=""
for p in "${CANDIDATES[@]}"; do
  if [ -f "$p" ]; then
    SRC_DB="$p"
    break
  fi
done

if [ -z "$SRC_DB" ]; then
  echo "ERROR: Could not find a source SQLite DB. Checked:" >&2
  printf ' - %s\n' "${CANDIDATES[@]}" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
ts="$(date +%Y%m%d-%H%M%S)"
DEST_DB="$BACKUP_DIR/feedgen-backup-$ts.sqlite"

echo "Backing up from: $SRC_DB"
echo "           to:   $DEST_DB"

# Prefer using sqlite3 online backup if available; fall back to cp
if command -v sqlite3 >/dev/null 2>&1; then
  # Use online backup to get a consistent snapshot even if the server is running
  sqlite3 "$SRC_DB" ".timeout 5000" ".backup '$DEST_DB'"
else
  # Fall back to a plain copy (best effort). Consider stopping the app for 100% consistency.
  cp -v "$SRC_DB" "$DEST_DB"
  # Copy WAL/shared-memory if present to keep a consistent set
  for ext in -wal -shm; do
    if [ -f "$SRC_DB$ext" ]; then
      cp -v "$SRC_DB$ext" "$DEST_DB$ext"
    fi
  done
fi

echo "Backup complete: $DEST_DB"


