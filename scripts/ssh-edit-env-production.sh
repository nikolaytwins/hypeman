#!/usr/bin/env bash
# Интерактивный nano на сервере (нужен -t для TTY)
set -euo pipefail
exec ssh -t root@178.72.168.156 'nano /mnt/data/hypeman/.env.production'
