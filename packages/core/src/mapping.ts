import type { Mapping, MappingId } from "./types.js";

/**
 * Load a mapping from a JSON string. Validates that every word entry maps to a
 * string; keys beginning with `_` (e.g. the `_meta` provenance block) are
 * skipped rather than treated as word pairs.
 *
 * Have the JSON already in memory (bundled into your app, or fetched from a CDN
 * with your own `fetch`)? Pass the text straight to this function.
 */
export function loadMappingFromString(json: string): Mapping {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  const mapping: Mapping = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith("_")) continue; // skip `_meta` and other metadata blocks
    if (typeof value !== "string") {
      throw new Error(`Invalid mapping entry: ${key} -> ${typeof value}`);
    }
    mapping[key] = value;
  }
  return mapping;
}

/**
 * Best-effort identity parser. Reads `_meta` if present in the JSON,
 * else returns null. Use it to compare the encoder's mapping against a
 * font's nameID 26 metadata (encoder/font pairing check).
 */
export function parseMappingId(json: string): MappingId | null {
  try {
    const parsed = JSON.parse(json) as { _meta?: Partial<MappingId> };
    if (!parsed._meta) return null;
    const { lang, mapping, variant, version } = parsed._meta;
    if (!lang || !mapping || !variant || !version) return null;
    return { lang, mapping, variant, version };
  } catch {
    return null;
  }
}

/**
 * Return the `_meta` provenance block of a bundled mapping object (the JSON
 * constants exported from this package each carry one), or null if absent.
 * Lets a consumer read `mappingMeta(alpha)?.version` / `.mappingId` at runtime
 * to verify which font + dictionary generation they are running.
 */
export function mappingMeta(mapping: Mapping): MappingId | null {
  const meta = (mapping as Record<string, unknown>)["_meta"];
  if (!meta || typeof meta !== "object") return null;
  const block = meta as Partial<MappingId>;
  const { lang, mapping: fam, variant, version } = block;
  if (!lang || !fam || !variant || !version) return null;
  // Return the block itself, not a four-field reconstruction of it. Rebuilding
  // dropped `mappingId`, `pairs` and `seed` — and `mappingId` is precisely the
  // field three documented examples tell you to read, so every one of them
  // printed `undefined`.
  return { ...block, lang, mapping: fam, variant, version };
}
