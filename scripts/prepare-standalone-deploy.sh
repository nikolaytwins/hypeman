#!/usr/bin/env bash
set -euo pipefail
# Вызывать после `npm run build` в CI. Кладёт готовый каталог в ./release/ (не «deploy», чтобы не пересекаться с именами в репо)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
rm -rf release
mkdir -p release
cp -r .next/standalone/. release/
mkdir -p release/.next/static
cp -r .next/static/. release/.next/static/
