#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
public="$root/public"
svg="$public/favicon.svg"

for size in 16 32 180; do
  if [[ "$size" == 180 ]]; then
    out="$public/apple-touch-icon.png"
  else
    out="$public/favicon-${size}x${size}.png"
  fi
  rsvg-convert -w "$size" -h "$size" "$svg" -o "$out"
done

magick "$public/favicon-16x16.png" "$public/favicon-32x32.png" "$public/favicon.ico"
