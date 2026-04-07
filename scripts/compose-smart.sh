#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE=(-f docker-compose.yml)
OVERRIDES=()

has_pagevra_source() {
  [ -d "$ROOT/pagevra/.git" ] || [ -f "$ROOT/pagevra/package.json" ]
}

has_dualweave_source() {
  [ -d "$ROOT/dualweave/.git" ] || [ -f "$ROOT/dualweave/go.mod" ]
}

if has_pagevra_source; then
  echo "[compose-smart] Detected local Pagevra source, enabling pagevra override."
  OVERRIDES+=(-f docker-compose.pagevra.dev.yml)
fi

if has_dualweave_source; then
  echo "[compose-smart] Detected local Dualweave source, enabling dualweave override."
  OVERRIDES+=(-f docker-compose.dualweave.dev.yml)
fi

if [ "${#OVERRIDES[@]}" -eq 0 ]; then
  echo "[compose-smart] No local private service source detected, using image-only compose."
  exec docker compose "${BASE[@]}" "$@"
else
  echo "[compose-smart] Using compose overrides: ${OVERRIDES[*]}"
  exec docker compose "${BASE[@]}" "${OVERRIDES[@]}" "$@"
fi
