/**
 * The encoding mapping: a flat dictionary of `{source: target}` pairs,
 * stored bidirectionally so encode and decode use the same lookup.
 *
 * Example: `{"publish": "analyze", "garden": "office", "belongs": "determines"}`.
 *
 * Mappings ship as JSON files alongside this package, each carrying a `_meta`
 * provenance block (see `MappingId`). The default production mapping is
 * **alpha** (v18, 11,970 word pairs). See `MAPPINGS.md` in the repo root for
 * the full evolution history.
 */
export type Mapping = Record<string, string>;

/**
 * One piece of an encoded string, as produced by `encodeSegments`.
 *
 * Concatenating every `encoded` reproduces `encode()` exactly. That is the
 * point: a UI that wants to *highlight* what changed (a diff overlay, a
 * swapped-token counter, hover tooltips showing the original) must not
 * re-tokenise the text with its own regex, because the letter-run and
 * digit-context rules are subtle enough that any second implementation drifts.
 * Ask for segments instead and read them.
 */
export interface Segment {
  /** The author's text for this piece, after NFC normalisation. */
  original: string;
  /** What the encoder emits for this piece. Equals `original` when unchanged. */
  encoded: string;
  /** `encoded !== original` — i.e. this piece is a decoy the reader's font undoes. */
  swapped: boolean;
  /**
   * `"word"`  — a Unicode letter run (a dictionary lookup happened, hit or miss),
   * `"digit"` — exactly one digit character (likewise, permuted or not),
   * `"other"` — everything else: punctuation, spaces, symbols.
   *
   * So `word` and `digit` together are the tokens the dictionary gets a say
   * over — the right denominator for a "n of m swapped" readout.
   */
  kind: "word" | "digit" | "other";
}

/**
 * Identifies a specific mapping at a specific version. Used in font name
 * tables (nameID 26), in CDN URLs, and to verify encoder/font compatibility.
 */
export interface MappingId {
  /** ISO 639-1 language code, e.g. "en", "pt", "es". */
  lang: string;
  /** Mapping family name, e.g. "m15", "m16". */
  mapping: string;
  /** Variant within the family, e.g. "alpha", "beta", "gamma". */
  variant: string;
  /** Semver string of the encoder package that produced this mapping. */
  version: string;

  // The fields below ride along on the `_meta` block of a bundled mapping and
  // are returned by `mappingMeta()`. `parseMappingId()` reads a font's nameID
  // 26, which carries only the four-part identity above, so they are optional.

  /** Full generation stamp, e.g. `"shieldfont-en-v18-alpha@0.1.0"`. */
  mappingId?: string;
  /** Word-pair count for this mapping. */
  pairs?: number;
  /** Reseed seed, or `null` for a from-scratch build. */
  seed?: number | null;
  /** Filename of the font built from this mapping. */
  font?: string;
  /** Font family name the mapping was built against. */
  family?: string;
  /** Project name. */
  name?: string;
}
