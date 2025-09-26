#!/usr/bin/env bash
set -euo pipefail

# TO run on Linux use "bash backup-db.sh"

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

# Optional: fixed output name via env BACKUP_FIXED_NAME or flag --output <name>
OUTPUT_NAME="${BACKUP_FIXED_NAME:-Data.sqlite-backup-latest.sqlite}"
if [[ "${1:-}" == "--output" && -n "${2:-}" ]]; then
  OUTPUT_NAME="$2"
  shift 2
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
if [ -n "$OUTPUT_NAME" ]; then
  DEST_DB="$BACKUP_DIR/$OUTPUT_NAME"
else
  DEST_DB="$BACKUP_DIR/feedgen-backup-$ts.sqlite"
fi

echo "Backing up from: $SRC_DB"
echo "           to:   $DEST_DB"${OUTPUT_NAME:+" (will overwrite)"}

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


