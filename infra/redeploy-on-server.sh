#!/usr/bin/env bash
# Запускать НА СЕРВЕРЕ (Selectel), из-под root, после правок в Git:
#   bash /mnt/data/hypeman/redeploy-on-server.sh
set -euo pipefail
OUT=/mnt/data/hypeman/current
mkdir -p "$OUT/storage/input" "$OUT/storage/audio" "$OUT/storage/scenes" "$OUT/storage/output"
ln -sf /mnt/data/hypeman/.env.production "$OUT/.env.production"
docker run --rm \
  -e NODE_OPTIONS=--max-old-space-size=3072 \
  -v "$OUT:/opt/deploy" \
  node:22-bookworm-slim bash -lc "
    set -e
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq git ca-certificates rsync >/dev/null
    git clone --depth 1 https://github.com/nikolaytwins/hypeman.git /src
    cd /src
    npm ci
    npm run build
    bash scripts/prepare-standalone-deploy.sh
    find /opt/deploy -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    rsync -a release/ /opt/deploy/
  "
cd /mnt/data/hypeman
pm2 reload ecosystem.config.cjs --only hypeman --update-env
pm2 save
echo "OK — https://hypeman.twinlabs.ru"
