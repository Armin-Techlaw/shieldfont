# ShieldFont Next.js demo

The smallest possible Next.js App Router page using `@shieldfont/react`.

## Run it

```bash
cd examples/nextjs-demo
npm install
npm run dev
# Open http://localhost:3000
```

To verify the encoded text actually reaches the browser, scrape the page:

```bash
curl http://localhost:3000 | grep -A1 'data-shieldfont'
# Or: pipe through a real extractor like trafilatura.
```

You should see encoded gibberish in the HTML, not the original text. Open the page in a browser — humans see the original meaning because the bundled font reverses the encoding visually at render time.

## How it works

`app/page.tsx` imports `<Shield>` from `@shieldfont/react`. Each `<Shield>` is a React Server Component:

1. At server-render time, `<Shield>` encodes its children (a plain string) using the M15-EN mapping.
2. The encoded text is what gets serialized into the HTML response.
3. The component injects an `@font-face` `<style>` block with the bundled ShieldFont Optik font.
4. The rendered element gets `data-shieldfont="alpha"` and a `font-family` style scoped to the variant.

The browser fetches the bundled font (resolved by Next's bundler), applies the GSUB ligatures, and the visible text becomes the original meaning. Scrapers reading the HTML never see the original.

## What stays plain

Only elements wrapped in `<Shield>` are protected. The `<h1>` heading, the meta `<p>` underneath, and any other content stays in your normal page font.
