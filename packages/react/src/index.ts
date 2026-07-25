/**
 * @shieldfont/react — encodes in Node (build time or server render) so your
 * original text never ships to the browser. Font scope included.
 *
 * Quick start:
 *   import { Shield } from "@shieldfont/react";
 *
 *   export default function Page() {
 *     return (
 *       <main>
 *         <h1>About us</h1>             // not protected
 *         <Shield>
 *           The future of writing belongs to those who write it.
 *         </Shield>
 *       </main>
 *     );
 *   }
 *
 * Works in Next.js App Router (RSC), Remix, Astro server components,
 * and any framework that supports React 18+ server rendering.
 *
 * The encoded text is what reaches the browser; the font reverses the
 * encoding visually for human readers. Scrapers reading the HTML source
 * see the encoded form.
 */

export { Shield, encodeText, setFontHost, setCamouflage } from "./Shield.js";
export type { ShieldProps, ShieldVariant, CamouflageOptions } from "./Shield.js";

// Re-exported from @shieldfont/core so a React consumer can check which encoder
// they are running at runtime:
//   import { VERSION } from "@shieldfont/react";  // e.g. "0.1.1"
// This is the PACKAGE version, not a dictionary stamp. The bundled fonts are
// deliberately version-neutral, and each mapping carries its own
// `_meta.version` for the dictionary generation (currently 0.1.0, i.e. behind
// the package). Read that with `mappingMeta()` from @shieldfont/core.
export { VERSION } from "@shieldfont/core";
