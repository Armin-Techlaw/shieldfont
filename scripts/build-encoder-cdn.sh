#!/usr/bin/env bash
# build-encoder-cdn.sh — Bundle the canonical encoder as a single ESM file for
# CDN consumption.  GENERATED ARTIFACT: the encoder LOGIC source of truth is
# packages/core/src/encode.ts — this heredoc mirrors it, kept honest by the
# vitest parity test.  Do NOT hand-edit packages/font/shieldfont-encoder.js —
# it is regenerated here and published as part of @shieldfont/font.
#
# Usage: ./scripts/build-encoder-cdn.sh [variant]      # default: alpha
#   variant must have a mapping at packages/core/src/mappings/<variant>.json
#   (emitted by generate_font.py when the font is built).

set -euo pipefail

VARIANT="${1:-alpha}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FONT_DIR="${ROOT}/packages/font"
MAPPING="${ROOT}/packages/core/src/mappings/${VARIANT}.json"
# Canonical published location — @shieldfont/font ships this file (jsDelivr CDN).
OUT="${FONT_DIR}/shieldfont-encoder.js"

[ -f "$MAPPING" ] || { echo "✗ mapping not found: $MAPPING (build the font first)" >&2; exit 1; }
mkdir -p "$FONT_DIR"

cat > "$OUT" << 'HEADER'
/**
 * ShieldFont Encoder — standalone CDN build (GENERATED — do not edit).
 * Source of truth: packages/core/src/encode.ts
 * https://github.com/isaqueseneda/shieldfont   License: AGPL-3.0
 *
 * Usage (ESM):
 *   import { encode, decode, alpha } from "https://cdn.jsdelivr.net/npm/@shieldfont/font/shieldfont-encoder.js";
 *   const encoded = encode("Take 3 tablets", alpha);   // render with the alpha font
 *
 * Handles accented words (P1), letter-flanked digits (F1) and HTML character
 * references (E1) — see encode.ts for the full commentary on each.
 */
const WORD_RE = /\p{L}+/gu, IS_DIGIT = /^\d$/, IS_LETTER = /\p{L}/u;
const ENTITY_RE = /&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

function preserveCase(src, target) {
  if (src.length > 1 && src === src.toUpperCase()) return target.toUpperCase();
  if (src[0] === src[0]?.toUpperCase()) return (target[0] ?? "").toUpperCase() + target.slice(1);
  return target;
}

// Own properties only: `constructor`, `toString` and `valueOf` are ordinary
// English words AND names every object inherits.
function lookup(mapping, key) {
  if (!Object.prototype.hasOwnProperty.call(mapping, key)) return undefined;
  const value = mapping[key];
  return typeof value === "string" ? value : undefined;
}

// E1: `&#39;` and `&copy;` are markup. The browser resolves them to a character
// before the font runs, so anything changed inside one can never be undone.
function entitySpans(s) {
  const spans = [];
  ENTITY_RE.lastIndex = 0;
  let m;
  while ((m = ENTITY_RE.exec(s)) !== null) spans.push([m.index, m.index + m[0].length]);
  return spans;
}
function inEntity(spans, i) {
  let lo = 0, hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, a = spans[mid][0], b = spans[mid][1];
    if (i < a) hi = mid - 1;
    else if (i >= b) lo = mid + 1;
    else return true;
  }
  return false;
}

export function encode(text, mapping) {
  const src = text.normalize("NFC");
  const spans = entitySpans(src);

  // Words first. Gaps between letter runs are kept verbatim, which is what lets
  // the digit pass below reason about letter-neighbours locally.
  const coarse = [], offsets = [];
  let last = 0;
  for (const m of src.matchAll(WORD_RE)) {
    const at = m.index ?? 0;
    if (at > last) { coarse.push({ text: src.slice(last, at), word: false }); offsets.push(last); }
    const word = m[0];
    const t = inEntity(spans, at) ? undefined : lookup(mapping, word.toLowerCase());
    coarse.push({ text: t ? preserveCase(word, t) : word, word: true });
    offsets.push(at);
    last = at + word.length;
  }
  if (last < src.length) { coarse.push({ text: src.slice(last), word: false }); offsets.push(last); }

  // F1: digits only inside the gaps, never inside a substituted word — a
  // dictionary value containing a digit must not be re-permuted.
  let out = "";
  for (let i = 0; i < coarse.length; i++) {
    const seg = coarse[i];
    if (seg.word) { out += seg.text; continue; }
    const run = [...seg.text];
    const before = [...(coarse[i - 1] ? coarse[i - 1].text : "")].pop();
    const after = [...(coarse[i + 1] ? coarse[i + 1].text : "")][0];
    let at = offsets[i];
    for (let j = 0; j < run.length; j++) {
      const c = run[j];
      if (!IS_DIGIT.test(c)) { out += c; at += c.length; continue; }
      const swap = lookup(mapping, c);
      let enc = c;
      if (swap && IS_DIGIT.test(swap) && !inEntity(spans, at)) {
        const l = j > 0 ? run[j - 1] : before;
        const r = j < run.length - 1 ? run[j + 1] : after;
        const left = l !== undefined && l !== "" && IS_LETTER.test(l);
        const right = r !== undefined && r !== "" && IS_LETTER.test(r);
        if (Number(left) + Number(right) !== 1) enc = swap;
      }
      out += enc;
      at += c.length;
    }
  }
  return out;
}
export const decode = encode;
HEADER

# Append the injective mapping as an exported const named after the variant
# (e.g. `export const alpha = {...}`). No more `M15EN_ALPHA` misnomer.
#
# `_meta` is STRIPPED, not copied. A raw `cat` inlined the provenance block into
# the public CDN bundle — which put the literal strings "ShieldFont Optik" and
# "seed": 42 into the one artifact whose whole job is to carry no branding, and
# quietly falsified every camouflage claim in docs/concealment.md for this tier.
{
  echo ""
  echo -n "export const ${VARIANT} = "
  node -e '
    const fs = require("fs");
    const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    for (const k of Object.keys(m)) if (k.startsWith("_")) delete m[k];
    // One pair per line, matching the emitted mapping JSON (python indent=0).
    // A single-line blob would make every future regeneration a 1-line diff
    // over 250 KB, which is unreviewable.
    const rows = Object.keys(m).map((k) => JSON.stringify(k) + ": " + JSON.stringify(m[k]));
    process.stdout.write("{\n" + rows.join(",\n") + "\n}");
  ' "$MAPPING"
  echo ";"
} >> "$OUT"

echo "✓ Built ${OUT} — variant=${VARIANT}, $(wc -c < "$OUT" | tr -d ' ') bytes"
