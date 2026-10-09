#!/usr/bin/env bash
set -euo pipefail

version=3.12.1
case "$(uname -m)" in
  x86_64) arch=amd64; checksum=d0c90410e90204c9ca83b8539fac5c7aed01fd537207e4585849f8abc5df20b8 ;;
  aarch64|arm64) arch=arm64; checksum=445d96fd08801fe636cab1158b4f017ee320ac3b7446328b4fe2f902117b19b9 ;;
  *) echo 'Unsupported Pandoc runtime architecture' >&2; exit 1 ;;
esac
destination=${1:?Provide an installation directory}
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
archive="$temporary/pandoc.tar.gz"
curl --fail --location --retry 3 --output "$archive" \
  "https://github.com/jgm/pandoc/releases/download/$version/pandoc-$version-linux-$arch.tar.gz"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
tar -xzf "$archive" -C "$temporary"
mkdir -p "$destination/bin"
install -m 755 "$temporary/pandoc-$version/bin/pandoc" "$destination/bin/pandoc"
"$destination/bin/pandoc" --version | head -n 1
