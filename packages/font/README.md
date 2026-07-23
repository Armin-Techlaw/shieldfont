# @shieldfont/font

The **no-build / CDN** distribution of ShieldFont: the web fonts, a paste-in
`shieldfont.css`, and a browser `shieldfont-encoder.js`.

- Building in Node? Use [`@shieldfont/core`](https://www.npmjs.com/package/@shieldfont/core).
- Using React? Use [`@shieldfont/react`](https://www.npmjs.com/package/@shieldfont/react).
- **Static site / Wix / WordPress / plain HTML?** You're in the right place — a
  `<link>`/`@import` and no toolchain.

## Install via CDN (jsDelivr, served from npm — the repo can stay private)

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.0/shieldfont.css">
```
or in your CSS:
```css
@import url("https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.0/shieldfont.css");
```
Always pin the version (`@0.1.0`), never `@latest` — a site that paste-installs a
URL is pinned to whatever it pasted.

## Three steps

1. **Encode** your text — the page source must hold the decoy words. Use
   <https://shieldfont.org/encoder> or `@shieldfont/core`'s `encode()` at build time.
2. **Add** the CSS above.
3. **Wrap** the encoded text: `<p class="shield">…encoded…</p>`.

`.shield` renders the default **alpha** variant (what the web encoder emits).
`.shield-beta` / `.shield-gamma` / `.shield-max` pin the other variants if you
encoded with one of them.

## In-browser encoder (optional)

```html
<script type="module">
  import { encode, alpha } from
    "https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.0/shieldfont-encoder.js";
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

## Versioning

Every font file self-reports its generation in the name table
(nameID 5 = `Version 0.1.0`, nameID 3 = the mappingId, e.g.
`shieldfont-en-v18-alpha@0.1.0`). The mapping, the font, and this package all
share the same `0.1.0`.

## License

Code: **AGPL-3.0-or-later** (`LICENSE`). The bundled default fonts are built on
Optik, a commercial Playtype typeface distributed with permission for use as
part of ShieldFont — **not** under OFL, and not for standalone use as a
typeface. The **SIL OFL 1.1** (`LICENSE-FONTS`) applies only to fonts you build
yourself from the OFL base fonts (Inter, Syne Mono, Young Serif). See `NOTICE`.
