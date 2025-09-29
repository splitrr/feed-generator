#!/usr/bin/env bash
set -euo pipefail

# Manual schema migration for content filters and performance indexes.
# Usage:
#   chmod +x scripts/migrate-manual-schema.sh
#   DB="/home/azureuser/feed-generator/data.sqlite" scripts/migrate-manual-schema.sh
# If DB is not set, defaults to ./data.sqlite in repo root.

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd -P)"
DB_DEFAULT="$REPO_DIR/data.sqlite"
DB="${DB:-$DB_DEFAULT}"

echo "Applying manual schema to: $DB"

sqlite3 "$DB" "
ALTER TABLE post ADD COLUMN text varchar;
ALTER TABLE post ADD COLUMN hasPpl integer;
UPDATE post SET hasPpl = CASE WHEN instr(lower(coalesce(text, '')), 'ppl') > 0 THEN 1 ELSE 0 END WHERE hasPpl IS NULL;
CREATE INDEX IF NOT EXISTS post_author_createdAt_idx ON post(author, createdAt);
CREATE INDEX IF NOT EXISTS post_createdAt_idx ON post(createdAt);
CREATE INDEX IF NOT EXISTS post_indexedAt_cid_idx ON post(indexedAt, cid);
CREATE INDEX IF NOT EXISTS post_hasPpl_idx ON post(hasPpl);
"

echo "\nVerification:"
echo "Columns on post:"
sqlite3 "$DB" "PRAGMA table_info(post);"
echo "\nIndexes on post:"
sqlite3 "$DB" "PRAGMA index_list('post');"
echo "\nFlag counts (hasPpl):"
sqlite3 "$DB" "SELECT hasPpl, COUNT(*) FROM post GROUP BY hasPpl;"

echo "\nDone."


