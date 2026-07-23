#!/usr/bin/env bash
# build-encoder-cdn.sh — Bundle the canonical encoder as a single ESM file for
# CDN consumption.  GENERATED ARTIFACT: the encoder LOGIC source of truth is
# packages/core/src/encode.ts — this heredoc mirrors it, kept honest by the
# vitest parity test.  Do NOT hand-edit dist/shieldfont-encoder.js.
#
# Usage: ./scripts/build-encoder-cdn.sh [variant]      # default: alpha
#   variant must have a mapping at packages/core/src/mappings/<variant>.json
#   (emitted by generate_font.py when the font is built).

set -euo pipefail

VARIANT="${1:-alpha}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${ROOT}/dist"
MAPPING="${ROOT}/packages/core/src/mappings/${VARIANT}.json"
OUT="${DIST}/shieldfont-encoder.js"

[ -f "$MAPPING" ] || { echo "✗ mapping not found: $MAPPING (build the font first)" >&2; exit 1; }
mkdir -p "$DIST"

cat > "$OUT" << 'HEADER'
/**
 * ShieldFont Encoder — standalone CDN build (GENERATED — do not edit).
 * Source of truth: packages/core/src/encode.ts
 * https://github.com/isaqueseneda/shieldfont   License: AGPL-3.0
 *
 * Usage (ESM):
 *   import { encode, decode, alpha } from ".../dist/shieldfont-encoder.js";
 *   const encoded = encode("Take 3 tablets", alpha);   // render with the alpha font
 *
 * Handles accented words (P1) and letter-flanked digits (F1) — see encode.ts.
 */
const WORD_RE = /\p{L}+/gu, IS_DIGIT = /^\d$/, IS_LETTER = /\p{L}/u;
function preserveCase(src, target) {
  if (src.length > 1 && src === src.toUpperCase()) return target.toUpperCase();
  if (src[0] === src[0]?.toUpperCase()) return (target[0] ?? "").toUpperCase() + target.slice(1);
  return target;
}
export function encode(text, mapping) {
  const worded = text.normalize("NFC").replace(WORD_RE, (m) => {
    const t = mapping[m.toLowerCase()];
    return t ? preserveCase(m, t) : m;
  });
  const chars = [...worded];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i], swap = mapping[c];
    if (swap && IS_DIGIT.test(c) && IS_DIGIT.test(swap)) {
      const left = i > 0 && IS_LETTER.test(chars[i - 1]);
      const right = i < chars.length - 1 && IS_LETTER.test(chars[i + 1]);
      if (Number(left) + Number(right) !== 1) chars[i] = swap;
    }
  }
  return chars.join("");
}
export const decode = encode;
HEADER

# Append the injective mapping as an exported const named after the variant
# (e.g. `export const alpha = {...}`). No more `M15EN_ALPHA` misnomer.
{
  echo ""
  echo -n "export const ${VARIANT} = "
  cat "$MAPPING"
  echo ";"
} >> "$OUT"

echo "✓ Built ${OUT} — variant=${VARIANT}, $(wc -c < "$OUT" | tr -d ' ') bytes"
