#!/usr/bin/env bash
# Generates PNG icons from an SVG source using ImageMagick
# Run: bash generate-icons.sh
set -e

SIZES="16 32 48 128"

# Create an SVG icon
cat > /x/sandbox/dev-box/statepass-ext/icons/icon.svg << 'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="24" fill="url(#bg)"/>
  <text x="64" y="52" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="48" fill="#53c8ed">L</text>
  <text x="86" y="52" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="48" fill="#e94560">+</text>
  <path d="M32 78 L38 78 L38 88 L42 88 L42 78 L48 78 L48 74 L32 74 Z" fill="#53c8ed" opacity="0.8"/>
  <path d="M60 78 Q70 66 80 78 L84 78 L84 88 L56 88 L56 78 Z" fill="#e94560" opacity="0.6"/>
</svg>
SVG

echo "SVG icon created at icons/icon.svg"

if command -v convert &> /dev/null; then
  for size in $SIZES; do
    convert /x/sandbox/dev-box/statepass-ext/icons/icon.svg \
      -resize "${size}x${size}" \
      /x/sandbox/dev-box/statepass-ext/icons/icon-${size}.png
  done
  echo "PNG icons generated successfully"
else
  echo "ImageMagick not found. Install it or manually create PNG icons."
  echo "The SVG icon is available at icons/icon.svg"
fi
