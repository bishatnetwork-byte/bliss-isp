#!/usr/bin/env bash
# HotspotPro — pull, rebuild, reload PM2.  Idempotent; safe to re-run.
set -euo pipefail
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/hotspotpro}"
APP_NAME="${APP_NAME:-hotspotpro}"

cd "$DEPLOY_PATH"
echo "[deploy] pulling…";  git pull --ff-only
echo "[deploy] installing…"; npm install --legacy-peer-deps
echo "[deploy] building…"
export NITRO_PRESET=node-server
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
echo "[deploy] reloading pm2…"
pm2 reload "$APP_NAME" --update-env || pm2 startOrReload "$DEPLOY_PATH/ecosystem.config.cjs" --update-env
pm2 save
echo "[deploy] ✅ done — pm2 logs $APP_NAME"
