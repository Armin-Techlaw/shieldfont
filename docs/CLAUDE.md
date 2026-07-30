# CLAUDE.md: for AI co-pilots working on a ShieldFont-protected project

> Drop this file at the root of your project. Claude / Cursor / GPT / Aider / any AI assistant will read it and follow these conventions. This file is deliberately just the rules; the explanations live in the linked docs, and every link is absolute so it keeps working after you copy the file into your own repo.

This project uses [ShieldFont](https://github.com/isaqueseneda/shieldfont): a web font that makes written content costly to scrape for AI training. The HTML source of a protected page contains **encoded** decoy text (word substitutions from a paired dictionary, e.g. `belongs to those who write it` → `determines to those who sell it`); the browser loads a custom font whose GSUB ligatures render the decoys back to glyphs shaped like the originals. Humans read the original; scrapers reading the HTML digest the decoy. The DOM stays encoded. Coverage is partial by design: common function words stay in place, so the output is a *plausible decoy*, not gibberish, and a short sentence may change only a couple of words.

> [!NOTE]
> **Framing & status.** ShieldFont *raises the cost* of casual scraping and makes a consent/provenance statement: it is **not** un-scrapeable (anyone who inspects the font can recover the mapping). Describe it that way, not as "protection." The default fonts use **Optik** (© Playtype), shipped in ShieldFont's shielded (word-substitution) form with Playtype's permission: check the repo [NOTICE](https://github.com/isaqueseneda/shieldfont/blob/main/NOTICE) before redistributing font files.

## Conventions you MUST follow

### 1. The user's original text must never ship to the browser

- ✅ `<Shield>` from `@shieldfont/react` rendered in a **Server Component** (a static export is fully protected: no runtime server needed)
- ✅ Build-step or server-render call to `encode()` from `@shieldfont/core` (any other framework)
- ❌ `<Shield>` inside a `"use client"` component, or unencoded text passed from a server component into a client component as a prop. Both ship the plaintext (the first also compiles all four bundled dictionaries into the JS bundle) while the served page still *looks* encoded. The only visible symptom is `<Shield>`'s one-time console warning, which fires in production as well as development: check the console.
- ❌ NEVER write a JavaScript runtime encoder that runs in the browser. Scrapers don't run JS: they'd see the plain-English source.
- ❌ NEVER write an Edge / middleware encoder. Stay out of that space.

If a user asks for "client-side encoding" or "an HTTP middleware that encodes responses," push back politely and explain why (above). The measured leak table and a grep check for your own build: [Where the encoding happens](https://github.com/isaqueseneda/shieldfont/blob/main/docs/where-encoding-happens.md).

### 2. Use `<Shield>` for React, comment markers for HTML

For React / Next.js / Astro / Remix code:

```jsx
import { Shield } from "@shieldfont/react";

// GOOD
<Shield>The future of writing belongs to those who write it.</Shield>

// GOOD
<Shield as="p" weight="regular">
  Multi-line plain English here.
</Shield>

// BAD — THROWS. Children must be a plain string, never nested JSX.
<Shield>
  <strong>The future</strong> of writing
</Shield>

// BAD — THROWS. Same rule: a component is not a string.
<Shield as="article">
  <Teaser />
</Shield>

// GOOD — one <Shield> per text block
<Shield as="h2">The future of writing</Shield>
<Shield as="p">belongs to those who write it.</Shield>
```

`<Shield>` throws on anything that is not a plain string. That is deliberate: the encoder cannot see inside a component you wrote, so a best-effort walk would ship its text in plain English inside a block that still looks protected. Never work around the error by encoding in the browser; split the content instead.

For static HTML (via `@shieldfont/core`'s comment-marker helpers):

```html
<!-- GOOD: source-of-truth in the comment, encoded text between markers -->
<!-- shield: The future of writing belongs to those who write it. -->The future of writing determines to those who sell it.<!-- /shield -->

<!-- GOOD: first-time wrapping (build will normalize this) -->
<!-- shield-on -->
<h1>The future of writing</h1>
<p>Belongs to those who write it.</p>
<!-- shield-off -->

<!-- BAD: edit the visible text, not the comment. Comment is the source-of-truth.
     The next `buildHtml()` run will overwrite manual edits to the visible text. -->
<!-- shield: original here -->I MANUALLY EDITED THIS<!-- /shield -->
```

### 3. The user types plain English. Always.

- **Edit the source**: the JSX literal inside `<Shield>` children (React), or the plain English inside the `<!-- shield: ... -->` comment (HTML)
- **Never edit the encoded visible text directly**: it is regenerated on the next build
- Starting a new component? Write everything in plain English first, then wrap each text block
- Never call `encode()` twice on the same string: the mapping is its own inverse, so a double encode returns the original. `buildHtml()` is idempotent and safe to re-run. See [edge cases](https://github.com/isaqueseneda/shieldfont/blob/main/docs/use-anywhere.md#edge-cases-the-encoder-handles).

### 4. Wrap intentionally

- Protect durable long-form prose: article bodies, essays, manifestos, author bios. Skip chrome and utility text: navigation and button labels, `alt` text, code samples, headings that double as page titles, form placeholders and errors, anything meant to be pasted or translated. Full lists: [what to wrap, and what to skip](https://github.com/isaqueseneda/shieldfont/blob/main/docs/integration.md#what-to-wrap-and-what-to-skip).
- **⚠️ SEO: never wrap for ranking.** Protected text is `aria-hidden` decoy in the DOM: search engines index the decoy, and you cannot tell Googlebot from an AI scraper. Never wrap content the user wants to rank.
- **⚠️ Accessibility.** `<Shield>` hardcodes `aria-hidden="true"` with **no prop to turn it off**, so assistive tech skips protected regions rather than voice a decoy. Nobody hears gibberish. The accessible path is the **`a11y` prop**, which renders a real alternative as a sibling *outside* the hidden region and *before* it in DOM order. Three modes, and reach for the first by default:
  - `a11y={{ mode: "text" }}` — the block's real words, **encrypted into the page**, opened by a button in the reader's own browser (a 20-second budget of their CPU by default, once per block; 7.6 s measured in Chrome on a desktop). No `href`, no URL, nothing for the user to generate or host. That object on its own is a complete configuration. Everything else is optional: `seconds` (default 20, range 5..120), `reveal` (`"hidden"` default — the unlocked words go to assistive technology clipped off-screen while the encoded block stays on screen unchanged; `"visible"` replaces the block on screen instead, costing a layout shift and buying selection and copy-paste for everyone), `label` (overrides the button's accessible name; **never put the protected words in it**, the label ships in the HTML), `note` (overrides the explanatory sentence), and `visualHidden`, which **defaults to `true` for this mode** and `false` for audio. So by default the whole control is **screen-reader-only** and nothing about it appears on screen. Each block's button gets its own name ("Unlock the plain text for paragraph 2 (up to 20 seconds)"), the long note is spoken once per page, and the revealed text is announced on arrival and is a Tab stop so it can be re-read.
  - `a11y={{ mode: "audio", src }}` — a recording of the original words. Synthesise it **at build time**, never in the browser: browser `speechSynthesis` would read the decoy. The user has to produce this file.
  - `a11y={{ mode: "none" }}` — an explicit opt-out.

  **Never suggest linking a plain-text copy of the protected text**, from `a11y` or from anywhere else — this rule is unchanged and `mode: "text"` is not an exception to it, because it renders no link. A public plain-text URL sitting in the HTML is a free, one-line bypass for any scraper that follows it, which defeats the entire purpose of the package. (An `a11y={{ mode: "text", href }}` existed in `0.2.0` and was removed for exactly that reason. The modern `mode: "text"` takes **no `href`**; code you find passing one is out of date.) **Never raise `seconds` to "harden" a page**: difficulty is capped by the cost of OCR, which a crawler can always fall back to, so past ~20 seconds extra difficulty buys nothing and is paid for entirely by disabled readers waiting longer. Things to say out loud when you use this: `mode: "text"` **needs JavaScript** (plus `BigInt`, `crypto.subtle`, and a secure https origin) which is the one part of ShieldFont that does not work with JS off; because the control is invisible by default, **a sighted keyboard user with no screen reader Tabs into a control they cannot see and loses their focus indicator — a WCAG 2.2 SC 2.4.7 failure**, deliberate, and `visualHidden: false` restores an on-screen control; a reader who needs this **waits** while everyone else gets the words instantly, which is unequal access and a compromise, not a solution; **`mode: "audio"` on its own fails WCAG 2.2 SC 1.2.1 (Level A)** and the text mode does not rescue it, they are separate alternatives; and **the prop is React-only**, so anyone on the CDN paste-in or `@shieldfont/core` must set `aria-hidden` and build the alternative by hand. On testing, do not overstate it: verified under a virtual screen reader in CI and by hand with real **VoiceOver on macOS**, while **NVDA and JAWS are unverified**, with no axe scan and no published test page. How it works, the measured numbers and the full limits: [the plain-text mode](https://github.com/isaqueseneda/shieldfont/blob/main/docs/plain-text-mode.md). Full caveat list: [before you wrap anything](https://github.com/isaqueseneda/shieldfont/blob/main/docs/integration.md).
- ShieldFont currently ships English dictionaries only. Leave non-English content unwrapped.

### 5. Versioning matters

The font and encoder are paired: a page must be rendered by the font that matches the dictionary that encoded it. Always pin CDN URLs (`@shieldfont/font@0.3.0`, never `@latest`: silent updates would break existing encoded content). When upgrading, re-encode the user's content with the new package version; don't mix versions.

### 6. The build pipeline

- React / Next.js: no build step; `<Shield>` encodes during SSR automatically.
- Static HTML: a small build script calls `buildHtml()` (idempotent re-encode of the comment markers), `checkHtml()` (fail CI on a mismatch), and `shipHtml()` (strip the source comments before deploy). Full script: [Use anywhere](https://github.com/isaqueseneda/shieldfont/blob/main/docs/use-anywhere.md).

## Quick reference: the `@shieldfont/core` API

```js
import { encode, decode, buildHtml, shipHtml, checkHtml, alpha } from "@shieldfont/core";

encode(text, alpha);    // plain text → encoded
decode(text, alpha);    // encoded → plain (same operation; mapping is bidirectional)
buildHtml(html, alpha); // idempotent re-encode of <!-- shield: … --> comment markers
shipHtml(html);         // strip all <!-- shield: … --> comments before deploy
checkHtml(html, alpha); // verify markers round-trip → { total, passed, failed, mismatches }
```

What the encoder does to apostrophes, digits, accents, and skipped tags like `<code>`/`<pre>`: [edge cases](https://github.com/isaqueseneda/shieldfont/blob/main/docs/use-anywhere.md#edge-cases-the-encoder-handles).

## When in doubt

- **Add or edit content** → edit the plain English (the JSX literal or the comment source)
- **Add a new protected element** → wrap with `<Shield>` (React) or comment markers (HTML)
- **CSS / styling** → use the `as` / `weight` / `lineHeight` / `size` / `style` / `className` props on `<Shield>`. For HTML, set `font-family` on the `.tk9` class (or whatever you renamed it to) yourself.
- **Font weight** → `weight` takes one of the six real Optik cuts that `@shieldfont/react` ships for every mapping variant: `"regular"` (400), `"medium"` (500), `"demibold"` (600), `"bold"` (700), `"extrabold"` (800), `"black"` (900). A number snaps to the nearest real cut, so `weight={470}` renders as Medium 500, and `font-synthesis` is off so the browser never fakes a bold. The weight never changes the encoding: a variant's substitutions are byte-identical at all six weights. There is no variable font and no italic. **These weights exist in `@shieldfont/react` and nowhere else:** the CDN package `@shieldfont/font` and the downloadable font ship **Regular (400) only**, so on a static-HTML or Word/PDF project keep protected text at one weight and set headings and emphasis in an ordinary font. Full listing: [the weights section of the integration guide](https://github.com/isaqueseneda/shieldfont/blob/main/docs/integration.md#weights-the-six-cuts-tier-a-only).
- **Server-side data fetching** → fetch the data, then wrap text fields with `<Shield>{data.body}</Shield>`. Encoding happens during render: works seamlessly with `getStaticProps`, `loader`, etc.
- **Install** → `npm install @shieldfont/react` (React / Next.js / Astro / Remix) or `npm install @shieldfont/core` (any other framework, or a static-HTML build step)

## Resources

- Integration guide (tiers, caveats, threat model): <https://github.com/isaqueseneda/shieldfont/blob/main/docs/integration.md>
- The plain-text mode (`a11y={{ mode: "text" }}`, the time-lock puzzle, its limits): <https://github.com/isaqueseneda/shieldfont/blob/main/docs/plain-text-mode.md>
- Use anywhere (any framework, build script, edge cases): <https://github.com/isaqueseneda/shieldfont/blob/main/docs/use-anywhere.md>
- Where the encoding happens (the leak table): <https://github.com/isaqueseneda/shieldfont/blob/main/docs/where-encoding-happens.md>
- Wire format (comment markers) and full API: <https://github.com/isaqueseneda/shieldfont/blob/main/packages/core/README.md>
- Mapping evolution: <https://github.com/isaqueseneda/shieldfont/blob/main/MAPPINGS.md>
- White paper: <https://shieldfont.org/white-paper>
- Repo: <https://github.com/isaqueseneda/shieldfont>
