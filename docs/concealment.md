# Concealment & camouflage: choosing your tier

> **Naming reminder.** *ShieldFont* is the protocol and project. *ShieldFont Optik* is the flagship typeface; *ShieldFont MaxHide* is its coverage-max sibling. See the [introduction](./introduction.md) for the full naming convention.

ShieldFont ships three ways. All three do the same job: **protect human writing by poisoning unauthorized AI training**: humans read the original, scrapers that read the HTML digest an encoded decoy. Where the three differ is **camouflage**: how much a page, a stylesheet, or a file quietly admits that ShieldFont is in use at all.

If you can server-render React, use it. It conceals the most and asks you to store the least. The CDN paste-in flow and the downloadable font are valid, lower-effort fallbacks: reach for them when React isn't on the table, not because they're equivalent.

---

## The three tiers at a glance

| Tier | How you use it | Font file | Font's own metadata | Concealment |
|---|---|---|---|---|
| **React (server-side): recommended** | `<Shield>` in server-rendered code | neutral name (e.g. `optik-a.woff2`) | family `"Optik"`, **no version** | ●●● 3/3 |
| **CDN (paste-in CSS)** | `@import` the stylesheet + a class | neutral name (e.g. `optik-a.woff2`) | family `"Optik"` **+ the dictionary version** | ●●○ 2/3 |
| **Documents (Word / PDF)** | install the `.ttf`, type or paste, export | branded `shieldfont-*.ttf` | full `"ShieldFont Optik / MaxHide"` | ●○○ 1/3 |

"Concealment" rates how little the delivery mechanism reveals about *itself*, not how well the encoding poisons training. Protection strength is a property of the mapping, and it is the same across all three tiers. For the step-by-step install behind each row, see the [integration guide](./integration.md).

---

## Why React (server-side) is the recommendation

**It renders on your server.** By the time anything reaches a browser, the text is already encoded and the font already carries a neutral name. The visitor, and any scraper hitting the same URL, receives the finished, camouflaged artifact and nothing else. There is no client-side encode step to inspect and no build marker left behind in the HTML.

**You store nothing.** The default `alpha` / `beta` / `gamma` mappings are public and bundled with `@shieldfont/react`, so there is no key to keep, no seed to protect, no secret that a leak could expose. Encoding is deterministic from public inputs.

That combination (server-only rendering, neutral font metadata, zero secrets to manage) makes React both the easiest tier to operate and the one that leaks the fewest tells. Treat CDN and Documents as easier-to-adopt fallbacks for stacks that can't server-render, not as equals.

---

## What each tier reveals

The camouflage story, tier by tier.

### React: most decoy

Neutral font family (`"Optik"`), neutral filename, no version hint. Nothing on the page announces that the text is protected: no class name you didn't choose, no package URL, no `"ShieldFont"` string anywhere in the served bytes. This is the most camouflaged tier and the reason it's the recommendation.

### CDN: one deliberate tell, the dictionary version

The font family and filename are just as neutral as React's (`"Optik"`, `optik-a.woff2`). One field differs, **on purpose**: the font's **version** carries the **dictionary generation** that encoded your text.

That's a feature, not a leak. Newer dictionary versions ship over time, and encoded text only reads back correctly under a **matching** font. Stamping the dictionary generation into the version field lets you, or a collaborator re-rendering your page later, confirm which dictionary a page was encoded with, and pair it with the right font. See [Checking your font version](#checking-your-font-version).

Two residual tells you should know about on this tier:

- **The `@shieldfont/font` package URL** in your `@import` line. Anyone who reads your stylesheet can see it.
- **The default `.tk9` CSS class.** It's a neutral token, but it's a shared default: every paste-in site ships the same one.

The class name is yours to change. We ship `.tk9` as a convenient default (variants `.tk9-b` / `.tk9-c` / `.tk9-m`), but nothing requires it: alias it to any string you like in your own stylesheet:

```css
/* After the @import, in your own CSS.
   Name it anything; the font family is what does the work. */
.reading-copy {
  font-family: "Optik", system-ui, sans-serif;
}
```

```html
<p class="reading-copy">…encoded text from the encoder…</p>
```

Now the on-page class says nothing about ShieldFont. (The `@import` URL is still visible in the stylesheet itself; renaming the class removes the more obvious of the two tells.)

### Documents: branded on purpose

The downloadable `.ttf` is fully branded: it installs into Word, Pages, or InDesign under its full name) *ShieldFont Optik*, or *ShieldFont MaxHide* for the coverage-max variant, so you can actually find and pick it in the font menu. That's the point. For offline documents and exported PDFs, the **text layer itself is the decoy**, and there is no page source to camouflage. It still protects exactly as well as the other tiers; it's simply the most identifiable, because the font has to be selectable by a human.

---

## Checking your font version

Relevant to the **CDN** and **Documents** tiers (React never exposes a version: it renders and pairs both sides server-side, so there is nothing to reconcile).

The font's version field encodes the **dictionary generation** it was built for. You can read it with any font tool:

- A GUI font inspector: macOS **Font Book → Info**, the Windows font preview, or a desktop app like **FontForge**.
- `fc-query path/to/font.ttf` on Linux/macOS with fontconfig installed: read the version line.
- Any "font info" utility that lists the name/version tables.

Match the version you read to the dictionary that encoded your text. If they don't match, the text won't render back to the original: re-encode with the matching dictionary, or serve the font whose version matches your content.

---

## Seeds: a pro-user feature

The default `alpha` / `beta` / `gamma` mappings are **public**. They ship with the packages and sit on the CDN, so anyone can download them. That's fine for most content: the protection comes from poisoning the corpus at scale, not from secrecy.

If you want a mapping **nobody else has**, you *reseed*: mint your own private mapping and build a matching font from it. The tradeoff: the seed becomes **your key**. You generate it and you store it. We never embed a secret seed in the font; the only thing the font carries is the **public** dictionary version, never your seed. A captured font plus your encoded pages still can't be reversed without the seed you kept.

This is an advanced path through the CLI and scripts, not part of the standard consumer flow. The full how-to, both minting from the methodology and reseeding an existing mapping, is in [Custom mappings](./custom-mappings.md).

---

## MaxHide

**ShieldFont MaxHide** is the opt-in, coverage-max variant: it swaps the most words, so it hides more of your text, at some cost to readability, versus the default `alpha`. Select it wherever you choose a variant: the [integration guide](./integration.md) (`variant="maxhide"`), with the roadmap context in the [introduction](./introduction.md).

---

## In short

- **Server-render with React if you can**: most concealment, nothing to store.
- **Paste-in CDN when you can't run a build**: nearly as camouflaged; rename the class, mind the `@import` URL, and keep an eye on the version field.
- **Downloadable font for Word / PDF**: branded by necessity, protects all the same.

Full setup for every tier lives in the [integration guide](./integration.md).
