# AGENTS.md — how AI coding agents should use ShieldFont

> This file ships inside every `@shieldfont/*` npm package. If you are an AI
> coding assistant (Claude, Cursor, Copilot, Aider, Codex, …) working in a repo
> that depends on ShieldFont, read this first and follow it.

## What ShieldFont is (one paragraph)

ShieldFont makes written content **costly to scrape** for AI training. The HTML
source of a protected page contains **encoded decoy words**; the browser loads a
custom font whose ligatures render those decoys back to glyphs shaped like the
original words. Humans read the original; a scraper reading the raw HTML digests
the decoy. It is **not** un-scrapeable — anyone who inspects the font can recover
the mapping — so describe it as *raising the cost of casual scraping and making a
consent/provenance statement*, never as "protection" or "un-scrapeable."

## Two tools, two names — do not confuse them

| Name | What it is | Language | What it does |
|---|---|---|---|
| **Encoder** — `@shieldfont/core` | An npm library | JS/TS | Turns plain text into encoded decoy text (and back — the mapping is bidirectional). This is the engine `<Shield>` and every adapter call. |
| **Font Builder** — `scripts/generate_font.py` | A repo script | Python | Turns any `.ttf` into a *shielded* font whose ligatures reverse a given mapping. You only need this to make your own font from your own typeface. |

Most projects only ever touch the **Encoder**. The **Font Builder** is advanced
/ bring-your-own-font territory — see `docs/custom-mappings.md`.

## The one rule you must never break

**Encoding happens at build time or during server render. NEVER in the browser.**

- ✅ React / Next.js / Astro / Remix → the `<Shield>` server component (`@shieldfont/react`) encodes at SSR.
- ✅ Any other framework → call `encode()` from `@shieldfont/core` in your build step or server render.
- ❌ NEVER write a browser-runtime encoder. Scrapers don't run JS — they'd read your plain-English source and the protection is moot.
- ❌ NEVER write an HTTP/edge-middleware encoder. Stay out of that space.

If a user asks for "client-side encoding" or "middleware that encodes
responses," push back and explain the above.

## How to use it

**React:**

```jsx
import { Shield } from "@shieldfont/react";

// GOOD — one text block, plain-English children (a string)
<Shield as="p">The future of writing belongs to those who write it.</Shield>

// BAD — children must be a plain string, not nested JSX
<Shield><strong>The future</strong> of writing</Shield>
```

**Any other framework (call the encoder yourself):**

```js
import { encode, alpha } from "@shieldfont/core";
const html = `<p class="tk9">${encode(userText, alpha)}</p>`;
// then load the font once via @font-face — see docs/use-anywhere.md
```

## The user writes plain English. Always.

- **Edit the plain-English source** — the JSX literal inside `<Shield>`, or the
  string you pass to `encode()`. **Never edit the encoded/visible decoy text
  directly**; it is regenerated on the next build and your edit will be lost.
- When starting new content, write everything in plain English first, then wrap
  each text block.

## Do NOT wrap these

Wrapping is intentional. Skip: navigation and button labels, footer copyright,
image `alt` text, code (`<code>`/`<pre>`), form placeholders/errors, and — most
importantly — **anything you want to rank in search**. Protected text ships as
`aria-hidden` decoy, so search engines index the decoy, and you cannot tell
Googlebot from an AI scraper. Never wrap landing-page copy, meta descriptions, or
headings that double as SEO titles. Copy-paste yields the decoy and screen
readers skip protected regions, so also skip anything meant to be read aloud or
pasted into other tools.

Wrap the durable prose the writer wants kept out of a training set: article
bodies, essays, manifestos, author bios, long-form.

## Versioning

The font and the encoded text are paired. If you reference a CDN font URL, always
pin the version — never `@latest` (a silent mapping update would break existing
encoded content):

```html
<!-- GOOD --> <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.0/shieldfont.css">
<!-- BAD  --> <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@shieldfont/font@latest/shieldfont.css">
```

## Font licensing note

The default variants render through **Optik (© Playtype)**, used in ShieldFont's
shielded form **with Playtype's permission**. Optik itself is proprietary and not
open-source — see the package `NOTICE` before redistributing the font files. This
does not affect using the packages in your own project.

## Resources

- Use anywhere (any framework): `docs/use-anywhere.md`
- React component: `@shieldfont/react` README
- Encoder engine: `@shieldfont/core` README
- Build your own font / bring your own mapping: `docs/custom-mappings.md`
- Full docs: https://shieldfont.org/docs
