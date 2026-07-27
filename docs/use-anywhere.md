# Use ShieldFont anywhere: any framework, any build step

Not using React? ShieldFont's engine is a tiny, zero-dependency JavaScript
library: **`@shieldfont/core`**. Call it wherever you already generate HTML: a
Vue/Svelte/Angular server render, an Astro/11ty/Hugo/Jekyll build hook, an Eleventy
filter, a Python or Ruby template (via a subprocess), a Cloudflare/Vercel build
step: anywhere the encoding runs **before the bytes reach the browser**.

> **Two tools, don't confuse them.** The **Encoder** (`@shieldfont/core`, JS) turns
> text into encoded decoys. The **Font Builder** (`scripts/generate_font.py`,
> Python) turns a `.ttf` into a shielded font. This page is about the Encoder. To
> make your own font, see [Custom faces](./custom-faces.md).

## The one rule

**Your original text must never ship to the browser.** Encode in Node, at build time or during server render. Scrapers
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
// → "The future of writing determines to those who sell it."
//   Only `belongs` and `write` are in alpha; the rest passes through.

// decode is the same operation — the mapping is bidirectional
import { decode } from "@shieldfont/core";
decode(encoded, alpha) === original; // true
```

Wrap the encoded text in an element that carries the protection font's class:

```js
const html = `<p class="tk9">${encode(original, alpha)}</p>`;
```

`alpha` is the default v18 dictionary (11,970 entries). `beta` (12,034) and
`gamma` (12,036) are alternate pairings for rotation, near-identical in size;
`m15en` is the coverage-max dictionary and a different shape entirely (2,534
entries covering a higher share of a page's words, including short function
words). Import whichever you pin: a page must be rendered by the font that
matches the dictionary that encoded it.

### Edge cases the encoder handles

*(Every row below was verified against the shipped `alpha` dictionary. The text
rows go through `encode()`; the two HTML rows go through the HTML pipeline
(`encodeHtml` / `buildHtml`), which is where tag-skipping lives: plain `encode()`
treats its whole input as text. Other variants map different words, so the
specific decoys change; the rules don't.)*

| Input | Encoded | Why |
|---|---|---|
| `world's, author's` | `lake's, teen's` | Apostrophe + suffix passes through; the base word is what gets looked up |
| `page's, it's` | unchanged | Not every word is in the dictionary: `page` and `it` have no `alpha` pair, so they stay put. Partial coverage is by design |
| `v3` | `v3` | A digit flanked by a letter is preserved (letter-adjacent) |
| `M15-EN`, `iPhone15` | `M10-EN`, `iPhone10` | Only the letter-adjacent digit is preserved; non-adjacent digits rotate (`5→0`) |
| `1568` | `1073` | Standalone digit run rotates (`0↔5`, `3↔8`, `4↔9`, `6↔7`; `1`,`2` unchanged) |
| `don't`, `I'm`, `they're` | unchanged | No mapped base |
| `café`, `naïve` | unchanged | Accented forms are not in the dictionary and pass through untouched |
| `<code>let x = 1;</code>` | unchanged | In the HTML pipeline, `script`/`style`/`code`/`pre`/`textarea`/`svg`/`math`/`noscript` contents are never encoded |
| `<a href="/about">About</a>` | href untouched | In the HTML pipeline, attributes are never modified |

