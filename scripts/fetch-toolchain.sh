#!/usr/bin/env bash
# Put the Scalus browser toolchain into public/toolchain/browser-ide.
#   TOOLCHAIN_DIR=<path to compiler/browser-ide>  use a local build (copied)
#   otherwise: download release $(cat TOOLCHAIN_VERSION) from lantr-io/scalus-scala3-wasm and check its SHA-256
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/public/toolchain"
rm -rf "$dest" && mkdir -p "$dest"

if [[ -n "${TOOLCHAIN_DIR:-}" ]]; then
  cp -R "$TOOLCHAIN_DIR" "$dest/browser-ide"
  echo "Copied local toolchain from $TOOLCHAIN_DIR"
  exit 0
fi

tag="$(cat "$root/TOOLCHAIN_VERSION")"
tmp="$(mktemp -d)"
base="https://github.com/lantr-io/scalus-scala3-wasm/releases/download/$tag"
curl -fsSL -o "$tmp/scalus-toolchain.tar.gz" "$base/scalus-toolchain.tar.gz"
curl -fsSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS"
(cd "$tmp" && shasum -a 256 -c SHA256SUMS)
tar -xzf "$tmp/scalus-toolchain.tar.gz" -C "$dest"
echo "Installed toolchain $tag"
