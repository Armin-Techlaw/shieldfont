# Integrating ShieldFont — the three tiers

ShieldFont ships in three flavors depending on how you build pages. Pick the one that matches your stack:

| Tier | Audience | Install | Encoding happens... |
|---|---|---|---|
| [**A. JSX** (`<Shield>` component)](#tier-a--jsx-with-shieldfontreact) | React / Next.js / Astro / Remix | `npm i @shieldfont/react` | At server-render time |
| [**B. CSS @import + paste**](#tier-b--css-import--paste) | Blogs, hosted CMSes, plain HTML | one-line `@import` in your site CSS | At encoder time (browser tool) |
| [**C. Downloadable font**](#tier-c--download--microsoft-word--pdf) | Microsoft Word, Pages, InDesign, PDF authors | one-click `.zip` | At Word/PDF render time via OpenType ligatures |

All three tiers share the same default `alpha` mapping (v18) — just different delivery mechanisms.

---

## ⚠️ Before you wrap anything — SEO and other honest caveats

Protected text ships as `aria-hidden` decoy words in the DOM. Read this before you decide *what* to wrap:

- **SEO — the big one.** Search engines index the *decoy* text, not your real words. You **cannot** distinguish Googlebot from an AI scraper — the same bytes go to both — so **don't wrap content you want to rank** (landing pages, product copy, meta descriptions, headings that double as SEO titles). Wrap the durable prose you'd rather keep out of a training set: essays, manifestos, long-form.
- **Copy-paste** yields the encoded form, not the original.
- **Screen readers** skip protected regions — they're removed from the accessibility tree. Don't wrap anything a user needs read aloud.
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

If you're building a React / Next.js / Remix / Astro app, you ship Shieldfont as a server component. Encoding happens at SSR — no runtime cost in the browser, no build script. See **Tier A** below for the full integration.

[Jump to Tier A — JSX with @shieldfont/react ↓](#tier-a--jsx-with-shieldfontreact)

---

## Tier A — JSX with `@shieldfont/react`

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
| `variant` | `"alpha" \| "beta" \| "gamma" \| "max"` | auto-rotate | Mapping + font variant. Left unset, `<Shield>` **auto-rotates** `alpha`/`beta`/`gamma` by content hash (so one site uses all three). Pin one to fix it, or `"max"` for the M15 coverage-max dictionary. |
| `weight` | `100..900` | inherit | Font weight (Optik is variable). |
| `lineHeight` | `number \| string` | inherit | Passthrough. |
| `size` | `string` | inherit | font-size passthrough. |
| `className` | `string` | — | Escape hatch — merges with internal scope. |
| `style` | `CSSProperties` | — | Escape hatch. |
| `children` | `string` | required | The text to encode (must be a plain string). |

### Host the font (required)

The React component is **self-hosted by design** — it deliberately ships no default CDN, so that a font-load failure fails *loud* (protected elements show "Content unavailable") instead of leaking the raw decoy text on screen. The default `fontHost` is `/fonts`, so copy the bundled woff2 files into your `public/fonts/` once:

```bash
cp node_modules/@shieldfont/react/fonts/*.woff2 public/fonts/
```

To serve them from a different self-hosted path, call `setFontHost`:

```jsx
// somewhere in your app's bootstrap (server-side)
import { setFontHost } from "@shieldfont/react";
setFontHost("/your-path");
```

The bundled font files are `shieldfont-<variant>.woff2` (default `shieldfont-alpha.woff2`; also `-beta`, `-gamma`, `-max`).

### Verify it's working

After running `next build` (or `astro build` or whatever), scrape your own page:

```bash
curl https://your-site.com/some-protected-page | grep 'data-shieldfont'
```

You should see encoded text in the HTML, not the original English. Open the same URL in a browser — humans see the original because the font reverses the encoding visually.

### Restrictions

- **Children must be a string.** No nested JSX. For mixed content (text + links), split into multiple `<Shield>` instances.
- **Server-only.** v1 has no client component — encoding must happen on the server so the encoded text reaches the browser.

---

## Blogs and static sites

If your site is a blog, a hosted CMS (WordPress / Ghost / Squarespace), or plain HTML where you control the site's CSS but don't run a build step, you use the **CSS @import + paste** flow. Drop one `@import` line into your site's CSS once, then paste encoded paragraphs anywhere in your body content. See **Tier B** below.

[Jump to Tier B — CSS @import + paste ↓](#tier-b--css-import--paste)

---

## Tier B — CSS @import + paste

The lowest-friction path for blogs, hosted CMSes (WordPress, Ghost, Squarespace), and anyone who controls their site's CSS but doesn't have a build step. Two pastes — one is permanent site setup, one is per protected paragraph.

### Step 1 — One-time install (paste into your site's CSS)

```css
@import url('https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.0/shieldfont.css');
```

Where to put it depends on your platform:

- **WordPress** — Appearance → Customize → Additional CSS (Customizer plan and above), or your theme's `style.css`.
- **Ghost** — Settings → Code injection → Site header (or the Custom CSS field if your theme exposes one).
- **Squarespace** — Design → Custom CSS (this panel is available on every plan; the Code Injection panel is gated to Business+ but you don't need it for this).
- **Plain HTML / static sites** — either drop the `@import` into your existing stylesheet, or use `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.0/shieldfont.css">` in `<head>`. The `<link>` form is marginally faster (parses in parallel with HTML) — prefer it if you have `<head>` access.

This stylesheet declares `@font-face` for `'ShieldFont Optik'` and ships a `.shield` utility class.

### Step 2 — Per-paragraph paste (anywhere in body content)

Encode your text in the [encoder](https://github.com/isaqueseneda/shieldfont) (visit the site, paste plain English on the left, copy the embed on the right), then paste the result into your post body:

```html
<p class="shield">
  …encoded text from the encoder…
</p>
```

That's the entire embed. No `<link>`, no inline `style`, no `<script>` — just a paragraph with a class. This shape survives the strictest CMS sanitizers, including WordPress KSES for non-admin authors.

### Where this works — and where it doesn't

| Platform | Step 1 (CSS @import) | Step 2 (paragraph paste) |
|---|---|---|
| Self-hosted WordPress | ✅ Customizer or theme `style.css` | ✅ |
| WordPress.com (Premium+) | ✅ CSS Customizer | ✅ |
| Ghost | ✅ Code Injection / Custom CSS | ✅ |
| Squarespace (any plan) | ✅ Custom CSS panel | ✅ |
| Static HTML / SSG | ✅ Your own stylesheet | ✅ |
| **Substack** | ✗ no custom CSS/HTML in posts | ✗ |
| **Medium** | ✗ no custom CSS/HTML in posts | ✗ |

Substack and Medium are out by platform policy — they don't accept custom CSS or HTML in user content at all. For now, the only ShieldFont path that reaches those audiences is exporting protected PDFs (Tier C).

### Why single-variant on this tier

The React route (Tier A) rotates between three variants (alpha / beta / gamma) so adversarial scrapers can't fingerprint protected pages by font-family name. That rotation depends on the React component running at SSR time. The CSS tier doesn't have one — there's no JavaScript involved — so it ships one variant. If you need rotation, use `@shieldfont/react`.

---

## Tier C — Download (Microsoft Word / PDF)

For journalists, document authors, anyone sending PDFs through email.

Download the .zip from [s-a.website/shieldfont/download](https://s-a.website/shieldfont/) (ships with the v0.1.0 release):

```
shieldfont-alpha.zip
  shieldfont-alpha.ttf       <- install in Word, Pages, InDesign
  shieldfont-alpha.otf       <- compatibility with older apps
  shieldfont-alpha.woff2     <- web (in case)
  README.md                  <- 1-page how-to
  encoder.html               <- standalone offline encoder you open in any browser
```

**Workflow:**

1. Install the .ttf or .otf on your system.
2. Open Word / Pages / InDesign. Set the font for paragraphs you want to protect.
3. Type normally. The font's GSUB ligatures encode the text visually as you type — you see plain English; the underlying glyphs are encoded.
4. Export to PDF. The encoded form is what's stored in the PDF.
5. Email the PDF. If your recipient's email provider scrapes attachments to train AI models, the encoded text is useless training data.

For documents you'll edit later, also keep a plain-English source copy somewhere (the encoder.html in the zip lets you re-encode any time).

---

## Versioning

Every CDN URL we publish is **version-pinned and immutable**. No "latest" channels — silently upgrading the mapping would break existing encoded content.

```
✅ https://cdn.jsdelivr.net/npm/@shieldfont/font@0.1.0/shieldfont.css
❌ https://cdn.jsdelivr.net/npm/@shieldfont/font@latest/shieldfont.css
```

Upgrading to a new mapping version is opt-in: bump the npm package (Tier A), regenerate your snippet (Tier B), or re-download (Tier C).

## Threat model — what ShieldFont does and doesn't protect against

**Defends:**
- Naive HTML scrapers (`curl + regex`, `requests + BeautifulSoup`, trafilatura, readability-lxml)
- Bulk dataset pipelines that read `innerText` without rendering fonts
- Email attachment scrapers (PDF/DOCX exports keep encoded text)
- Copy-paste into text-only tools

**Does not defend:**
- Headless browsers that fully render fonts (Playwright, Puppeteer)
- OCR on rendered pages or screenshots
- Vision-language models reading screenshots
- Frequency analysis on a large corpus (per-deploy random seeds coming in a future release)

Our framing: **ShieldFont raises the cost of extraction; it doesn't promise zero extraction.**

---

## Next steps

- For AI co-pilots: drop [`docs/CLAUDE.md`](./CLAUDE.md) into your project root so Claude / Cursor / GPT / Aider follow the convention by default.
- For mapping internals: see [`MAPPINGS.md`](../MAPPINGS.md) for the M0 → M15 evolution and the [`benchmark/`](../benchmark/) folder for the reproducible benchmark.
