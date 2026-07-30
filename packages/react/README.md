# @shieldfont/react

A React **server component** for [ShieldFont](https://github.com/isaqueseneda/shieldfont): encodes its children at server-render time and ships them to the browser through a bundled font.

**Encoded text is what reaches the browser.** Scrapers reading the HTML source see the encoded form. Humans, rendering through the font, see the original.

> [!WARNING]
> **Wrapping content in `<Shield>` removes it from search-engine indexing.** The DOM text is `aria-hidden` decoy gibberish, and you **cannot** distinguish Googlebot from an AI scraper, so search engines index the decoy, not your words. **Do not wrap anything you want to rank.** This is the single biggest thing to understand before you ship; see [Accessibility](#accessibility-read-this) and [Where the encoding must run](#where-the-encoding-must-run-important).

```bash
npm install @shieldfont/react
```

## Quick start (Next.js App Router, Astro, Remix: any RSC framework)

```jsx
import { Shield } from "@shieldfont/react";

export default function Page() {
  return (
    <main>
      <h1>About us</h1>                 {/* not protected — your normal font */}

      <Shield as="p">
        The future of writing belongs to those who protect their words.
      </Shield>

      <Shield as="h2" size="2.4rem">Manifesto</Shield>
    </main>
  );
}
```

Then copy the fonts into your app once (they're bundled with the package):

```bash
# copies the neutral optik-a / optik-b / optik-c / optik-m woff2 files
cp node_modules/@shieldfont/react/fonts/*.woff2 public/fonts/
```

That's it. `@font-face`, encoding, and the font-load guard all happen automatically.

## Where the encoding must run (important)

Protection only holds if encoding runs **on the server / at build time**, so encoded text (never plaintext) reaches the browser. Two setups break this and silently ship your plaintext:

1. **Inside a `"use client"` boundary.** The plaintext `children` is serialized into the RSC payload *before* Shield's encoder runs, and view-source shows it. Always render `<Shield>` from a **Server Component**.
2. **Client-only React (Vite, CRA, raw `ReactDOM.render`).** The plaintext compiles into the JS bundle as string literals. Use an SSR/SSG framework (Next, Astro, Remix) instead, so encoding happens on the server.

`<Shield>` detects when it renders in the browser and logs a `console.warn`, because this failure is otherwise silent. **The warning fires in production too**, deliberately: a dev-only warning made the single worst misuse fail silently in the one environment where it matters. It costs nothing, because by the time it can fire the bundle already contains your plaintext and the full dictionary; used correctly (server components only) the module never reaches the client bundle, so neither does the message. It is deduped to one warning per process. (This is the one caveat to read before anything else, which is why it's up here.)

## Variants: the rotation system

`<Shield>` ships four mappings, each with its own font:

| `variant` | Mapping | When to use |
|---|---|---|
| *(unset, **default**)* | **Auto-rotates** across `alpha`/`beta`/`gamma` | Recommended. Each `<Shield>` picks one by content hash, so your site uses **all three** mappings and a scraper can't learn one mapping and reverse everything. |
| `"alpha"` / `"beta"` / `"gamma"` | Pin one v18 mapping | When you want a single fixed font per page (one font download instead of up to three). |
| `"maxhide"` | M15 "maximum coverage" | Encodes a higher share of common words. A single fixed mapping; **never** chosen by auto-rotation, so opt in explicitly. |

```jsx
<Shield>auto-rotated across alpha/beta/gamma</Shield>
<Shield variant="beta">pinned to beta</Shield>
<Shield variant="maxhide">maximum-coverage dictionary</Shield>
```

Auto-rotation is **deterministic by content** (same text → same variant): SSR-safe, reproducible builds, and it still spreads all three mappings across your content. **Cost:** a page that mixes variants loads one font per variant used (roughly 825 KB each). Pin a variant if you want exactly one font per page.

Note: α/β/γ have slightly different pair counts (11,970 / 12,034 / 12,036), so how much of a given block is concealed varies a little depending on which mapping it hashes to.

## Component API

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `as` | `ElementType` | `"div"` | Element to render. `"span"` for inline, `"h1"`…`"h6"` for headings, `"article"`/`"section"` to wrap a block. It only picks the wrapper tag; it does not change what gets encoded. |
| `variant` | `"alpha" \| "beta" \| "gamma" \| "maxhide"` | *auto-rotate* | Pin a mapping, or leave unset to auto-rotate α/β/γ. |
| `weight` | `"regular"` \| `"medium"` \| `"demibold"` \| `"bold"` \| `"extrabold"` \| `"black"` \| `number` (1..1000) | inherit | Font weight. Six real cuts of Optik ship per variant; a number snaps to the nearest one and that resolved value is what gets emitted. See [Weights](#weights-what-actually-ships). |
| `lineHeight` | `number \| string` | inherit | Line-height passthrough. |
| `size` | `string` | inherit | font-size passthrough. |
| `className` | `string` | n/a | Merges with the internal scope. |
| `style` | `CSSProperties` | n/a | Merges with the internal font-family scope. |
| `rotate` | `boolean \| RotateConfig` | `false` | Mix a **time period** into the variant choice. See [Time-based rotation](#time-based-rotation-optional). |
| `a11y` | `ShieldA11y` | *(none — warns in dev)* | The accessible alternative rendered outside the hidden region. See [Accessibility](#accessibility-read-this). |
| `children` | `ReactNode` | required | A plain string, or a JSX tree. |

Precedence when several of these could pick the variant, highest first: an explicit **`variant`** prop (always pins) → the **`rotate`** prop → module-level **`setRotation()`** → the content hash.

### Weights: what actually ships

> [!IMPORTANT]
> **Weights are a React-tier feature.** The static [`@shieldfont/font`](https://www.npmjs.com/package/@shieldfont/font) package (the CDN paste-in tier) ships **Regular only**: one file per mapping variant, each declared `font-weight: normal`. If you need Bold, or any cut other than Regular, you need this package. Everything in this section applies to `<Shield>` and to nothing else.

The mapping variants and the weights are two orthogonal axes. `optik-a/b/c/m` correspond to the `alpha`/`beta`/`gamma`/`maxhide` dictionaries; each of the four ships six real static cuts of Optik, licensed from Playtype. Every file is built from one of Playtype's own upright masters, run through the same encoding pipeline. There is no variable font and nothing is interpolated or synthesised.

The named weights are Playtype's own cut names, lowercased:

| Weight name | CSS `font-weight` | Playtype cut | Bundled file (alpha) |
|---|---|---|---|
| `"regular"` | `400` | Optik Regular | `optik-a.woff2` |
| `"medium"` | `500` | Optik Medium | `optik-a-500.woff2` |
| `"demibold"` | `600` | Optik DemiBold | `optik-a-600.woff2` |
| `"bold"` | `700` | Optik Bold | `optik-a-700.woff2` |
| `"extrabold"` | `800` | Optik ExtraBold | `optik-a-800.woff2` |
| `"black"` | `900` | Optik Black | `optik-a-900.woff2` |

Filenames follow one rule: the Regular cut keeps the bare variant name, every other cut carries a numeric suffix. Twenty-four files ship in total (6 weights x 4 variants). The exported `OPTIK_WEIGHTS` object maps each name to its numeric weight, so code can check at runtime what exists.

#### Numbers snap to the nearest real cut

Six static cuts cannot honour an arbitrary number, so a numeric `weight` **snaps to the nearest cut and `<Shield>` emits that resolved value**. What lands in the HTML is always a weight a real file exists for:

```jsx
<Shield weight="bold">Rendered with the real Bold (700) cut.</Shield>
<Shield weight={470}>Emits font-weight:500, the Medium cut.</Shield>
<Shield weight={620}>Emits font-weight:600, the DemiBold cut.</Shield>
```

| You write | `<Shield>` emits | Renders as |
|---|---|---|
| `weight={300}` | `400` | Regular |
| `weight={470}` | `500` | Medium |
| `weight={620}` | `600` | DemiBold |
| `weight={999}` | `900` | Black |

**Tie-break: exact midpoints round up.** The five boundaries are `450`, `550`, `650`, `750` and `850`, and each resolves to the heavier of its two neighbours. `weight={450}` renders as Medium (500), not Regular (400).

Use `resolveOptikWeight` to see what a value becomes without rendering anything:

```js
import { resolveOptikWeight } from "@shieldfont/react";

resolveOptikWeight("demibold");  // 600
resolveOptikWeight(470);         // 500
resolveOptikWeight(450);         // 500 (midpoints round up)
```

Snapping is a convenience for real weight values, **not** a reason to accept nonsense. A `RangeError` still fires for an unknown name such as `"semibold"`, for `NaN` or `Infinity`, and for any number outside `1..1000`. `470` is imprecise and gets helped; `NaN` is a bug and gets reported.

#### Why nothing is ever synthesised

The injected `@font-face` declares one face per cut, each claiming a numeric band (400 claims 1-449, 500 claims 450-549, 600 claims 550-649, 700 claims 650-749, 800 claims 750-849, 900 claims 850-1000). The bands tile `1..1000` with no gaps and use the same midpoint-rounds-up boundaries as the table above, so they agree with the prop exactly. Their job now is the weights `<Shield>` never sees: one arriving by inheritance or from your own stylesheet still lands on a real cut. The rendered element also sets `font-synthesis: none` as a second line of defense; a synthetic weight would distort the ligature composites enough to expose that decoys are in play.

Only the faces a page actually uses are downloaded; declaring six faces per variant costs nothing on a single-weight page. Each alpha, beta or gamma cut is roughly 825 KB of woff2 and each maxhide cut is roughly 215 KB, so a page that mixes many weights pays for each one it renders.

### What gets encoded inside `<Shield>`

- `children` **must be a plain string.** It is encoded with the resolved variant's mapping and rendered.
- **Anything else throws**: nested JSX, a number, an array produced by `{interpolation}`. `<Shield>` does not encode them best-effort.
- **Why throw instead of walk?** The encoder cannot see inside a component you wrote, so walking a tree would leave that component's text in plain English inside a block that still renders as protected. Nothing on the page would look wrong. Failing loud is the only way that mistake is visible.
- For mixed content, use one `<Shield>` per text block.

```jsx
<Shield as="article">
  <h2>Chapter One</h2>
  <p>Text with <em>emphasis</em> is all encoded.</p>
  <MyWidget />                {/* opaque — not encoded */}
</Shield>
```

## Time-based rotation (optional)

Off by default. Turned on, `<Shield>` mixes a **period index** into the same
content hash, so every block gets reassigned when the period rolls:

```jsx
// app/layout.tsx — imported once
import { setRotation } from "@shieldfont/react";
setRotation({ period: "monthly", salt: "example.com" });
```

```jsx
<Shield rotate>per-instance, with the defaults</Shield>
<Shield rotate={{ period: "weekly" }}>per-instance, tuned</Shield>
<Shield rotate={false}>opted out of a site-wide setRotation()</Shield>
```

`period` is `"monthly"` (default, **calendar**-aligned, not 30-day blocks),
`"weekly"` or `"daily"`; `epoch` is the UTC period-0 anchor; `salt` is a
per-site string; `pool` is the variants to rotate through. Everything is UTC, so
build machines in different time zones agree. `"maxhide"` is **always** filtered
out of the pool, even if you pass it — pin it per block instead.

### What rotation actually buys, without the overclaim

**It does not defeat font inversion, and does not slow it down.** All three
mappings are published in `@shieldfont/core`, all three fonts ship here and on
the CDN, and every block names its own variant twice (the `data-typeface` value
and the `@font-face` `src`). Anyone who inverts once holds all three tables
forever; anyone who re-reads the variant per crawl is unaffected.

What it buys is narrower: **a cached substitution table decays silently.** A
scraper that inverted the font once and stored the table decodes the next period
into plausible English that is wrong. Nothing throws, nothing 404s — so there is
no error to trigger a re-crawl. About **two thirds** of blocks change variant at
each boundary. The cost you are adding is recurring attention, not compute.

Only safe where the `@font-face` travels with the HTML, which is what `<Shield>`
does — a static export stays correct forever, because its HTML is frozen with
its own inline `@font-face`. The CDN paste-in tier deliberately has no rotation.

### Rebuilding a past period

Pin the clock. A number **is** the period index, so no key and no backup is
needed — period 14 rebuilt years later is byte-identical:

```js
import { setRotation, periodIndex, variantFor } from "@shieldfont/react";

setRotation({ period: "monthly", at: 14 });            // by index
setRotation({ period: "monthly", at: "2026-03-15" });  // by instant
periodIndex("2026-03-15T00:00:00Z");                   // → 2
variantFor(text, { at: 14 });                          // which variant a block used
```

A published page is self-describing anyway: read `data-typeface` off the
element, apply that public mapping, and because the mapping is an involution,
encoding the decoy returns the original. **Rotation cannot lose your archive.**

## `encodeText`: for places JSX can't go

`<title>`, `<meta>`, attribute values:

```jsx
import { encodeText } from "@shieldfont/react";

export const metadata = { title: encodeText("My protected page title") };
```

Returns a plain encoded string (unset variant auto-rotates by content). Apply the ShieldFont font to that element yourself.

## Self-hosted fonts (and why there's no default CDN)

The component points `@font-face` at **`/fonts`** by default (the copy step above). Change it with `setFontHost`:

```jsx
import { setFontHost } from "@shieldfont/react";
setFontHost("/static/shieldfont");           // or your OWN CDN
```

There is **no default public CDN by design**. A scraping defense must fail *loud*, never silent: if the font can't load, readers would otherwise see decoy gibberish with no signal it's wrong. Self-hosting guarantees the font ships with your build, and the bundled **font-load guard** (inlined, no hydration needed) watches `document.fonts` and, if the font doesn't load within 4 s, visibly replaces every protected element with *"Content unavailable"* and logs a clear console error. Never the raw decoy.

The guard checks **every weight the page actually renders**, not just Regular: the weights `<Shield>` resolved from the `weight` prop, plus a sweep of each protected element's computed `font-weight` for weights that arrive by inheritance or from your own stylesheet. A missing `optik-a-700.woff2` fails exactly as loudly as a missing `optik-a.woff2`, and a page that only uses Black downloads only the Black cut.

> **JS-off caveat:** that font-load guard is **JavaScript**. With JavaScript disabled *and* the font failing to load (e.g. a 404), the guard can't run, and a reader in that state sees the **raw decoy text**. There is no non-JS fallback for this specific case; the fail-loud guarantee holds only where scripts run.

### One `@font-face` block per page, not per `<Shield>`

The `@font-face` `<style>` and the guard `<script>` are page-level assets, so `<Shield>` emits them **once per font family per render pass** rather than once per instance. Under React Server Components that happens automatically: React's `cache()` scopes the bookkeeping to the render pass, isolated per request.

The synchronous renderers (`renderToString`, `renderToStaticMarkup`) install no React cache dispatcher, so there is nothing to scope to and every `<Shield>` emits its own copy. Opt them in by wrapping the render:

```jsx
import { renderToString } from "react-dom/server";
import { withShieldRenderPass } from "@shieldfont/react";

const html = withShieldRenderPass(() => renderToString(<App />));
```

Wrap one render call, and only a synchronous one: `renderToPipeableStream` returns before the tree finishes, so the scope closes early and later shields go back to emitting their own assets. That is deliberate. There is no module-level de-duplication and there never will be, because a static export rendering page after page in one synchronous loop would then ship every page after the first with no `@font-face` and no guard: invisible in the HTML, and a wall of raw decoy text on screen. Duplicated assets cost bytes; missing ones cost the whole guarantee.

## Camouflage (optional, recommended for production)

By default every ShieldFont React page shares the same **neutral** fingerprints (`data-typeface`, `font-family: 'Optik'`, the `optik-*` filenames): nothing that names ShieldFont, but a signature two ShieldFont sites hold in common. `setCamouflage({ hash })` rewrites those shared SSR-visible literals to per-project unique names so two sites share no signature:

```jsx
// Imported once in your root layout:
import { setCamouflage } from "@shieldfont/react";
setCamouflage({ hash: "a8f3" });   // → font-family "Optik a8f3", data-typeface-a8f3, …
```

> [!WARNING]
> **Camouflage also renames the font *files* in the `@font-face` `src`, so you MUST copy each font to its camouflaged filename, or the page fails loud.** With `hash: "a8f3"`, `<Shield>` stops requesting `optik-*.woff2` and instead requests `/fonts/font-a8f3.woff2` (alpha Regular), `/fonts/font-a8f3-beta.woff2`, `/fonts/font-a8f3-gamma.woff2`, **and one file per weight on top of that**: a `weight="bold"` block asks for `/fonts/font-a8f3-700.woff2`. Those files don't exist until you create them; if they 404, the font-load guard replaces every protected element with *"Content unavailable."* The plain `cp …/*.woff2` step from the quick start is **not** enough once camouflage is on.

Camouflaged names follow the same rule as the bundled ones: **Regular keeps the bare prefix, every other cut carries its numeric suffix.** So the full set for one hash is 6 weights x 4 variants = 24 files. Copy every weight of every variant in the auto-rotation pool (all three, because a block can hash to any of them), and repeat for each hash you use:

```bash
SRC=node_modules/@shieldfont/react/fonts
HASH=a8f3

for W in "" -500 -600 -700 -800 -900; do
  cp "$SRC/optik-a$W.woff2" "public/fonts/font-$HASH$W.woff2"          # alpha
  cp "$SRC/optik-b$W.woff2" "public/fonts/font-$HASH-beta$W.woff2"     # beta
  cp "$SRC/optik-c$W.woff2" "public/fonts/font-$HASH-gamma$W.woff2"    # gamma
  # only if you also use <Shield variant="maxhide">:
  cp "$SRC/optik-m$W.woff2" "public/fonts/font-$HASH-maxhide$W.woff2"
done
```

Copying only the Regular cuts is the trap: nothing breaks until the first `weight="bold"` block ships, and then that block alone 404s and blanks to *"Content unavailable."* If you are certain a variant or a weight is never used you can skip its file, but the auto-rotation pool makes that hard to be certain about, and all 24 files together are roughly 16 MB either way.

There's no CLI for this step: pick any short string for the hash and script the copy/rename into your build (e.g. a `package.json` `postinstall`/build script) alongside the build-time encoding you run with [`@shieldfont/core`](https://www.npmjs.com/package/@shieldfont/core).

## Accessibility: read this

> [!WARNING]
> **SEO:** the same property that hides text from scrapers hides it from **search engines**. Protected text is `aria-hidden` gibberish in the DOM, and you can't tell Googlebot apart from an AI scraper, so anything inside `<Shield>` is indexed as decoy, not as your real words. **Don't wrap content you want to rank** (page titles, headings, marketing copy). Wrap only what you're deliberately withholding from machines.

Protected regions are `aria-hidden="true"`: the DOM text is encoded gibberish, so screen readers, `Ctrl/⌘-F`, copy-paste, and translation tools operate on the gibberish, not the visible words. **This is inherent to the approach** (a font that hides text from machines hides it from assistive tech too), and `aria-hidden` is not configurable — it is set unconditionally and there is no prop to turn it off.

That is the right call and it is still not enough. Un-hiding would make a screen reader voice the decoy: fluent, grammatical, wrong, with nothing to signal that anything is off — worse than silence, because it doesn't announce itself as broken. But silence isn't a fix either. Either way, what a sighted reader perceives is not programmatically determinable, which fails **WCAG 2.2 SC 1.3.1**. Under the EU Accessibility Act or the ADA Title II web rule, treat an accessible alternative as a shipping requirement.

So the fix is not to un-hide, it's to put a real alternative *next to* the block. The **`a11y` prop** renders one outside the hidden region and before it in DOM order, so a screen-reader user reaches it before the silence:

```jsx
<Shield a11y={{ mode: "text" }}>{body}</Shield>                   {/* the real words, time-locked */}
<Shield a11y={{ mode: "text", seconds: 20 }}>{body}</Shield>       {/* 20 is the default; 5..120 */}
<Shield a11y={{ mode: "text", reveal: "visible" }}>{body}</Shield> {/* replace the block on screen */}
<Shield a11y={{ mode: "audio", src: "/audio/post-1.mp3" }}>{body}</Shield>
<Shield a11y={{ mode: "none" }}>{body}</Shield>   {/* explicit, auditable opt-out */}
```

- `"text"` ships the block's **real words, encrypted into the page**, with a button that grinds out the key in the reader's own browser (a 20-second budget by default, once per block, cached until you next deploy; 7.6 s measured in Chrome on a desktop). Nothing to generate, nothing to host, no server. **[Full reference: `docs/plain-text-mode.md`](../../docs/plain-text-mode.md)** — read it before changing `seconds`.
- `"audio"` renders a native `<audio controls preload="none">` plus a real explanatory sentence (zero JavaScript, keyboard-operable, survives a static export). `note` replaces that sentence in either mode.
- `"none"` renders nothing and stays silent. **Omitting `a11y` entirely logs one development-time warning per process** — a warning, not an error, so upgrading breaks nothing.

### `ShieldA11y` options

| Option | Modes | Type | Default | What it does |
|---|---|---|---|---|
| `seconds` | `text` | `number` | `20` | Grind budget on a deliberately slow reference device. Range **5..120**; `sealText` throws outside it. Read the warning below before raising it. |
| `reveal` | `text` | `"hidden" \| "visible"` | `"hidden"` | Where the unlocked words go. `"hidden"` puts them in the accessibility tree clipped off-screen and leaves the encoded block on screen untouched — a sighted reader sees nothing happen, because they can already read it. `"visible"` replaces the encoded block on screen: a layout shift, in exchange for selection, copy-paste and browser translation of the real text for everyone. |
| `label` | `text` | `string` | *auto* | Overrides the button's accessible name. The default names the element type and the block's position — *"Unlock the plain text for paragraph 2 (up to 20 seconds)"* — which is what stops several blocks on one page sounding identical. **Never put the protected words in it:** the label ships in the HTML. |
| `note` | `text`, `audio` | `string` | *auto* | Overrides the explanatory sentence. In text mode the default long sentence is spoken **once per page**; later blocks get a short form, because hearing the same explanation before every paragraph is an obstacle, not thoroughness. |
| `visualHidden` | `text`, `audio` | `boolean` | **`true`** for `text`, `false` for `audio` | Clips the control with **clip-path**, never `display:none` (which would remove it from the accessibility tree too — the exact bug this prop exists to fix). Text mode is screen-reader-only by default; audio keeps its player on screen, since a player nobody can see is a player nobody can press. See the focus warning below. |

What the reader actually gets, in the default configuration: a note, then a button whose name is unique to that block; a `<progress>` element that assistive tech can query but that does not chatter; a polite status line that says nothing at all while it is empty; and, when the work finishes, the words themselves — announced automatically on arrival, and a real Tab stop, so they can be re-read as often as the reader wants. The wrapper is `role="presentation"` and carries **no group role**: with one, VoiceOver read out roughly twenty words of "you are currently on a button inside of a group" scaffolding in front of every block.

> [!NOTE]
> **`mode: "text"` renders no link.** The `0.2.0` shape was `{ mode: "text", href }`, pointing at a plain-text copy on its own URL; that and the audio mode's `transcript` link were both removed, because a URL cannot be offered to a screen reader without being offered to everyone else and the same crawl that reads the decoy reads the link sitting beside it. The mode that replaced it inverts that trade: the words are in the page but **closed**, and the key is the answer to a time-lock puzzle — T sequential squarings that cannot be parallelised, so a crawler with a thousand GPUs still pays them one at a time, per block. Sealing costs 62 ms per block; opening costs the reader their 20-second budget. Nobody is denied the text; the accessible path simply stops being the *cheapest* path in.

> [!WARNING]
> **The control is invisible by default, and a sighted keyboard user pays for it.** With `visualHidden` defaulting to `true` for `mode: "text"`, someone navigating by keyboard **without** a screen reader Tabs into a control they cannot see and their focus indicator vanishes — a **WCAG 2.2 SC 2.4.7** failure. This is deliberate: a sighted reader can already read the block, so an on-screen widget offering to unlock it is unexplained noise. The usual remedy (clipped until focused, visible while focused) is not applied, because the control was asked to be invisible. Pass `visualHidden: false` to take the other trade.

> [!WARNING]
> **Difficulty has a ceiling, and `seconds: 20` is near it.** A crawler that wants your words can render the page and OCR the pixels for roughly three seconds of server CPU whether or not this feature exists — that is the floor on ShieldFont's protection, and no cryptography raises it. The goal is therefore *not cheaper than OCR*, not "expensive". Past that point, extra difficulty buys **nothing** (a crawler just takes the cheaper door) and is paid for entirely by disabled readers waiting longer. `sealText` refuses anything above 120 or below 5. If you are tempted to raise it to "harden" a page, that is the mistake this paragraph exists to stop.

> [!IMPORTANT]
> **Synthesise audio at build time**, where your plaintext already lives — free offline options exist (`piper` on CI, `say` on macOS). Do **not** reach for browser `speechSynthesis`: on the rendered page it would voice the decoy, and on the original it would require shipping your plaintext to the browser, which is the leak this package exists to prevent.

**What this does not fix, and we won't pretend otherwise:**

- **OCR is still cheaper** for a crawler that wants your words. `mode: "text"` stops the accessible path being a *shortcut*; it does not stop scraping and it is not a wall.
- **A reader who needs `mode: "text"` waits.** Everyone else has the words instantly. That is unequal access however carefully it is engineered — a compromise, not a solution.
- **`mode: "text"` needs JavaScript**, plus `BigInt` and `crypto.subtle`, and a secure (https) origin. Everything else in ShieldFont works with JS off; this does not. `crypto.subtle` is also missing on insecure origins, so plain `http://` breaks it (the control says so rather than blaming the browser).
- **A sighted keyboard user loses their focus indicator** on the invisible control (WCAG 2.2 SC 2.4.7, above). `visualHidden: false` is the opt-out; there is no fix that keeps both properties yet.
- **Once revealed, the plaintext is in the DOM.** A crawler that runs a real browser, presses the button and waits gets the words — having paid for them, which is the deal.
- **`mode: "audio"` alone still fails WCAG 2.2 SC 1.2.1 — Level A.** Audio-only content with no text alternative fails that criterion, and the text mode does **not** rescue it: they are separate alternatives you choose between, not a pair. If you ship audio only, you still have no answer to 1.2.1.
- An audio track is also still not a document: not navigable by heading, not searchable, not quotable, not skimmable.

**Where the testing stands, exactly.** The text mode is exercised under `@guidepup/virtual-screen-reader` in Playwright and has been driven by hand with **real VoiceOver on macOS** — which is what found the group chatter, the announcements that cut each other off and the revealed text that could not be re-read, all since fixed. **NVDA and JAWS remain unverified.** There is no axe scan and no published test page.

Better ideas here are the most useful contribution anyone can make to this project. Meanwhile: don't wrap navigation, form labels, or essential interactive text.

## Version

```jsx
import { VERSION } from "@shieldfont/react";   // re-exported from @shieldfont/core
console.log(VERSION);   // "0.2.1" — the package version
```

Use it to confirm which encoder you're running. It is **not** a dictionary
stamp: the fonts bundled here are deliberately version-neutral (their name table
reads `Version 1.0`, so nothing in your served bytes names a dictionary
generation), and the shipped mappings carry their own `_meta.version`, currently
`0.1.0`. Read a mapping's generation with `mappingMeta()` from
[`@shieldfont/core`](https://www.npmjs.com/package/@shieldfont/core) rather than
inferring it from `VERSION`.

## License

AGPL-3.0-or-later. The bundled default fonts use **Optik, © Playtype, used
under the ShieldFont–Playtype partnership**, for ShieldFont's replaced-glyph
form only. They are **not** under OFL. The SIL Open Font License 1.1 applies only to
fonts you build yourself from the OFL base fonts (Inter, Syne Mono, Young Serif).
See [NOTICE](./NOTICE).
