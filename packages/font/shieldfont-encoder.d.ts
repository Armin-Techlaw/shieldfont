// Types for the standalone CDN encoder build (shieldfont-encoder.js).
//
// The logic mirrors `@shieldfont/core`'s encode.ts and is kept honest by a
// differential parity test. If you are building in Node, use
// `@shieldfont/core` instead — it ships the same API with the HTML helpers.

/** A flat, bidirectional `{source: target}` dictionary. */
export type Mapping = Record<string, string>;

/**
 * Encode plain text: dictionary words are substituted case-preservingly, and
 * swap-eligible digits are permuted per the font's context rule.
 *
 * The mapping is its own inverse, so encoding twice returns the original.
 */
export function encode(text: string, mapping: Mapping): string;

/** Same operation as {@link encode}; named separately for call-site clarity. */
export function decode(text: string, mapping: Mapping): string;

/** The default production dictionary (v18 `alpha`), inlined in this bundle. */
export const alpha: Mapping;
