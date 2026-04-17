#!/usr/bin/env bash
set -euo pipefail
# Вызывать после `npm run build` в CI. Кладёт готовый каталог в ./release/ (не «deploy», чтобы не пересекаться с именами в репо)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ ! -d .next/standalone ] || [ ! -f .next/standalone/server.js ]; then
  echo "Ошибка: ожидается .next/standalone/server.js после «npm run build» (output: standalone)." >&2
  exit 1
fi
rm -rf release
mkdir -p release
cp -r .next/standalone/. release/
mkdir -p release/.next/static
cp -r .next/static/. release/.next/static/
