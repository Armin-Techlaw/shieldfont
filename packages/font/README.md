# @shieldfont/font

The **no-build / CDN** distribution of ShieldFont: the web fonts, a paste-in
`shieldfont.css`, and a browser `shieldfont-encoder.js`.

- Building in Node? Use [`@shieldfont/core`](https://www.npmjs.com/package/@shieldfont/core).
- Using React? Use [`@shieldfont/react`](https://www.npmjs.com/package/@shieldfont/react),
  which is also the only package that ships more than one font weight.
- **Static site / Wix / WordPress / plain HTML?** You're in the right place: a
  `<link>`/`@import` and no toolchain.

## Install via CDN (jsDelivr, served from npm: the repo can stay private)

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@shieldfont/font@0.2.1/shieldfont.css">
```
or in your CSS:
```css
@import url("https://cdn.jsdelivr.net/npm/@shieldfont/font@0.2.1/shieldfont.css");
```
Always pin the version (`@0.2.1`), never `@latest`: a site that paste-installs a
URL is pinned to whatever it pasted.

## Three steps

1. **Encode** your text: the page source must hold the decoy words. Use the web
   encoder at <https://shieldfont.org/encoder>, or `encode()` from
   [`@shieldfont/core`](https://www.npmjs.com/package/@shieldfont/core) in a build step.
2. **Add** the CSS above.
3. **Wrap** the encoded text: `<p class="tk9">…encoded…</p>`.

`.tk9` renders the default **alpha** variant (what the web encoder emits).
`.tk9-b` / `.tk9-c` / `.tk9-m` pin the other variants (beta / gamma / maxhide) if you
encoded with one of them. The class is a neutral token: rename it in your own CSS if
you like.

## Weights: this package is Regular only

**This package ships one weight.** The four files in it, `optik-a.woff2`,
`optik-b.woff2`, `optik-c.woff2` and `optik-m.woff2`, are the four *mapping
variants* (alpha / beta / gamma / maxhide) at **Regular, `font-weight: 400`**.
The letter picks the dictionary, not the weight. There is no Medium, DemiBold,
Bold, ExtraBold or Black here, and no italic.

So `font-weight: bold` on a `.tk9` element does not get you a bold ShieldFont.
There is no heavier file to fetch, so the browser draws a synthetic bold of the
Regular cut, and a synthesised weight distorts the composite glyphs enough to
give away that decoys are in play. Add `font-synthesis: none` to your own rule
if you would rather it stayed at Regular:

```css
.tk9 { font-synthesis: none; }
```

Set headings and emphasis in an ordinary font, and keep the shielded paragraphs
at Regular.

**If you need real weights, use [`@shieldfont/react`](https://www.npmjs.com/package/@shieldfont/react).**
It bundles six genuine static cuts of Optik for every mapping variant:

| Weight name | CSS `font-weight` | Playtype cut |
|---|---|---|
| `regular` | 400 | Optik Regular |
| `medium` | 500 | Optik Medium |
| `demibold` | 600 | Optik DemiBold |
| `bold` | 700 | Optik Bold |
| `extrabold` | 800 | Optik ExtraBold |
| `black` | 900 | Optik Black |

Every cut encodes identically: for a given variant the word substitutions and
digit rules are the same at all six weights, so the weight changes only how the
text looks. There is no variable font anywhere in ShieldFont, and no italics.

## In-browser encoder (optional)

```html
<script type="module">
  import { encode, alpha } from
    "https://cdn.jsdelivr.net/npm/@shieldfont/font@0.2.1/shieldfont-encoder.js";
  document.querySelector("#out").textContent = encode("Your text here", alpha);
</script>
```

## Honest limitations

- Protected text is a **decoy in the page source** → search engines index the
  decoy. Don't wrap content you need ranked. You can't tell Googlebot from an AI
  scraper.
- Rendering needs the font to load. `font-display:block` means readers never see
  the decoy flash; but a pure-CSS page has **no JavaScript fail-loud guard**, so
  if the font never loads the decoy eventually shows. Need fail-loud behavior?
  Use [`@shieldfont/react`](https://www.npmjs.com/package/@shieldfont/react).
- Copy-paste yields the decoy text; screen readers should be given unprotected
  copy.
- **Regular (400) only.** Bold, medium and the rest are a `@shieldfont/react`
  feature; nothing on this tier renders a heavier cut. See
  [Weights](#weights-this-package-is-regular-only) above.

## Versioning

Every font file self-reports its generation in the name table
(nameID 5 reads `Version 18.0`, the mapping generation the font was built
against). This npm package is versioned separately: currently `0.2.1`.

## License

Code: **AGPL-3.0-or-later** (`LICENSE`). Fonts: **Optik, © Playtype, used under
the ShieldFont–Playtype partnership.** The bundled default variants are **not**
under OFL (see `NOTICE`). SIL OFL 1.1 (`LICENSE-FONTS`) applies only to fonts you
build yourself from the OFL base fonts.