The tokenisation rules behind these rows (plus a few more, like letter-flanked
digits in chemical formulas) are in the
[`@shieldfont/core` README](../packages/core/README.md#what-gets-encoded-and-what-doesnt).

Encoding is its own inverse: the mapping is bidirectional, so `decode(text, m)`
is the same operation as `encode(text, m)`. That also means a *double* encode
returns the original. Re-running the build over already-encoded output is safe
via `buildHtml()` (it is idempotent), but calling `encode()` twice on the same
string by hand un-encodes it.

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
  font-weight: 400;    /* Regular is the only weight this package ships */
  font-style: normal;
  font-display: block; /* block, not swap — no decoy flash before the font loads */
}
.tk9 {
  font-family: 'Optik', system-ui, sans-serif;
  font-synthesis: none; /* never let the browser fake a bold: see below */
}
```

**Or CDN (zero setup, version-pinned):**

```css
@import url('https://cdn.jsdelivr.net/npm/@shieldfont/font@0.2.1/shieldfont.css');
```

The CDN bundle already declares `@font-face` for `'Optik'` and ships the `.tk9`
class. **Always pin the version**: never `@latest`, or a mapping update would
silently break existing encoded pages.

> Filenames map to dictionaries: `optik-a` = alpha, `optik-b` = beta,
> `optik-c` = gamma, `optik-m` = maxhide. The names are deliberately neutral, and nothing in your served bytes says "ShieldFont."

### `@shieldfont/font` is Regular only

Those four files are the four *mapping variants* at one weight: **Regular,
`font-weight: 400`**. The letter picks the dictionary, not the cut. There is no
Medium, DemiBold, Bold, ExtraBold or Black in this package, and no italic, which
is why the `@font-face` above declares `400` and the class sets
`font-synthesis: none`. Without that, asking for `font-weight: bold` inside a
`.tk9` element makes the browser draw a synthetic bold, and a synthesised weight
distorts the composite glyphs enough to give away that decoys are in play. Style
headings and emphasis in an ordinary font instead, and keep the shielded
paragraphs at Regular.

**Six real weights ship, but only in `@shieldfont/react`.** That package bundles
genuine Playtype static cuts for every mapping variant:

| Weight name | CSS `font-weight` | Playtype cut |
|---|---|---|
| `regular` | 400 | Optik Regular |
| `medium` | 500 | Optik Medium |
| `demibold` | 600 | Optik DemiBold |
| `bold` | 700 | Optik Bold |
| `extrabold` | 800 | Optik ExtraBold |
| `black` | 900 | Optik Black |

The encoding is identical at every weight: for a given variant the word
substitutions and digit rules are byte-identical across all six cuts, so a weight
changes how the text looks and never what it encodes. Nothing is interpolated,
there is no variable font, and a numeric weight snaps to the nearest real cut
(`470` resolves to Medium 500). Details in the
[integration guide](./integration.md#weights-the-six-cuts-tier-a-only).

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
<!-- shield: The future of writing belongs to those who write it. -->The future of writing determines to those who sell it.<!-- /shield -->
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
  `<Shield>` hardcodes `aria-hidden="true"` with no opt-out, and no accessible
  fallback ships: build one yourself from your build-time original, or leave that
  content unwrapped.
- **The font is the codebook.** It has to reach the browser to render the page,
  and its composite glyphs are drawn from the original words' own letters, so
  anyone who downloads it can read the substitution table straight back out. We
  recovered all 11,962 pairs from our own shipped font in under a second, with
  no dictionary. The real barrier is the one-time engineering to build the
  inverter (one to three engineer-weeks), not the run, and a per-site inversion
  set against per-page scraping amortises away above roughly 25 pages. A
  private mapping raises the per-site cost; nothing removes it.
- **The default dictionaries are public**, by design: `alpha`/`beta`/`gamma`/`m15en`
  ship as plaintext JSON in `@shieldfont/core`, and `@shieldfont/font` publishes a
  browser encoder with all 11,970 `alpha` pairs inlined.
- **Not un-scrapeable:** a headless browser that renders fonts, OCR, or a
  vision-language model reading a screenshot all defeat it. ShieldFont raises the
  cost of casual scraping; it does not promise zero extraction.

## See also

- [Integration guide](./integration.md), the React path and the CDN/download tiers
- [`@shieldfont/core` README](../packages/core/README.md), full API
- [Custom mappings](./custom-mappings.md): bring your own mapping
- [Custom faces](./custom-faces.md): build your own font
- [AI co-pilot conventions](./CLAUDE.md) · [`AGENTS.md`](../AGENTS.md)
