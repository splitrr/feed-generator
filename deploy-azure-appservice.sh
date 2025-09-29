#!/usr/bin/env bash
set -euo pipefail

# ----- Config (edit these 3) -----
FEEDGEN_HOSTNAME="bfeed.com"
FEEDGEN_SERVICE_DID="did:web:${FEEDGEN_HOSTNAME}"
FEEDGEN_PUBLISHER_DID="did:example:alice"
# ---------------------------------

REGION="uksouth"
RG="feedgen-rg"
PLAN="feedgen-plan"
APP="feedgen-app-$RANDOM"
STORAGE="feedgenstore$RANDOM"
SHARE="feedgen"
MOUNT_PATH="/home/azurefiles"
SQLITE_PATH="${MOUNT_PATH}/feedgen/feedgen.sqlite"

echo "Using resource group: $RG"
echo "App name: $APP"
echo "Storage account: $STORAGE"
echo "Region: $REGION"
echo "SQLite path: $SQLITE_PATH"

az account show >/dev/null

az group create -n "$RG" -l "$REGION"

az storage account create -g "$RG" -n "$STORAGE" -l "$REGION" --sku Standard_LRS --kind StorageV2
KEY="$(az storage account keys list -g "$RG" -n "$STORAGE" --query '[0].value' -o tsv)"
az storage share-rm create --resource-group "$RG" --storage-account "$STORAGE" --name "$SHARE" --quota 100
az storage directory create --account-name "$STORAGE" --account-key "$KEY" --share-name "$SHARE" --name feedgen >/dev/null

az appservice plan create -g "$RG" -n "$PLAN" --is-linux --sku B1

az webapp create -g "$RG" -p "$PLAN" -n "$APP" --runtime "node|20-lts"

az webapp config storage-account add \
  --resource-group "$RG" \
  --name "$APP" \
  --custom-id feedgenfiles \
  --storage-type AzureFiles \
  --account-name "$STORAGE" \
  --share-name "$SHARE" \
  --access-key "$KEY" \
  --mount-path "$MOUNT_PATH"

az webapp config appsettings set -g "$RG" -n "$APP" --settings \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true \
  FEEDGEN_LISTENHOST=0.0.0.0 \
  FEEDGEN_PORT=8080 \
  FEEDGEN_SQLITE_LOCATION="$SQLITE_PATH" \
  FEEDGEN_HOSTNAME="$FEEDGEN_HOSTNAME" \
  FEEDGEN_SERVICE_DID="$FEEDGEN_SERVICE_DID" \
  FEEDGEN_PUBLISHER_DID="$FEEDGEN_PUBLISHER_DID"

az webapp config set -g "$RG" -n "$APP" --startup-file "node dist/index.js"
az webapp config set -g "$RG" -n "$APP" --always-on true

TMPZIP="$(mktemp /tmp/feedgen.XXXXXX.zip)"
git ls-files > /tmp/include.lst
zip -@ "$TMPZIP" < /tmp/include.lst >/dev/null
az webapp deployment source config-zip -g "$RG" -n "$APP" --src "$TMPZIP"

echo "Deployed. App URL:"
echo "https://${APP}.azurewebsites.net"
