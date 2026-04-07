#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f "$ROOT/pagevra/package.json" ]; then
  echo "[build-pagevra-image] Missing ./pagevra source checkout." >&2
  echo "[build-pagevra-image] Authorized maintainers should clone the private Pagevra repo into ./pagevra first." >&2
  exit 1
fi

docker build -t ghcr.io/ln-one/pagevra:dev ./pagevra
