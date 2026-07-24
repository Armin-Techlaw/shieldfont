# Use ShieldFont anywhere: any framework, any build step

Not using React? ShieldFont's engine is a tiny, zero-dependency JavaScript
library: **`@shieldfont/core`**. Call it wherever you already generate HTML: a
Vue/Svelte/Angular server render, an Astro/11ty/Hugo/Jekyll build hook, an Eleventy
filter, a Python or Ruby template (via a subprocess), a Cloudflare/Vercel build
step: anywhere the encoding runs **before the bytes reach the browser**.

> **Two tools, don't confuse them.** The **Encoder** (`@shieldfont/core`, JS) turns
> text into encoded decoys. The **Font Builder** (`scripts/generate_font.py`,
> Python) turns a `.ttf` into a shielded font. This page is about the Encoder. To
> make your own font, see [Custom mappings](./custom-mappings.md).

## The one rule

**Encode at build time or during server render: never in the browser.** Scrapers
don't run JavaScript, so a browser-runtime encoder would leave your plain-English
source exposed. The encoded form is what you store, serve, and cache.

---

## 1. Install the encoder

```bash
npm install @shieldfont/core
```

Zero runtime dependencies. Ships ESM + CJS + types.

## 2. Encode your text

```js
import { encode, alpha } from "@shieldfont/core";

const original = "The future of writing belongs to those who write it.";
const encoded  = encode(original, alpha);
// → "The future for watching belongs to these who write him."

// decode is the same operation — the mapping is bidirectional
import { decode } from "@shieldfont/core";
decode(encoded, alpha) === original; // true
```

Wrap the encoded text in an element that carries the protection font's class:

```js
const html = `<p class="tk9">${encode(original, alpha)}</p>`;
```

`alpha` is the default v18 dictionary. `beta` and `gamma` are alternate pairings
for rotation; `m15en` is the coverage-max dictionary. Import whichever you pin: a
page must be rendered by the font that matches the dictionary that encoded it.

## 3. Load the font once (`@font-face`)

`@shieldfont/core` does **not** touch your CSS: you load the font yourself. Two
options.

**Self-host (recommended: fails safe if the CDN ever dies):**

```bash
npm install @shieldfont/font
cp node_modules/@shieldfont/font/optik-a.woff2 public/fonts/
```

```css
@font-face {
  font-family: 'Optik';
  src: url('/fonts/optik-a.woff2') format('woff2');
  font-weight: 1 999;
  font-style: normal;
  font-display: block; /* block, not swap — no decoy flash before the font loads */
}
.tk9 { font-family: 'Optik', system-ui, sans-serif; }
```

**Or CDN (zero setup, version-pinned):**

```css
@import url('https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.1/shieldfont.css');
```

The CDN bundle already declares `@font-face` for `'Optik'` and ships the `.tk9`
class. **Always pin the version**: never `@latest`, or a mapping update would
silently break existing encoded pages.

> Filenames map to dictionaries: `optik-a` = alpha, `optik-b` = beta,
> `optik-c` = gamma, `optik-m` = maxhide. The names are deliberately neutral, and nothing in your served bytes says "ShieldFont."

---

## Editable copy across builds (the comment-marker workflow)

If you keep static HTML in git and want the **plain-English source to stay the
source of truth**, use the comment-marker helpers in `@shieldfont/core`. This is
exactly what a build step should do: no separate tool needed.

```js
// scripts/shield.mjs — run in your build (e.g. after your SSG emits dist/)
import { readFileSync, writeFileSync, globSync } from "node:fs"; // globSync: Node 22+, or use fast-glob
import { buildHtml, alpha } from "@shieldfont/core";

for (const file of globSync("dist/**/*.html")) {
  const raw = readFileSync(file, "utf8");
  writeFileSync(file, buildHtml(raw, alpha)); // re-derive decoy from the source-of-truth comment
}
```

Author your HTML with the plain English in the comment; `buildHtml` regenerates
the visible decoy every run (idempotent), so the visible text never drifts:

```html
<!-- shield: The future of writing -->The future for watching<!-- /shield -->
```

First-time setup: wrap a region with block markers and run `buildHtml` once: it
normalizes them into per-text-node markers.

```html
<!-- shield-on -->
<h1>The future of writing</h1>
<p>Belongs to those who write it.</p>
<!-- shield-off -->
```

Two more helpers complete the pipeline:

```js
checkHtml(html, alpha); // → { total, passed, failed, mismatches } — verify round-trip; fail CI on mismatch
shipHtml(html);         // strip every <!-- shield: … --> comment so deployed HTML carries zero signal
```

A typical `package.json`:

```json
{
  "scripts": {
    "build": "your-ssg && node scripts/shield.mjs",
    "prepublishOnly": "node -e \"import('./scripts/shield.mjs')\""
  }
}
```

---

## Framework adapters

If you build a clean adapter for your framework (an Astro integration, an Eleventy
plugin, a Vue directive…), add it to [`ADAPTERS.md`](../ADAPTERS.md) so others can
find it. `@shieldfont/react` is the reference implementation: read its source for
the SSR + font-load-guard pattern worth copying.

## Honest caveats (same for every integration)

- **SEO:** search engines index the *decoy*. Never wrap content you want to rank.
- **Screen readers** skip protected regions; **copy-paste** yields the decoy.
- **Not un-scrapeable:** a headless browser that renders fonts, OCR, or a
  vision-language model reading a screenshot all defeat it. ShieldFont raises the
  cost of casual scraping; it does not promise zero extraction.

## See also

- [Integration guide](./integration.md), the React path and the CDN/download tiers
- [`@shieldfont/core` README](../packages/core/README.md), full API
- [Custom mappings](./custom-mappings.md): bring your own mapping / build your own font
- [AI co-pilot conventions](./CLAUDE.md) · [`AGENTS.md`](../AGENTS.md)
