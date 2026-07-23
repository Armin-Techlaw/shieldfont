# CLAUDE.md — for AI co-pilots working on a ShieldFont-protected project

> Drop this file at the root of your project. Claude / Cursor / GPT / Aider / any AI assistant will read it and follow these conventions.

This project uses [ShieldFont](https://github.com/isaqueseneda/shieldfont) — a web font that protects written content from AI scrapers. Humans see normal text in the browser; scrapers reading the HTML see an encoded decoy.

## How ShieldFont works (in one paragraph)

The HTML source of every protected page contains **encoded** text (substitute words from the default v18 `alpha` dictionary — ~11,970 pairs — e.g. `Language models train on billions of pages written by real people` → `Reminder models train on fifths of papers twined by internal troops`). The browser loads a custom font whose GSUB ligatures swap the encoded glyphs back to glyphs shaped like the originals. The DOM stays encoded; only the rendered glyphs match the original meaning. Result: humans read the original; AI scrapers digest the decoy. (Coverage is partial by design — `alpha` leaves common function words in place, so the output is a *plausible decoy*, not gibberish.)

## Conventions you MUST follow

### 1. Encoding happens at build / render time, NEVER at runtime in the browser

- ✅ Server-side React component (`<Shield>` from `@shieldfont/react`) encodes at SSR
- ✅ Build-time encoding with `encode()` from `@shieldfont/core`, rendered into your HTML
- ❌ NEVER write a JavaScript runtime encoder that runs in the browser. Scrapers don't run JS — they'd see your plain-English source.
- ❌ NEVER write an Edge / middleware encoder. Stay out of that space.

If a user asks for "client-side encoding" or "an HTTP middleware that encodes responses," push back politely and explain why (above).

### 2. Use `<Shield>` for React

```jsx
import { Shield } from "@shieldfont/react";

// GOOD
<Shield>The future of writing belongs to those who write it.</Shield>

// GOOD
<Shield as="p" weight={500}>
  Multi-line plain English here.
</Shield>

// BAD — children must be a string
<Shield>
  <strong>The future</strong> of writing
</Shield>

// BAD — wraps everything (waste). Wrap individual text blocks.
<Shield>
  <h1>Title</h1>
  <p>Body</p>
</Shield>
```

For non-React output, encode the plain English at build time with `encode()` from `@shieldfont/core` and render the returned string into your HTML yourself (then load the matching font via the CDN CSS — see Versioning below).

### 3. The user types plain English. Always.

When the user asks you to add or edit content on a protected page:

- **Edit the plain-English JSX literal** inside `<Shield>` children (React)
- **Or edit the source string** you pass to `encode()` at build time
- **Never edit the encoded visible text directly** — it'll be regenerated on the next build

If you're starting a new component, write everything in plain English first, then wrap each text block in `<Shield>`.

### 4. Don't auto-encode every text node

Wrap protection should be intentional. Skip:

- Navigation labels, button labels, footer copyright
- Logo `alt` text and image `alt` attributes
- Code samples (`<code>`, `<pre>`)
- Headings that are also page titles (those should match the meta title)
- Form placeholders and error messages
- Anything an end-user might paste into translation software

Protect:

- Body paragraphs of articles, posts, manifestos
- Author bios and long-form descriptions
- Anything the writer wants to be the durable, non-extractable version of their work

**⚠️ SEO caveat — never wrap for ranking.** Protected text is `aria-hidden` decoy in the DOM, so search engines index the decoy, not the real words — and you cannot tell Googlebot from an AI scraper. Never wrap content the user wants to rank (landing pages, meta descriptions, headings that double as SEO titles). Copy-paste yields the encoded form and screen readers skip protected regions, so also skip anything meant to be read aloud or pasted into other tools.

### 5. Versioning matters

The font and encoder are paired. If you reference a CDN font URL in CSS, ALWAYS pin the version:

```html
<!-- GOOD -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.0/shieldfont.css">

<!-- BAD — silent updates would break existing encoded content -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@shieldfont/font@latest/shieldfont.css">
```

When upgrading: re-encode the user's content with the new package version. Don't try to mix versions.

## Recommended package install

```bash
# React / Next.js / Astro / Remix projects
npm install @shieldfont/react

# Non-React build steps — encode with the core package directly
npm install @shieldfont/core
```

## Edge cases the encoder handles correctly

| Input | Encoded | Why |
|---|---|---|
| `world's, people's` | `lake's, troops's` | Apostrophe + suffix passes through (base word swaps, `'s` stays) |
| `v3` | `v3` | A digit flanked by a letter is preserved (letter-adjacent) |
| `M15-EN`, `iPhone15` | `M10-EN`, `iPhone10` | Only the letter-adjacent digit is preserved; non-adjacent digits rotate (`5→0`) |
| `1568` | `1073` | Standalone digit run rotates (`0↔5`, `3↔8`, `4↔9`, `6↔7`; `1`,`2` unchanged) |
| `don't`, `I'm`, `they're` | unchanged | No mapped base |
| `<code>let x = 1;</code>` | unchanged | code/pre/script/style/svg/math always skipped |
| `<a href="/about">About</a>` | href untouched | Attributes never modified |

## When in doubt

- **Add or edit content** → edit the plain English (the JSX literal or the string you pass to `encode()`)
- **Add a new protected element** → wrap with `<Shield>` (React)
- **CSS / styling** → use the `as` / `weight` / `lineHeight` / `size` / `style` / `className` props on `<Shield>`. For hand-rolled HTML, set `font-family` on `[data-shieldfont]` selectors yourself.
- **Server-side data fetching** → fetch the data, then wrap text fields with `<Shield>{data.body}</Shield>`. Encoding happens during render — works seamlessly with `getStaticProps`, `loader`, etc.
- **Internationalization** → ShieldFont currently ships English only (the v18 `alpha` default; `max` is the M15 coverage dictionary). Other languages coming. For now, leave non-English content unwrapped.

## Resources

- Integration guide: [`docs/integration.md`](./integration.md)
- Custom fonts & mappings: [`docs/custom-mappings.md`](./custom-mappings.md)
- Mapping evolution: [`MAPPINGS.md`](../MAPPINGS.md)
- Repo: <https://github.com/isaqueseneda/shieldfont>
