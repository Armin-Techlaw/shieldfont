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
}
