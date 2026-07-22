#!/bin/zsh
# Regenerate every raster identity asset from its SVG/HTML source
# (DESIGN.md § Mark). Run from the repo root. Needs Google Chrome (the
# renderer — ImageMagick's SVG delegate is not faithful to the gradients
# and filters) and ImageMagick (`magick`, for the .ico pack only).
#
#   scripts/icon.svg          -> apple-touch-icon.png (180), icon-{192,512}.png
#   scripts/icon-maskable.svg -> icon-maskable-512.png
#   scripts/og-card.html      -> og.png (1200x630 @2x)
#   scripts/icon.svg          -> favicon.ico (16/32/48, dark identity chip)
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PUB="apps/web/public"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

render() { # render <source-url> <size> <out.png> [extra chrome args...]
  local url="$1" size="$2" out="$3"; shift 3
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$size" \
    "$@" --screenshot="$out" "$url" 2>/dev/null
}

# Launcher chips: rounded on transparent; iOS/Android re-mask.
for S in 180 192 512; do
  render "file://$PWD/scripts/icon.svg" "$S,$S" "$TMP/icon-$S.png" \
    --default-background-color=00000000
done
cp "$TMP/icon-180.png" "$PUB/apple-touch-icon.png"
cp "$TMP/icon-192.png" "$PUB/icon-192.png"
cp "$TMP/icon-512.png" "$PUB/icon-512.png"

# The maskable adaptive icon: full-bleed, opaque.
render "file://$PWD/scripts/icon-maskable.svg" "512,512" "$PUB/icon-maskable-512.png"

# The social card (@2x). virtual-time budget lets the webfonts settle.
"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1200,630 \
  --virtual-time-budget=8000 \
  --screenshot="$PUB/og.png" "file://$PWD/scripts/og-card.html" 2>/dev/null

# favicon.ico: the dark identity chip at 16/32/48 (.ico can't media-query,
# so it bakes dark; tab strips give it the border for light). Chrome
# renders a 512 master and ImageMagick downscales — Chrome refuses windows
# smaller than ~100px, silently shipping blank frames.
for S in 16 32 48; do
  magick "$TMP/icon-512.png" -resize "${S}x${S}" "$TMP/fav-$S.png"
done
magick "$TMP/fav-16.png" "$TMP/fav-32.png" "$TMP/fav-48.png" "$PUB/favicon.ico"

echo "rendered: apple-touch-icon, icon-192, icon-512, icon-maskable-512, og.png, favicon.ico"
