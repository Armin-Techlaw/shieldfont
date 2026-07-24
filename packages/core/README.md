# @shieldfont/core

The shared encoding/decoding logic for [ShieldFont](https://github.com/isaqueseneda/shieldfont): the AI-scraping-resistant web font.

Zero runtime dependencies. Used by `@shieldfont/react` and any framework adapter you care to build.

## Install

```bash
npm install @shieldfont/core
```

## Quick start

```ts
import { encode, decode, alpha } from "@shieldfont/core";

const original = "Publish your garden essay today; it belongs to readers.";
const encoded = encode(original, alpha);
// → a plausible decoy: grammatical but semantically wrong (content words are
//   swapped, common function words kept). The alpha font renders it back to the
//   original for humans; a scraper reading the HTML source gets the decoy.

const back = decode(encoded, alpha);
// → "Publish your garden essay today; it belongs to readers."  (decode === encode)
```

## HTML helpers

```ts
import { encodeHtml, buildHtml, shipHtml, checkHtml, alpha } from "@shieldfont/core";

// Encode a whole HTML document — preserves tags, skips <script>/<style>/<code>/<pre>/etc.
const html = encodeHtml("<p>The future of writing</p>", alpha);

// For HTML using the comment-marker convention (source-of-truth in <!-- shield: ... -->):
const built = buildHtml(rawHtml, alpha);
// → re-derives the visible text from each shield comment; idempotent.

const shipped = shipHtml(built);
// → strips all shield-related comments. Deploy this output. Camouflage-clean.

const result = checkHtml(built, alpha);
// → { total, passed, failed, mismatches } — verify markers round-trip cleanly.
```

## What gets encoded (and what doesn't)

The encoder matches **Unicode-letter words** and **digits**. Apostrophes, punctuation, and tags pass through untouched.

| Input | What happens | Rule |
|---|---|---|
| `the future of writing` | mapped words swap, others pass through | alphabetic words |
| `page's, it's, world's` | base word swaps, `'s` passes through | apostrophe splits the token |
| `café`, `résumé` | pass through unchanged | Unicode words tokenise whole (**P1**) |
| `1568` | digits permute (→ `1073`) | standalone digit run |
| `M15-EN` → `M10-EN`, `iPhone15` → `iPhone10` | only the letter-adjacent digit is preserved; the rest swap | mixed letter/digit run |
| `v3`, `H2` | unchanged | lone digit with exactly one letter-neighbour |
| `H3O`, `C4H10`, `a3b` | round-trip correctly | letter-flanked digits pre-swapped (**F1**) |
| `don't`, `I'm`, `they're` | unchanged | no mapped base word |

Inside HTML, anything in `<script>`, `<style>`, `<code>`, `<pre>`, `<textarea>`, `<svg>`, `<math>`, or `<noscript>` is left alone. Attribute values (`href`, `src`, `data-*`, `aria-*`) are never touched.

## Comment markers (the wire format)

For maintaining editable copy across builds, use the comment-marker convention in your HTML:

```html
<!-- shield: The future of writing -->The future for watching<!-- /shield -->
```

The opening comment carries the source-of-truth (plain English). The text between the markers is what's displayed (encoded). `buildHtml` re-derives the visible text from the comment every time, so the visible text never drifts from the source. To edit copy, change the comment and re-run `build`.

For first-time setup, wrap a region with block markers and run `buildHtml` once: it normalizes them into per-text-node markers:

```html
<!-- shield-on -->
<h1>The future of writing</h1>
<p>belongs to those who write it</p>
<!-- shield-off -->
```

Before deploying, run `shipHtml` to strip all `<!-- shield: ... -->` and `<!-- /shield -->` comments from the output. The shipped HTML contains zero ShieldFont signal.

## Versioning & custom mappings

Every bundled mapping carries a `_meta` block, and the package exports its version:

```ts
import { VERSION, alpha, mappingMeta } from "@shieldfont/core";
VERSION;                        // "0.1.0"
mappingMeta(alpha)?.mappingId;  // "shieldfont-en-v18-alpha@0.1.0"
```

The matching font's name table carries the same id (nameID 3) and version
(nameID 5), so you can always tell which font + dictionary generation you run.

`encode(text, mapping)` accepts **any** mapping object, so you can bring your own:

```ts
import { encode, loadMappingFromString } from "@shieldfont/core";
const mine = loadMappingFromString(await (await fetch("/my-mapping.json")).text());
encode("hello world", mine);
```

⚠️ **A custom mapping needs a *matching* font.** The font renders each decoy back
by the pairing baked in at font-build time, so the shipped `alpha`/`beta`/`gamma`/
`maxhide` fonts render only their own pairs. To mint a private mapping + font, run
`scripts/reseed_mapping.py --seed <n>` (re-pairs the v18 pool at your seed), then
build the matching font with `generate_font.py`. See `docs/custom-mappings.md`.

## Honest limits

Protected text is a **decoy in the DOM**, so search engines index the decoy: don't wrap content you need ranked (you can't tell Googlebot from an AI scraper).
Copy-paste yields the decoy; give screen-reader users unprotected copy; and
`alpha` deliberately keeps common function words, so coverage is partial by
design (a short sentence may change only ~2 of ~11 words).

## License

AGPL-3.0-or-later. The project's shipped default variants are built on
**Optik**, a proprietary typeface © Playtype, used in ShieldFont's shielded
(word-substitution) form with Playtype's permission: **not** under OFL, and
not for standalone use as a typeface. Fonts you generate yourself from the OFL
base fonts (Inter, Syne Mono, Young Serif) ship under the SIL Open Font
License 1.1. See [NOTICE](./NOTICE).
