/**
 * @shieldfont/react — server-side encoding + font scope for React.
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

// Re-exported from @shieldfont/core so a React consumer can check which
// font + dictionary generation they are running at runtime:
//   import { VERSION } from "@shieldfont/react";  // e.g. "0.1.0"
// Matches the font name-table version and every mapping's `_meta.version`.
export { VERSION } from "@shieldfont/core";
