# Integrating ShieldFont: the four tiers

ShieldFont ships in four flavors depending on how you build pages. Pick the one that matches your stack:

| Tier | Audience | Install | Encoding happens... |
|---|---|---|---|
| [**A. JSX** (`<Shield>` component)](#tier-a-jsx-with-shieldfontreact) | React / Next.js / Astro / Remix | `npm i @shieldfont/react` | At server-render time |
| [**B. Any framework / build step**](#tier-b-any-framework--build-step-shieldfontcore) | Vue, Svelte, Astro/11ty/Hugo builds, CI pipelines | `npm i @shieldfont/core` | In your build or server render |
| [**C. CSS @import + paste**](#tier-c-css-import--paste) | Blogs, hosted CMSes, plain HTML | one-line `@import` in your site CSS | At encoder time (browser tool) |
| [**D. Downloadable font**](#tier-d-download-microsoft-word--pdf) | Microsoft Word, Pages, InDesign, PDF authors | download the font + use the web encoder | At Word/PDF render time via OpenType ligatures |

All four tiers share the same default `alpha` mapping (v18): just different delivery mechanisms.

> **How much each tier reveals differs.** React hides the most (neutral font family `Optik`, neutral filenames, no version, no telltale class); the downloadable font is branded on purpose. For the concealment / protection-level story tier by tier, see [Concealment & camouflage](./concealment.md).

---

## ⚠️ Before you wrap anything: SEO and other honest caveats

Protected text ships as `aria-hidden` decoy words in the DOM. Read this before you decide *what* to wrap:

- **SEO: the big one.** Search engines index the *decoy* text, not your real words. You **cannot** distinguish Googlebot from an AI scraper, the same bytes go to both, so **don't wrap content you want to rank** (landing pages, product copy, meta descriptions, headings that double as SEO titles). Wrap the durable prose you'd rather keep out of a training set: essays, manifestos, long-form.
- **Copy-paste** yields the encoded form, not the original.
- **Screen readers** skip protected regions: they're removed from the accessibility tree. Don't wrap anything a user needs read aloud.
- **JS off + font 404.** The fail-loud font guard is JavaScript; with JS disabled and the font missing, a human sees the raw decoy text.
- **Coverage is partial by design.** The default `alpha` mapping deliberately leaves common function words in place, so a short sentence may change only ~2 of its ~11 words. The output is a *plausible decoy*, not gibberish.

---

## The architectural rule we won't cross

**All encoding happens at build time. Never in the browser. Never at HTTP-response time.**

- Browser-runtime JS encoders are fundamentally broken: scrapers don't run JS, so they see your plain English. Protection is moot.
- Edge-middleware encoding is technically secure but adds runtime cost on every request. We're staying out of that space.

The encoded form is what's stored, what's served, what's cached. Identical to how Tailwind compiles classes at build time.

---

## Dynamic sites

If you're building a React / Next.js / Remix / Astro app, you ship ShieldFont as a server component. Encoding happens at SSR: no runtime cost in the browser, no build script. See **Tier A** below for the full integration.

[Jump to Tier A, JSX with @shieldfont/react ↓](#tier-a-jsx-with-shieldfontreact)

---

## Tier A: JSX with `@shieldfont/react`

The recommended path for vibe-coders, Next.js apps, Astro, Remix, and any React Server Component framework.

### Install

```bash
npm install @shieldfont/react
```

### Use

```jsx
import { Shield } from "@shieldfont/react";

export default function Page() {
  return (
    <article>
      <h1>About us</h1>             {/* not protected — plain font */}

      <Shield>
        The future of writing belongs to those who protect their words.
      </Shield>

      <Shield as="p" weight={500} lineHeight={1.7}>
        Our mission is to build a publishing layer that the open web can trust.
      </Shield>

      <Shield as="h2" size="2.4rem">
        Manifesto
      </Shield>
    </article>
  );
}
```

That's it. The font + `@font-face` + encoding all happen automatically. Anything outside `<Shield>` uses your normal page fonts.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `as` | `ElementType` | `"div"` | Which HTML element to render. |
| `variant` | `"alpha" \| "beta" \| "gamma" \| "maxhide"` | auto-rotate | Mapping + font variant. Left unset, `<Shield>` **auto-rotates** `alpha`/`beta`/`gamma` by content hash (so one site uses all three). Pin one to fix it, or `"maxhide"` for the M15 coverage-max dictionary. |
| `weight` | `100..900` | inherit | Font weight (Optik is variable). |
| `lineHeight` | `number \| string` | inherit | Passthrough. |
| `size` | `string` | inherit | font-size passthrough. |
| `className` | `string` | n/a | Escape hatch, merges with internal scope. |
| `style` | `CSSProperties` | n/a | Escape hatch. |
| `children` | `string` | required | The text to encode (must be a plain string). |

### Host the font (required: self-host by design)

The React component is **self-host only**: it never points at a public CDN it
doesn't control. Reason: a typography-based defense must *fail loud*, never
silent. If the font can't load, a bundled 4-second guard replaces protected text
with "Content unavailable"; it must never fall back to showing the raw decoy. A
CDN you don't own can vanish and break that guarantee, so you serve the font
yourself.

Copy the font files bundled inside the package:

```bash
cp node_modules/@shieldfont/react/fonts/optik-*.woff2 public/fonts/
```

> The React tier bundles its **own** version-neutral fonts (name table reads
> `Version 1.0`), so nothing in your served bytes names a dictionary version. That
> is why it doesn't reuse `@shieldfont/font`, whose fonts embed the version as the
> CDN tier's one deliberate tell.

The default `fontHost` is `/fonts`, which matches the copy above. Serve them
elsewhere? Point Shield at it:

```jsx
// somewhere in your app's bootstrap (server-side)
import { setFontHost } from "@shieldfont/react";
setFontHost("/static/shieldfont"); // your own path or your OWN CDN — not jsDelivr
```

The files are `optik-a.woff2` (alpha, default), `optik-b.woff2` (beta),
`optik-c.woff2` (gamma), `optik-m.woff2` (maxhide). The React tier keeps these
filenames and the font family (`Optik`) neutral, so nothing in your served bytes
names ShieldFont.

### Verify it's working

After running `next build` (or `astro build` or whatever), scrape your own page:

```bash
curl https://your-site.com/some-protected-page | grep 'data-typeface'
```

You should see encoded text in the HTML, not the original English. Open the same URL in a browser: humans see the original because the font reverses the encoding visually.

### Restrictions

- **Children must be a string.** No nested JSX. For mixed content (text + links), split into multiple `<Shield>` instances.
- **Server-only.** v1 has no client component: encoding must happen on the server so the encoded text reaches the browser.

---

## Blogs and static sites

If your site is a blog, a hosted CMS (WordPress / Ghost / Squarespace), or plain HTML where you control the site's CSS but don't run a build step, you use the **CSS @import + paste** flow. Drop one `@import` line into your site's CSS once, then paste encoded paragraphs anywhere in your body content. See **Tier C** below.

If your site is an SSG (Astro / 11ty / Hugo / Jekyll) with a real build pipeline, call `@shieldfont/core` directly in your build: encode plain English, or use the comment-marker helpers to keep your source-of-truth in the file. See **Tier B**.

[Jump to Tier C, CSS @import + paste ↓](#tier-c-css-import--paste) · [Jump to Tier B, any framework ↓](#tier-b-any-framework--build-step-shieldfontcore)

---

## Tier B: Any framework / build step (`@shieldfont/core`)

Not on React? The encoder is a **zero-dependency JavaScript library** you call
yourself: in a Vue/Svelte/Angular server render, an Astro/11ty/Hugo build hook, a
Vercel/Cloudflare build step, anywhere the encoding runs **before the HTML reaches
the browser**. (The CLI that used to live here was only ever a thin wrapper around
this library; call the library directly instead.)

### Install

```bash
npm install @shieldfont/core
```

### Encode

```js
import { encode, alpha } from "@shieldfont/core";

const html = `<p class="tk9">${encode("The future of writing", alpha)}</p>`;
// → <p class="tk9">The future for watching</p>
```

Then load the font once with ten lines of `@font-face` (self-host from
`@shieldfont/font`, or the CDN bundle in Tier C below). Add `class="tk9"` to any
element you want rendered through the protection font.

### Keep your plain-English source as the source of truth

For static HTML in git, `@shieldfont/core` ships comment-marker helpers: `buildHtml` (re-derive the decoy from a `<!-- shield: … -->` source comment,
idempotently), `checkHtml` (verify round-trip; fail CI on mismatch), and
`shipHtml` (strip every comment before deploy so the shipped HTML carries zero
signal). A ~12-line build script replaces the old CLI entirely.

👉 **Full recipe (encode, `@font-face`, and the marker-based build script) is in
[Use anywhere](./use-anywhere.md).**

---

## Tier C: CSS @import + paste

The lowest-friction path for blogs, hosted CMSes (WordPress, Ghost, Squarespace), and anyone who controls their site's CSS but doesn't have a build step. Two pastes: one is permanent site setup, one is per protected paragraph.

### Step 1: One-time install (paste into your site's CSS)

```css
@import url('https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.1/shieldfont.css');
```

Where to put it depends on your platform:

- **WordPress**: Appearance → Customize → Additional CSS (Customizer plan and above), or your theme's `style.css`.
- **Ghost**: Settings → Code injection → Site header (or the Custom CSS field if your theme exposes one).
- **Squarespace**: Design → Custom CSS (this panel is available on every plan; the Code Injection panel is gated to Business+ but you don't need it for this).
- **Plain HTML / static sites**: either drop the `@import` into your existing stylesheet, or use `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.1/shieldfont.css">` in `<head>`. The `<link>` form is marginally faster (parses in parallel with HTML): prefer it if you have `<head>` access.

This stylesheet declares `@font-face` for `'Optik'` and ships a `.tk9` utility class.

> **Which dictionary version?** On the CDN tier the font family and filenames stay neutral, but the font stamps the **dictionary generation** it was built for into its own version field: the one deliberate tell of this tier. Encoded text only reads back correctly under a font whose version matches the dictionary that encoded it, so if you (or a collaborator) re-render a page later, read the font's version to pair it with the right dictionary. See [Checking your font version](./concealment.md#checking-your-font-version).

### Step 2: Per-paragraph paste (anywhere in body content)

Encode your text in the [encoder](https://github.com/isaqueseneda/shieldfont) (visit the site, paste plain English on the left, copy the embed on the right), then paste the result into your post body:

```html
<p class="tk9">
  …encoded text from the encoder…
</p>
```

That's the entire embed. No `<link>`, no inline `style`, no `<script>`: just a paragraph with a class. This shape survives the strictest CMS sanitizers, including WordPress KSES for non-admin authors.

### Where this works, and where it doesn't

| Platform | Step 1 (CSS @import) | Step 2 (paragraph paste) |
|---|---|---|
| Self-hosted WordPress | ✅ Customizer or theme `style.css` | ✅ |
| WordPress.com (Premium+) | ✅ CSS Customizer | ✅ |
| Ghost | ✅ Code Injection / Custom CSS | ✅ |
| Squarespace (any plan) | ✅ Custom CSS panel | ✅ |
| Static HTML / SSG | ✅ Your own stylesheet | ✅ |
| **Substack** | ✗ no custom CSS/HTML in posts | ✗ |
| **Medium** | ✗ no custom CSS/HTML in posts | ✗ |

Substack and Medium are out by platform policy: they don't accept custom CSS or HTML in user content at all. For now, the only ShieldFont path that reaches those audiences is exporting protected PDFs (Tier D).

### Why single-variant on this tier

The React route (Tier A) rotates between three variants (alpha / beta / gamma) so adversarial scrapers can't fingerprint protected pages by font-family name. That rotation depends on the React component running at SSR time. The CSS tier doesn't have one, there's no JavaScript involved, so it ships one variant. If you need rotation, use `@shieldfont/react`.

---

## Tier D: Download (Microsoft Word / PDF)

For journalists, document authors, anyone sending PDFs through email.

You need two things, both on the site:

| What | Where |
|---|---|
| The font | <https://shieldfont.org/fonts/shieldfont-alpha.ttf> (also linked from the homepage) |
| The encoder | <https://shieldfont.org/encoder> |

**Workflow:**

1. Install `shieldfont-alpha.ttf` on your system.
2. **Encode your text first.** Open the [encoder](https://shieldfont.org/encoder), paste your plain English, and copy the **encoded** output.
3. Paste the **encoded** text into Word / Pages / InDesign, then set the ShieldFont font on those paragraphs. The font's GSUB ligatures render the encoded words back to glyphs *shaped like the originals*, so a human reading the page sees your original English, while the document's underlying text stream stays the encoded decoy.
4. Export to PDF. The decoy (encoded) form is what's stored in the PDF's text layer; readers still see the original through the font.
5. Email the PDF. If your recipient's email provider scrapes attachments to train AI models, the encoded text is useless training data.

> ⚠️ **Don't type plain English straight into the document.** The mapping is an involution, so typing plaintext fires the ligatures in reverse: you'd see the *decoy* on screen while the file quietly stores your real words (the exact opposite of the protection you want). Always encode first, then paste the encoded text.

For documents you'll edit later, also keep a plain-English source copy somewhere (the encoder decodes as well as encodes, but a source file is cheaper than a round trip).

---

## Versioning

Every CDN URL we publish is **version-pinned and immutable**. No "latest" channels: silently upgrading the mapping would break existing encoded content.

```
✅ https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.1/shieldfont.css
❌ https://cdn.jsdelivr.net/npm/@shieldfont/font@latest/shieldfont.css
```

Upgrading to a new mapping version is opt-in: re-run your `@shieldfont/core` build (Tier B), bump the npm package (Tier A), regenerate your snippet (Tier C), or re-download (Tier D).

## Threat model: what ShieldFont does and doesn't protect against

**Defends:**
- Naive HTML scrapers (`curl + regex`, `requests + BeautifulSoup`, trafilatura, readability-lxml)
- Bulk dataset pipelines that read `innerText` without rendering fonts
- Email attachment scrapers (PDF/DOCX exports keep encoded text)
- Copy-paste into text-only tools

**Does not defend:**
- Headless browsers that fully render fonts (Playwright, Puppeteer)
- OCR on rendered pages or screenshots
- Vision-language models reading screenshots
- Frequency analysis on a large corpus (per-deploy random seeds coming in v2.3)

Our framing: **ShieldFont raises the cost of extraction; it doesn't promise zero extraction.**

---

## Next steps

- For any non-React stack: [Use anywhere](./use-anywhere.md): call `@shieldfont/core` in your build or server render.
- For AI co-pilots: drop [`docs/CLAUDE.md`](./CLAUDE.md) (or the [`AGENTS.md`](../AGENTS.md) that ships in every package) into your project so Claude / Cursor / GPT / Aider follow the convention by default.
- For new framework adapters: the wire format (comment markers) is documented in [`@shieldfont/core`](../packages/core/README.md); list your adapter in [`ADAPTERS.md`](../ADAPTERS.md).
- For mapping internals: see [`MAPPINGS.md`](../MAPPINGS.md) for the M0 → M15 evolution and the [white paper](https://shieldfont.org/white-paper).
