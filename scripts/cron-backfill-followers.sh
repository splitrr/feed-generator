#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root (this script lives in scripts/)
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd -P)"
cd "$REPO_DIR"

# Load environment if present (exports all variables)
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "[$(date -Is)] feedgen: starting followers backfill"
/usr/bin/env npm run backfill:followers
echo "[$(date -Is)] feedgen: followers backfill finished"


