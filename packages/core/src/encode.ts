import type { Mapping, Segment } from "./types.js";

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

/** True when `s` is a single letter. Tolerates `""` (a missing neighbour). */
function isLetterChar(s: string | undefined): boolean {
  return s !== undefined && s !== "" && IS_LETTER.test(s);
}

/**
 * Encode plain text and report it piece by piece: which words the dictionary
 * replaced, which digits the context rule permuted, and what each piece was
 * before. Joining every `encoded` gives exactly `encode(text, mapping)` —
 * `encode` is defined in terms of this function, so the two cannot drift.
 *
 * Reach for this whenever something needs to *show* the encoding rather than
 * just apply it: a live encoder that boxes the swapped tokens, a
 * "n of m tokens swapped" readout, an x-ray overlay with the originals on
 * hover. Every one of those is a mis-tokenising bug waiting to happen if it
 * re-derives the token boundaries itself; the site's own encoders each shipped
 * a `[A-Za-z]+` loop that silently skipped every digit.
 */
export function encodeSegments(text: string, mapping: Mapping): Segment[] {
  // P1: fold decomposed accents into precomposed letters so \p{L}+ matches whole words.
  const src = text.normalize("NFC");

  // 1) Encode words. Everything between two letter runs is set aside verbatim;
  //    by construction those gaps hold no letters at all, which is what makes
  //    the digit pass below able to reason about letter-neighbours locally.
  const coarse: Segment[] = [];
  const other = (s: string): Segment =>
    ({ original: s, encoded: s, swapped: false, kind: "other" });
  let last = 0;
  for (const m of src.matchAll(WORD_RE)) {
    const at = m.index ?? 0;
    if (at > last) coarse.push(other(src.slice(last, at)));
    const word = m[0];
    const t = mapping[word.toLowerCase()];
    const enc = t ? preserveCase(word, t) : word;
    coarse.push({ original: word, encoded: enc, swapped: enc !== word, kind: "word" });
    last = at + word.length;
  }
  if (last < src.length) coarse.push(other(src.slice(last)));

  // 2) F1: context-aware digit permutation. A digit's letter-neighbour is
  //    either the character beside it inside its own gap — never a letter — or
  //    the encoded edge of the adjoining word, so the context the font will see
  //    is knowable here without re-scanning the whole encoded string.
  const out: Segment[] = [];
  for (let i = 0; i < coarse.length; i++) {
    const seg = coarse[i]!;
    if (seg.kind !== "other") {
      out.push(seg);
      continue;
    }
    const run = [...seg.original]; // codepoints: an astral neighbour must not read as half a surrogate
    const before = [...(coarse[i - 1]?.encoded ?? "")].pop();
    const after = [...(coarse[i + 1]?.encoded ?? "")][0];
    let buf = "";
    for (let j = 0; j < run.length; j++) {
      const c = run[j]!;
      if (!IS_DIGIT.test(c)) {
        buf += c;
        continue;
      }
      const swap = mapping[c];
      let enc = c;
      if (swap && IS_DIGIT.test(swap)) {
        const left = isLetterChar(j > 0 ? run[j - 1] : before);
        const right = isLetterChar(j < run.length - 1 ? run[j + 1] : after);
        // 0 or 2 letter-neighbours → pre-swap, so the font's chains land on the
        // original. Exactly 1 → leave it; the font renders that case as written.
        if (Number(left) + Number(right) !== 1) enc = swap;
      }
      if (buf) out.push(other(buf));
      buf = "";
      out.push({ original: c, encoded: enc, swapped: enc !== c, kind: "digit" });
    }
    if (buf) out.push(other(buf));
  }
  return out;
}

/**
 * Encode plain text with the given mapping. Words (Unicode letter runs) are
 * substituted case-preservingly; swap-eligible digits are permuted per the
 * font's context rule (F1). Words not in the mapping pass through unchanged.
 */
export function encode(text: string, mapping: Mapping): string {
  let out = "";
  for (const seg of encodeSegments(text, mapping)) out += seg.encoded;
  return out;
}

/**
 * Decode == encode: the word mapping is a bijection (m[m[x]] === x) and the
 * digit rule is an involution under fixed letter-context, so encoding twice is
 * the identity. Exposed separately for call-site clarity.
 */
export function decode(text: string, mapping: Mapping): string {
  return encode(text, mapping);
}
