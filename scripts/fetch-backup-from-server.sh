#!/usr/bin/env bash
set -euo pipefail

# Fetch a DB backup from the server into this repo's Data Backups directory.
#
# Usage:
#   ./scripts/fetch-backup-from-server.sh user@host backup-file.sqlite
#   ./scripts/fetch-backup-from-server.sh user@host "feedgen-backup-20250101-120000.sqlite"
#
# Options (env or flags):
#   -k, --key <path>           SSH key path (default: $SSH_KEY if set)
#   -r, --remote-dir <path>    Remote backups dir (default: /home/azureuser/feed-generator/Data Backups)
#   -d, --dest-dir <path>      Local dest dir (default: "Data Backups" under repo)

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd -P)"
DEFAULT_REMOTE_DIR="/home/azureuser/feed-generator/Data Backups"
DEFAULT_DEST_DIR="$REPO_DIR/Data Backups"

SSH_KEY_DEFAULT="${SSH_KEY:-}"
REMOTE_DIR="$DEFAULT_REMOTE_DIR"
DEST_DIR="$DEFAULT_DEST_DIR"

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    -k|--key)
      SSH_KEY_DEFAULT="$2"; shift 2;;
    -r|--remote-dir)
      REMOTE_DIR="$2"; shift 2;;
    -d|--dest-dir)
      DEST_DIR="$2"; shift 2;;
    --) shift; break;;
    -*) echo "Unknown option: $1" >&2; exit 2;;
    *) break;;
  esac
done

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 [options] user@host backup-file.sqlite" >&2
  exit 1
fi

HOST="$1"
BACKUP_NAME="$2"

# If the backup argument is an absolute path, use it as-is, else join with REMOTE_DIR
if [[ "$BACKUP_NAME" = /* ]]; then
  REMOTE_PATH="$BACKUP_NAME"
else
  REMOTE_PATH="$REMOTE_DIR/$BACKUP_NAME"
fi

mkdir -p "$DEST_DIR"

SCP_OPTS=( -p )
if [[ -n "$SSH_KEY_DEFAULT" ]]; then
  SCP_OPTS+=( -i "$SSH_KEY_DEFAULT" )
fi

echo "Fetching from $HOST:'$REMOTE_PATH'"
echo "        to   '$DEST_DIR/'"

# Use scp; preserve times, handle spaces with quotes
scp "${SCP_OPTS[@]}" "$HOST:$REMOTE_PATH" "$DEST_DIR/"

echo "Done. Saved to: $DEST_DIR/$(basename "$REMOTE_PATH")"


