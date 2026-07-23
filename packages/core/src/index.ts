/**
 * @shieldfont/core — pure encoding/decoding logic for ShieldFont.
 *
 * This package has zero runtime dependencies. It exports the same
 * primitives that every higher-level integration (CLI, React component,
 * framework adapter, server middleware) uses.
 *
 * Quick start:
 *   import { encode, alpha } from "@shieldfont/core";
 *   const encoded = encode("Publish your writing", alpha);
 *
 * For HTML documents containing shield markers, use the build/ship/check
 * helpers from the markers module:
 *   import { buildHtml, shipHtml, checkHtml } from "@shieldfont/core";
 */

import type { Mapping } from "./types.js";

/**
 * The @shieldfont/core release version. Matches the font name-table version
 * (nameID 5) and each mapping's `_meta.version`, so a consumer can verify at
 * runtime which encoder + dictionary generation they are running.
 */
export const VERSION = "0.1.0";

export { encode, decode } from "./encode.js";
export { encodeHtml, decodeHtml } from "./html.js";
export { buildHtml, shipHtml, checkHtml } from "./markers.js";
export type { CheckResult } from "./markers.js";
export { loadMappingFromString, parseMappingId, mappingMeta } from "./mapping.js";
export type { Mapping, MappingId } from "./types.js";

// Bundled mapping variants (JSON-imported constants). Each corresponds to a
// built font of the same name — see MANIFEST.json for provenance. Add new
// variants here as their fonts are built (generate_font.py emits the injective
// mapping into ./mappings/<variant>.json).
//   alpha  — v18 production, 11,970 injective pairs (the default; CDN + package)
//   beta   — v18 re-seed 1, 12,034 pairs (package only)
//   gamma  — v18 re-seed 2, 12,036 pairs (package only)
//   m15en  — the "coverage-maxing" variant (kept for heavy users)
// The JSON now carries a `_meta` provenance block, so its inferred type is not
// a bare Record<string,string>. Cast to Mapping for the public API (encode()
// ignores `_meta`; read it at runtime via mappingMeta()).
import alphaJson from "./mappings/alpha.json" with { type: "json" };
import betaJson from "./mappings/beta.json" with { type: "json" };
import gammaJson from "./mappings/gamma.json" with { type: "json" };
import m15enJson from "./mappings/m15en.json" with { type: "json" };

export const alpha = alphaJson as unknown as Mapping;
export const beta = betaJson as unknown as Mapping;
export const gamma = gammaJson as unknown as Mapping;
export const m15en = m15enJson as unknown as Mapping;

/**
 * @deprecated Misnomer — this constant is the **m15en** mapping (React
 * `variant="max"`), NOT the v18 "alpha". Kept only so existing imports don't
 * break. Use `m15en`/`max` (this exact mapping) or `alpha` (the v18 production
 * default) instead.
 */
export const M15EN_ALPHA = m15enJson as unknown as Mapping;
