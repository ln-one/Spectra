#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE=(-f docker-compose.yml)
OVERRIDE=(-f docker-compose.pagevra.dev.yml)

has_pagevra_source() {
  [ -d "$ROOT/pagevra/.git" ] || [ -f "$ROOT/pagevra/package.json" ]
}

if has_pagevra_source; then
  echo "[compose-smart] Detected local Pagevra source, enabling dev override."
  exec docker compose "${BASE[@]}" "${OVERRIDE[@]}" "$@"
else
  echo "[compose-smart] No local Pagevra source detected, using image-only compose."
  exec docker compose "${BASE[@]}" "$@"
fi
