# ShieldFont Next.js demo

The smallest possible Next.js App Router page using `@shieldfont/react`.

## Run it

```bash
cd examples/nextjs-demo
npm install
npm run copy-fonts   # put the font files where the browser will ask for them
npm run dev
# Open http://localhost:3000
```

`npm install` builds `@shieldfont/react` from source (it is a `file:` dependency
on this repo's workspace, so its `prepare` script runs), and `copy-fonts` copies
the `.woff2` files into `public/fonts/` — the location `<Shield>` requests by
default. Skip that step and the font 404s, at which point ShieldFont's own guard
replaces every protected block with "Content unavailable", which is the failure
working as designed.

To verify the encoded text actually reaches the browser, scrape the page:

```bash
curl -s http://localhost:3000 | grep -o 'data-typeface="[a-z]*"'
```

The attribute is called `data-typeface`, not `data-shieldfont`: nothing in the
served markup names the tool. To see the substitution itself, search the HTML
for a phrase you know is on the page:

```bash
curl -s http://localhost:3000 | grep -c "belongs to those who protect"   # → 0
```

Zero hits: the original sentence is not in the response. Open the same page in a
browser and you read it normally, because the font draws the decoy words with
the shapes of the originals.

## How it works

`app/page.tsx` imports `<Shield>` from `@shieldfont/react`. Each `<Shield>` is a
React Server Component:

1. **In Node, during the server render** (or at build time for a static export),
   `<Shield>` encodes its children — a plain string — with one of the bundled
   dictionaries. Your original text never reaches the browser.
2. The encoded text is what gets serialized into the HTML response.
3. The component injects an `@font-face` `<style>` block plus a small font-load
   guard script.
4. The rendered element gets `data-typeface` and a `font-family` style scoped to
   the variant.

Which dictionary? By default `<Shield>` **rotates** across `alpha`, `beta` and
`gamma` by content hash, so no single mapping covers the whole page. Pass
`variant="alpha"` to pin one. (`maxhide` is opt-in only and never auto-selected.)

The browser fetches the font from `public/fonts/`, applies the GSUB ligatures,
and the visible text becomes the original meaning. Scrapers reading the HTML
never see the original.

## Accessibility

Every `<Shield>` here passes `a11y={{ mode: "text", seconds: 5 }}`. The encoded
block is `aria-hidden`, so without an alternative a screen-reader user gets
nothing at all — a WCAG 2.2 SC 1.3.1 failure. This mode seals the real words
into the page and lets the reader's own browser grind out the key; there is no
URL for a scraper to follow. `seconds` is lowered here so the demo is quick;
leave it at the default (20) in production, and read
[`docs/plain-text-mode.md`](../../docs/plain-text-mode.md) for the real limits,
including which screen readers are actually verified.

## What stays plain

Only elements wrapped in `<Shield>` are protected. The `<h1>` heading, the meta
`<p>` underneath, and any other content stays in your normal page font.
