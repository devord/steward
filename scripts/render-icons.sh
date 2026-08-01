#!/bin/zsh
# Regenerate every raster identity asset from its SVG/HTML source
# (DESIGN.md § Mark). Run from the repo root. Needs Google Chrome (the
# renderer — ImageMagick's SVG delegate is not faithful to the gradients
# and filters) and ImageMagick (`magick`, for the .ico pack only).
#
# Run `node scripts/gen-brand.ts` FIRST: every SVG below is generated from
# apps/web/app/lib/mark.ts, and this script only rasterises them.
#
#   scripts/icon.svg          -> apple-touch-icon.png (180), icon-{192,512}.png
#   scripts/icon-maskable.svg -> icon-maskable-512.png
#   scripts/og-card.html      -> og.png (1200x630 @2x)
#   scripts/icon.svg          -> favicon.ico (16/32/48, dark identity chip)
#   brand/**/*.svg            -> brand/**/png/*.png (the distributable kit)
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PUB="apps/web/public"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Chrome renders an SVG *document* at its own intrinsic width/height and does
# NOT scale it to the window: screenshot a 64-unit chip at --window-size=512
# and you get a 64px mark in the corner of a 512px sheet of nothing. Every SVG
# here is sized for its own job (64 for the chip, 300x64 for the lockup), so
# rasters go through a shim that sizes the image to the exact pixel box. Raster
# size is then independent of intrinsic size, which is the only reason the kit
# can ship one master at many resolutions.
render_svg() { # render_svg <svg-rel-path> <w> <h> <out.png>
  local svg="$1" w="$2" h="$3" out="$4"
  local shim="$TMP/shim-$w-$h-${svg:t:r}.html"
  printf '<!doctype html><meta charset=utf-8><style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:%spx;height:%spx}</style><img src="file://%s/%s">' \
    "$w" "$h" "$PWD" "$svg" > "$shim"
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$w,$h" \
    --default-background-color=00000000 --virtual-time-budget=4000 \
    --screenshot="$out" "file://$shim" 2>/dev/null

  # Guard the exact failure this shim exists to prevent. Rendering the SVG
  # directly put the artwork at intrinsic size in the top-left corner and left
  # the rest transparent — a 64px mark marooned on a 512px sheet — and every
  # file was still the right *canvas* size, so nothing downstream noticed.
  # Ink narrower than half the canvas means the scaling silently stopped
  # working again.
  local ink=${$(magick "$out" -trim -format '%w' info: 2>/dev/null):-0}
  if (( ink * 2 < w )); then
    echo "render-icons: $out is ${ink}px of ink on a ${w}px canvas — the SVG did not scale" >&2
    exit 1
  fi
}

# Launcher chips: rounded on transparent; iOS/Android re-mask.
for S in 180 192 512; do
  render_svg scripts/icon.svg "$S" "$S" "$TMP/icon-$S.png"
done
cp "$TMP/icon-180.png" "$PUB/apple-touch-icon.png"
cp "$TMP/icon-192.png" "$PUB/icon-192.png"
cp "$TMP/icon-512.png" "$PUB/icon-512.png"

# The maskable adaptive icon: full-bleed, opaque (the SVG paints its own tile
# edge to edge, so the transparent default never shows).
render_svg scripts/icon-maskable.svg 512 512 "$PUB/icon-maskable-512.png"

# The social card (@2x). virtual-time budget lets the webfonts settle.
"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1200,630 \
  --virtual-time-budget=8000 \
  --screenshot="$PUB/og.png" "file://$PWD/scripts/og-card.html" 2>/dev/null

# favicon.ico: the browser-tab chip at 16/32/48, rendered from favicon.svg.
# Chrome renders a 512 master and ImageMagick downscales — Chrome refuses
# windows smaller than ~100px, silently shipping blank frames.
render_svg apps/web/public/favicon.svg 512 512 "$TMP/favicon-512.png"
for S in 16 32 48; do
  magick "$TMP/favicon-512.png" -resize "${S}x${S}" "$TMP/fav-$S.png"
done
magick "$TMP/fav-16.png" "$TMP/fav-32.png" "$TMP/fav-48.png" "$PUB/favicon.ico"

# The distributable kit: PNG alongside every SVG, on transparent, at the sizes
# people actually paste into slides, stores and READMEs. Everything here is a
# convenience copy — the SVG next to it is the master.
#
# Height is derived from the master's own aspect (rounded, not truncated), so a
# 1024-wide mark is exactly as tall as the artwork and never letterboxed.
render_kit() { # render_kit <dir> <basename> <intrinsic-w> <intrinsic-h> <widths...>
  local dir="$1" base="$2" iw="$3" ih="$4"; shift 4
  mkdir -p "brand/$dir/png"
  for W in "$@"; do
    render_svg "brand/$dir/$base.svg" "$W" "$(( (W * ih + iw / 2) / iw ))" \
      "brand/$dir/png/$base-$W.png"
  done
}

# The bare glyph's crop follows the mark (58x42 for a 54x22 bow plus the buttons
# and air), and the chip is one colourway, so it is rendered once, not per mode.
for MODE in light dark; do
  render_kit mark "steward-mark-$MODE" 58 42 256 512 1024
  render_kit wordmark "steward-wordmark-$MODE" 300 64 600 1200
done
render_kit icon "steward-icon" 64 64 128 256 512 1024
for INK in black white; do
  render_kit mark "steward-mark-$INK" 58 42 512
  render_kit wordmark "steward-wordmark-$INK" 300 64 1200
done

echo "rendered: apple-touch-icon, icon-192, icon-512, icon-maskable-512, og.png, favicon.ico, brand kit PNGs"
