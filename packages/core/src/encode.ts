import type { Mapping } from "./types.js";

/**
 * ShieldFont encoder — the SINGLE canonical logic. Every shipped encoder (the
 * npm package, the CDN bundle, the site copy, the Python mirror) derives from
 * this file. See packages/core/README.md.
 *
 * Two edge cases are handled HERE, in the encoder, so the validated font never
 * has to change (the "resolve edge cases in the encoder, not the font" rule):
 *
 *   P1 — accented words. The tokenizer matches Unicode letters (\p{L}) and the
 *        input is NFC-normalised first, so "café"/"résumé" tokenise as whole
 *        words and pass through untouched instead of being split at the accent
 *        (the old ASCII `[a-zA-Z]+` split them and corrupted the fragments).
 *
 *   F1 — letter-flanked digits. The font renders a swap-eligible digit SWAPPED
 *        when it has 0 or 2 letter-neighbours, but AS-WRITTEN with exactly 1
 *        (its fire-then-revert chains double-revert the 2-neighbour case). So
 *        the encoder pre-swaps digits with 0/2 letter-neighbours and leaves the
 *        1-neighbour case — making "H3O", "C4H10", "a3b" round-trip correctly.
 *        Letter-neighbour context is invariant under encoding (words stay
 *        words), so it can be computed on the encoded string.
 */

// P1: Unicode letter runs (accented words stay whole once NFC-normalised).
const WORD_RE = /\p{L}+/gu;
const IS_DIGIT = /^\d$/;
const IS_LETTER = /\p{L}/u;

/**
 * Apply the casing of `src` to `target`:
 *   - `src` all uppercase and length > 1 → target uppercased,
 *   - `src` starts uppercase             → target first-char uppercased,
 *   - otherwise                          → target as-is.
 */
function preserveCase(src: string, target: string): string {
  if (src.length > 1 && src === src.toUpperCase()) return target.toUpperCase();
  if (src[0] === src[0]?.toUpperCase()) {
    return (target[0] ?? "").toUpperCase() + target.slice(1);
  }
  return target;
}

/**
 * Encode plain text with the given mapping. Words (Unicode letter runs) are
 * substituted case-preservingly; swap-eligible digits are permuted per the
 * font's context rule (F1). Words not in the mapping pass through unchanged.
 */
export function encode(text: string, mapping: Mapping): string {
  // P1: fold decomposed accents into precomposed letters so \p{L}+ matches whole words.
  const src = text.normalize("NFC");

  // 1) Encode words.
  const worded = src.replace(WORD_RE, (m) => {
    const t = mapping[m.toLowerCase()];
    return t ? preserveCase(m, t) : m;
  });

  // 2) F1: context-aware digit permutation.
  const chars = [...worded];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const swap = mapping[c];
    if (swap && IS_DIGIT.test(c) && IS_DIGIT.test(swap)) {
      const left = i > 0 && IS_LETTER.test(chars[i - 1]);
      const right = i < chars.length - 1 && IS_LETTER.test(chars[i + 1]);
      if (Number(left) + Number(right) !== 1) chars[i] = swap; // 0 or 2 letter-neighbours → pre-swap
    }
  }
  return chars.join("");
}

/**
 * Decode == encode: the word mapping is a bijection (m[m[x]] === x) and the
 * digit rule is an involution under fixed letter-context, so encoding twice is
 * the identity. Exposed separately for call-site clarity.
 */
export function decode(text: string, mapping: Mapping): string {
  return encode(text, mapping);
}
