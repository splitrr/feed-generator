#!/usr/bin/env bash
set -euo pipefail

# Optimize SQLite database for the feed-generator.
# - Applies safe performance PRAGMAs (WAL, NORMAL sync, memory temp store, mmap, cache)
# - Creates helpful indexes on the follow table
#
# Usage:
#   chmod +x scripts/optimize-sqlite.sh
#   ./scripts/optimize-sqlite.sh
#
# You can override the database path via either of:
#   DB="/absolute/path/to/data.sqlite" ./scripts/optimize-sqlite.sh
#   FEEDGEN_SQLITE_LOCATION="/absolute/path/to/data.sqlite" ./scripts/optimize-sqlite.sh

# Resolve repo root and move there (script lives in scripts/)
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd -P)"
cd "$REPO_DIR"

# Load .env if present to pick up FEEDGEN_SQLITE_LOCATION, etc.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_DEFAULT="$REPO_DIR/data.sqlite"
# Precedence: DB env var > FEEDGEN_SQLITE_LOCATION > default
DB_PATH="${DB:-${FEEDGEN_SQLITE_LOCATION:-$DB_DEFAULT}}"

echo "Applying PRAGMAs and indexes to: $DB_PATH"

# Apply PRAGMAs (idempotent/safe defaults)
sqlite3 "$DB_PATH" "
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA temp_store=MEMORY;
PRAGMA mmap_size=134217728;  -- 128 MB
PRAGMA cache_size=-20000;    -- ~20 MB
PRAGMA foreign_keys=ON;
PRAGMA optimize;
"

# Create indexes for follow hot paths (only if table exists)
FOLLOW_TABLE_EXISTS="$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='follow' LIMIT 1;")"
if [ "$FOLLOW_TABLE_EXISTS" = "follow" ]; then
  sqlite3 "$DB_PATH" "
  CREATE INDEX IF NOT EXISTS follow_subjectDid_idx ON follow(subjectDid);
  CREATE INDEX IF NOT EXISTS follow_subjectDid_createdAt_idx ON follow(subjectDid, createdAt);
  CREATE INDEX IF NOT EXISTS follow_followerDid_idx ON follow(followerDid);
  "
else
  echo "Note: table 'follow' not found. Skipping creation of follow indexes."
  echo "      Ensure you're pointing at the feed-generator database (migrated) if you expect this table."
fi

echo
echo "Verification:"
echo "PRAGMA settings:"
sqlite3 "$DB_PATH" "
SELECT 'journal_mode', journal_mode FROM pragma_journal_mode;
PRAGMA synchronous;
PRAGMA temp_store;
PRAGMA mmap_size;
PRAGMA cache_size;
PRAGMA foreign_keys;
"

echo
echo "Indexes on follow:"
sqlite3 "$DB_PATH" "PRAGMA index_list('follow');"

echo
echo "Done."


