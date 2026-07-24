# @shieldfont/react

A React **server component** for [ShieldFont](https://github.com/isaqueseneda/shieldfont) — encodes its children at server-render time and ships them to the browser through a bundled font.

**Encoded text is what reaches the browser.** Scrapers reading the HTML source see the encoded form. Humans, rendering through the font, see the original.

> [!WARNING]
> **Wrapping content in `<Shield>` removes it from search-engine indexing.** The DOM text is `aria-hidden` decoy gibberish, and you **cannot** distinguish Googlebot from an AI scraper — so search engines index the decoy, not your words. **Do not wrap anything you want to rank.** This is the single biggest thing to understand before you ship; see [Accessibility](#accessibility--read-this) and [Where the encoding must run](#where-the-encoding-must-run-important).

```bash
npm install @shieldfont/react
```

## Quick start (Next.js App Router, Astro, Remix — any RSC framework)

```jsx
import { Shield } from "@shieldfont/react";

export default function Page() {
  return (
    <main>
      <h1>About us</h1>                 {/* not protected — your normal font */}

      <Shield as="p">
        The future of writing belongs to those who protect their words.
      </Shield>

      <Shield as="h2" size="2.4rem">Manifesto</Shield>
    </main>
  );
}
```

Then copy the fonts into your app once (they're bundled with the package):

```bash
# copies the neutral optik-a / optik-b / optik-c / optik-m woff2 files
cp node_modules/@shieldfont/react/fonts/*.woff2 public/fonts/
```

That's it. `@font-face`, encoding, and the font-load guard all happen automatically.

## Where the encoding must run (important)

Protection only holds if encoding runs **on the server / at build time**, so encoded text — never plaintext — reaches the browser. Two setups break this and silently ship your plaintext:

1. **Inside a `"use client"` boundary.** The plaintext `children` is serialized into the RSC payload *before* Shield's encoder runs — view-source shows it. Always render `<Shield>` from a **Server Component**.
2. **Client-only React (Vite, CRA, raw `ReactDOM.render`).** The plaintext compiles into the JS bundle as string literals. Use an SSR/SSG framework (Next, Astro, Remix) instead — encode on the server.

In **development**, `<Shield>` detects when it renders in the browser and logs a `console.warn` — this failure is otherwise silent. It stays quiet in production, so watch for it while building. (This is the one caveat to read before anything else, which is why it's up here.)

## Variants — the rotation system

`<Shield>` ships four mappings, each with its own font:

| `variant` | Mapping | When to use |
|---|---|---|
| *(unset — **default**)* | **Auto-rotates** across `alpha`/`beta`/`gamma` | Recommended. Each `<Shield>` picks one by content hash, so your site uses **all three** mappings — a scraper can't learn one mapping and reverse everything. |
| `"alpha"` / `"beta"` / `"gamma"` | Pin one v18 mapping | When you want a single fixed font per page (one font download instead of up to three). |
| `"maxhide"` | M15 "maximum coverage" | Encodes a higher share of common words. A single fixed mapping; **never** chosen by auto-rotation — opt in explicitly. |

```jsx
<Shield>auto-rotated across alpha/beta/gamma</Shield>
<Shield variant="beta">pinned to beta</Shield>
<Shield variant="maxhide">maximum-coverage dictionary</Shield>
```

Auto-rotation is **deterministic by content** (same text → same variant): SSR-safe, reproducible builds, and it still spreads all three mappings across your content. **Cost:** a page that mixes variants loads one font per variant used (~1 MB each). Pin a variant if you want exactly one font per page.

Note: α/β/γ have slightly different pair counts (11,970 / 12,034 / 12,036), so how much of a given block is concealed varies a little depending on which mapping it hashes to.

## Component API

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `as` | `ElementType` | `"div"` | Element to render. `"span"` for inline; `"h1"`…`"h6"` for headings; `"article"`/`"section"`/`"main"`/`"aside"`/`"blockquote"` switch on **container mode** (see below). |
| `variant` | `"alpha" \| "beta" \| "gamma" \| "maxhide"` | *auto-rotate* | Pin a mapping, or leave unset to auto-rotate α/β/γ. |
| `weight` | `number` (100–900) | inherit | Font weight passthrough. |
| `lineHeight` | `number \| string` | inherit | Line-height passthrough. |
| `size` | `string` | inherit | font-size passthrough. |
| `className` | `string` | — | Merges with the internal scope. |
| `style` | `CSSProperties` | — | Merges with the internal font-family scope. |
| `children` | `ReactNode` | required | Text (string) — or, in container mode, a JSX tree. |

### Text mode vs container mode

- **Text mode** (default, or `as="p"`/`"span"`/`"h1"`…): `children` is a plain **string**; it's encoded and rendered.
- **Container mode** (`as="article"`/`"section"`/`"main"`/`"aside"`/`"blockquote"`): `children` may be a **JSX tree**. Shield walks built-in HTML elements and encodes their text; custom React components pass through untouched (wrap them in their own `<Shield>`).

```jsx
<Shield as="article">
  <h2>Chapter One</h2>
  <p>Text with <em>emphasis</em> is all encoded.</p>
  <MyWidget />                {/* opaque — not encoded */}
</Shield>
```

## `encodeText` — for places JSX can't go

`<title>`, `<meta>`, attribute values:

```jsx
import { encodeText } from "@shieldfont/react";

export const metadata = { title: encodeText("My protected page title") };
```

Returns a plain encoded string (unset variant auto-rotates by content). Apply the ShieldFont font to that element yourself.

## Self-hosted fonts (and why there's no default CDN)

The component points `@font-face` at **`/fonts`** by default (the copy step above). Change it with `setFontHost`:

```jsx
import { setFontHost } from "@shieldfont/react";
setFontHost("/static/shieldfont");           // or your OWN CDN
```

There is **no default public CDN by design**. A scraping defense must fail *loud*, never silent: if the font can't load, readers would otherwise see decoy gibberish with no signal it's wrong. Self-hosting guarantees the font ships with your build — and the bundled **font-load guard** (inlined, no hydration needed) watches `document.fonts` and, if the font doesn't load within 4 s, visibly replaces every protected element with *"Content unavailable"* and logs a clear console error. Never the raw decoy.

> **JS-off caveat:** that font-load guard is **JavaScript**. With JavaScript disabled *and* the font failing to load (e.g. a 404), the guard can't run — and a reader in that state sees the **raw decoy text**. There is no non-JS fallback for this specific case; the fail-loud guarantee holds only where scripts run.

## Camouflage (optional, recommended for production)

By default every ShieldFont React page shares the same **neutral** fingerprints (`data-typeface`, `font-family: 'Optik'`, the `optik-*` filenames) — nothing that names ShieldFont, but a signature two ShieldFont sites hold in common. `setCamouflage({ hash })` rewrites those shared SSR-visible literals to per-project unique names so two sites share no signature:

```jsx
// Imported once in your root layout:
import { setCamouflage } from "@shieldfont/react";
setCamouflage({ hash: "a8f3" });   // → font-family "Optik a8f3", data-typeface-a8f3, …
```

> [!WARNING]
> **Camouflage also renames the font *files* in the `@font-face` `src` — so you MUST copy each font to its camouflaged filename, or the page fails loud.** With `hash: "a8f3"`, `<Shield>` stops requesting `optik-*.woff2` and instead requests `/fonts/font-a8f3.woff2` (alpha), `/fonts/font-a8f3-beta.woff2`, and `/fonts/font-a8f3-gamma.woff2`. Those files don't exist until you create them; if they 404, the font-load guard replaces every protected element with *"Content unavailable."* The plain `cp …/*.woff2` step from the quick start is **not** enough once camouflage is on.

Copy and rename every font in the auto-rotation pool to its camouflaged name (all three, because a block can hash to any of them). Repeat for each hash you use:

```bash
cp node_modules/@shieldfont/react/fonts/optik-a.woff2 public/fonts/font-a8f3.woff2
cp node_modules/@shieldfont/react/fonts/optik-b.woff2 public/fonts/font-a8f3-beta.woff2
cp node_modules/@shieldfont/react/fonts/optik-c.woff2 public/fonts/font-a8f3-gamma.woff2
# only if you also use <Shield variant="maxhide">:
cp node_modules/@shieldfont/react/fonts/optik-m.woff2 public/fonts/font-a8f3-maxhide.woff2
```

There's no CLI for this step: pick any short string for the hash and script the copy/rename into your build — e.g. a `package.json` `postinstall`/build script — alongside the build-time encoding you run with [`@shieldfont/core`](https://www.npmjs.com/package/@shieldfont/core). Or just do the copies by hand as shown above.

## Accessibility — read this

> [!WARNING]
> **SEO:** the same property that hides text from scrapers hides it from **search engines**. Protected text is `aria-hidden` gibberish in the DOM, and you can't tell Googlebot apart from an AI scraper — so anything inside `<Shield>` is indexed as decoy, not as your real words. **Don't wrap content you want to rank** (page titles, headings, marketing copy). Wrap only what you're deliberately withholding from machines.

Protected regions are `aria-hidden="true"`: the DOM text is encoded gibberish, so screen readers, `Ctrl/⌘-F`, copy-paste, and translation tools operate on the gibberish, not the visible words. **This is inherent to the approach** (a font that hides text from machines hides it from assistive tech too). For any content that must be accessible, provide a parallel path — e.g. a "Listen / read aloud" control driven by the *original* build-time text, or an accessible plaintext version behind auth. Don't wrap navigation, form labels, or essential interactive text.

## Version

```jsx
import { VERSION } from "@shieldfont/react";   // re-exported from @shieldfont/core
console.log(VERSION);   // "0.1.1" — matches the font name table (nameID 5) and every mapping's _meta.version
```

Use it to confirm which encoder + dictionary generation you're running.

## License

AGPL-3.0-or-later. The bundled default fonts use **Optik — © Playtype, used
under the ShieldFont–Playtype partnership**, for ShieldFont's replaced-glyph
form only — **not** under OFL. The SIL Open Font License 1.1 applies only to
fonts you build yourself from the OFL base fonts (Inter, Syne Mono, Young Serif).
See [NOTICE](./NOTICE).
