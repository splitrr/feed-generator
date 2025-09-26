#!/usr/bin/env bash
set -euo pipefail

# Fetch a DB backup from the server into this repo's Data Backups directory.
#
# Usage:
#   ./scripts/fetch-backup-from-server.sh user@host backup-file.sqlite
#   ./scripts/fetch-backup-from-server.sh "feedgen-backup-20250101-120000.sqlite"   # uses hardcoded default host/key
#
# Options (env or flags):
#   -k, --key <path>           SSH key path (default: $SSH_KEY if set)
#   -r, --remote-dir <path>    Remote backups dir (default: /home/azureuser/feed-generator/Data Backups)
#   -d, --dest-dir <path>      Local dest dir (default: "Data Backups" under repo)
#   -o, --output <filename>    Local filename to write (default: feedgen.sqlite)

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd -P)"
DEFAULT_REMOTE_DIR="/home/azureuser/feed-generator/Data Backups"
DEFAULT_DEST_DIR="$REPO_DIR/Data Backups"

DEFAULT_HOST="azureuser@bskydom.uksouth.cloudapp.azure.com"
SSH_KEY_DEFAULT="${SSH_KEY:-$HOME/.ssh/skyfeedkey}"
REMOTE_DIR="$DEFAULT_REMOTE_DIR"
DEST_DIR="$DEFAULT_DEST_DIR"
DEST_NAME="Data.sqlite-backup-latest"

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    -k|--key)
      SSH_KEY_DEFAULT="$2"; shift 2;;
    -r|--remote-dir)
      REMOTE_DIR="$2"; shift 2;;
    -d|--dest-dir)
      DEST_DIR="$2"; shift 2;;
    -o|--output)
      DEST_NAME="$2"; shift 2;;
    --) shift; break;;
    -*) echo "Unknown option: $1" >&2; exit 2;;
    *) break;;
  esac
done

if [[ $# -eq 1 ]]; then
  HOST="$DEFAULT_HOST"
  BACKUP_NAME="$1"
elif [[ $# -ge 2 ]]; then
  HOST="$1"
  BACKUP_NAME="$2"
else
  echo "Usage: $0 [options] [user@host] backup-file.sqlite" >&2
  exit 1
fi

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
echo "        to   '$DEST_DIR/$DEST_NAME' (will overwrite)"

# Use scp; preserve times, handle spaces with quotes. Overwrites destination.
scp "${SCP_OPTS[@]}" "$HOST:$REMOTE_PATH" "$DEST_DIR/$DEST_NAME"

echo "Done. Saved to: $DEST_DIR/$DEST_NAME"


