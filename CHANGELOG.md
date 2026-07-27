# Changelog

All notable changes to ShieldFont. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.1] — the last letter of every shielded word

A rendering fix. `@shieldfont/core`, `@shieldfont/react` and `@shieldfont/font`
all move to `0.2.1`; only the two font-carrying packages have new bytes, and
`@shieldfont/core` moves with them to keep one version number across the set.

**Upgrade is drop-in. Already-encoded content stays valid** — the mappings, the
`cmap` and the whole GSUB payload are byte-identical, so no re-encoding, no
mapping bump, and no change to what a scraper reads. Pinned CDN URLs should move
from `@0.2.0` to `@0.2.1`.

### Fixed

- **Word ligatures rendered with the right-hand edge of the last letter shaved
  off.** Every composite word glyph was built with its `hmtx` left side bearing
  hardcoded to `0` while its real `xMin` was the first letter's own side bearing.
  Rasterizers size a glyph's raster from `(lsb, lsb + xMax - xMin)`, so an lsb
  of `0` on a glyph whose ink starts at 73 made that raster 73 units too narrow
  and took the shortfall off the **right** edge. In Chrome, `human`, `makes`,
  `hands`, `learns`, `people` and `bold` all lost the tail of their final letter;
  `world` and `things` did not, because the loss is the size of the **first**
  letter's bearing (`h`/`m`/`p` 73, `l` 68, capitalised cuts 81, `w` 7, `t` 19).
  Advance widths were always correct, so layout, line breaking and
  `measureText()` never showed it, and HarfBuzz/FreeType draw from the outline
  and never reproduced it — only the browser raster was wrong.
  - All four variants at all six weights are rebuilt: 35,886 composites per
    alpha file, 36,078 beta, 36,084 gamma, 7,584 maxhide.
  - `hhea`'s derived summary metrics are recalculated with them
    (`xMaxExtent` was reading 11973 against a true 11990).
  - WOFF2 files grow about 1.7%: a run of zeros compresses better than real
    side bearings.

### Added

- `scripts/fix_composite_lsb.py` — repairs the metrics on an already-built font
  without a full rebuild. `--check` reports (non-zero exit on damage),
  `--in-place` fixes, or `IN OUT` writes a copy.
- A third invariant check in `scripts/audit_font.py`: `lsb == xMin` on every
  composite, and the audit now fails on it. The existing shaping battery runs
  through HarfBuzz and is structurally blind to this class of bug.

### Changed

- `scripts/generate_font.py` writes the correct left side bearing, and seeds the
  composite bounding-box union from the first inked component instead of from
  `0` (which pinned `xMin` at ≤ 0 — masked in shipped files by fontTools
  recalculating bounds at save, but it is the value the bearing is read from).

---

## [0.2.0] — rotation, accessible alternatives, smaller fonts

> **Never published to npm.** This release shipped on the website only; the
> composite side-bearing bug fixed in `0.2.1` was found before it went out, so
> `0.2.1` is the first published version carrying any of the work below. Going
> from `0.1.1` straight to `0.2.1` on npm is deliberate, not a skipped release.

`@shieldfont/core`, `@shieldfont/react` and `@shieldfont/font` all move to
`0.2.0`. A feature release: two new `<Shield>` props, one new module-level
export, and rebuilt fonts that no longer carry glyph names.

### Added

- **Time-based variant rotation** in `@shieldfont/react` — the new `rotate`
  prop and the module-level `setRotation()`, plus `periodIndex()` and
  `variantFor()` for archive tooling. Off by default; omitting `rotate` keeps
  the existing content-hash behaviour exactly.
  - `period` is `"monthly"` (default, **calendar**-aligned — "the March font"
    means March, not a 30-day block), `"weekly"` or `"daily"`. All UTC, so two
    build machines in different time zones emit identical HTML.
  - The period is mixed **into** the existing per-block content hash, never
    used instead of it. A whole-site flip per period would be strictly worse
    than doing nothing: one font per site per period is a *cleaner* fingerprint
    than three. Mixing keeps the within-page spread and still reassigns about
    **two thirds** of blocks at each boundary.
  - `"maxhide"` is always filtered out of the rotation pool, even when a caller
    passes it explicitly — drifting into a much higher swap rate on a calendar
    boundary is not something that should happen unannounced. Pinning it with
    `variant="maxhide"` is unaffected.
  - Precedence, highest first: an explicit `variant` prop → the `rotate` prop
    → `setRotation()` → the content hash. `rotate={false}` opts a single block
    out of a site-wide `setRotation()`.
  - **Archives cannot be lost.** `at` pins the clock: a `Date` or ISO string is
    an instant whose period index is computed, and a **number *is* the period
    index**. Period 14 rebuilt in 2029 is byte-identical to period 14 built in
    2027, with no stored key and no backup. A published page is self-describing
    anyway — read `data-typeface`, apply that public mapping, and because the
    mapping is an involution, encoding the decoy returns the original.
  - **What this does not do.** Rotation does **not** defeat font inversion and
    does not slow it down. All three mappings are published in
    `@shieldfont/core`, all three fonts ship, and every block names its own
    variant twice (the `data-typeface` value and the `@font-face` `src`).
    Anyone who inverts once holds all three tables forever; anyone who re-reads
    the variant per crawl is unaffected. What it buys is narrower and real: a
    scraper's **cached** substitution table decays silently against a re-crawl,
    decoding the next period into plausible English that is wrong, with no
    exception and no 404 to trigger a retry. The cost added is recurring
    attention, not compute.
  - Only safe where the `@font-face` travels in the same bytes as the encoded
    text, which is what `<Shield>` does. Static exports stay correct forever.
    The CDN paste-in tier deliberately does not get this feature.
- **The `a11y` prop** on `<Shield>` — the accessible alternative, rendered as a
  sibling **outside** the `aria-hidden` region and **before** it in DOM order,
  so a screen-reader user reaches it before the silence.
  - `{ mode: "audio", src, transcript?, label?, note? }` renders a native
    `<audio controls preload="none">` plus a real explanatory sentence, and an
    optional transcript link. Native control, not a custom button: zero
    JavaScript, keyboard-operable and labelled for free, survives a static
    export.
  - `{ mode: "text", href, label?, note? }` links a plain-text copy.
  - `{ mode: "none" }` renders nothing and warns not at all — an explicit,
    auditable opt-out.
  - `visualHidden` clips (`clip-path: inset(50%)`), **never** `display:none`,
    which would remove the control from the accessibility tree as well and
    defeat the entire purpose.
  - Omitting `a11y` logs **one development-time warning per process**. A
    warning and not an error, so upgrading breaks no existing install.
  - `aria-hidden="true"` stays on the encoded block, unconditionally and
    deliberately. Voicing a decoy is worse than voicing nothing: it is fluent,
    wrong, and gives the listener no signal that anything is off.
- **Tests for the React package** (`packages/react/test/`, vitest, 51 tests)
  covering determinism, calendar alignment and UTC agreement, period-boundary
  reassignment rates, `maxhide` exclusion, archive reproducibility against
  golden values, the full precedence order, and the rendered accessibility
  markup.

### Changed

- **All four fonts rebuilt with the `post` table dropped to format 3.0**, in
  both `@shieldfont/font` and the React tier. This removes the glyph-name table
  from the shipped web fonts entirely — the composite word glyphs no longer
  carry names at all.
  - **About 18% smaller**: `optik-a` goes from 1,006,260 to 824,272 bytes;
    `optik-b` 1,010,016 → 829,144; `optik-c` 1,007,284 → 825,372; `optik-m`
    252,708 → 215,448. The React-tier copies shrink by the same proportion.
  - **Verified 100% round-trip on all four variants**, 77,148 shaping checks in
    total, with `ccmp` present and cmap and glyph counts unchanged
    (`optik-a` 36,412 glyphs / 438 cmap entries before and after).
  - `scripts/audit_font.py` now states that it must be pointed at a
    name-bearing `.ttf`, since a shipped `post` 3.0 woff2 has no glyph names
    left to audit by name.
- The React package's `README.md` accessibility section no longer claims the
  package "ships no accessible fallback" — it documents the `a11y` prop, the
  WCAG 2.2 SC 1.3.1 position, and what an audio track still does not fix.

### Fixed

- **Removed a self-contradiction in shipped source.** `Shield.tsx` recommended
  pairing the `aria-hidden` block with a browser `speechSynthesis` control over
  the original text — which would require shipping the plaintext to the
  browser, the exact leak the same file warns about a hundred lines earlier. It
  was also the package's only accessibility guidance. Replaced with a pointer
  to the `a11y` prop and an explicit note on why build-time synthesis is the
  only safe path.
- Rotation configuration is validated eagerly and fails loud: an unparseable
  `epoch`, or a non-finite period index, throws at `setRotation()` time instead
  of silently hashing `NaN` into a stable-but-meaningless variant.
- An inline `<Shield as="span">` now emits phrasing content for its accessible
  alternative, so the sibling cannot close an enclosing `<p>` early.

---

## [0.1.1] — camouflage hardening and honest licensing

Published to npm on 2026-07-24; this entry was written retrospectively at
`0.2.0` time, which is why it is short.

### Added

- `setCamouflage()` in `@shieldfont/react`: every SSR-visible literal
  (font-family, font filename, `data-*` attribute name, guard flag, console
  prefix) derives from a per-project hash, so two ShieldFont sites share no
  signature.
- `variant="maxhide"`, backed by the `m15en` mapping and the `optik-m` font.

### Changed

- Neutral `optik-{a,b,c,m}.woff2` filenames and a neutral `.tk9` class across
  the public and CDN tiers: nothing in the served bytes says "ShieldFont".
- The React tier's fonts are version-neutral (`Version 1.0`) on purpose, while
  `@shieldfont/font`'s report their dictionary generation. Keeping the two
  apart is what makes the React surface fully hidden.
- Licensing wording made consistent across `NOTICE` / `LICENSE-FONTS` /
  `AGENTS.md`: Optik is proprietary, used under the ShieldFont–Playtype
  partnership, not OFL.
- The `"use client"` footgun warning now fires in production too. A dev-only
  warning made the single worst misuse fail silently in the one environment
  where it matters.

### Removed

- `@shieldfont/cli` is no longer published.

---

## [0.1.0] — first public release

The first public, open-source release of ShieldFont, published to npm as
`@shieldfont/core`, `@shieldfont/react`, and `@shieldfont/font` (all `0.1.0`).
Ships the v18 `alpha` mapping (production default) plus `beta` / `gamma` /
`max`, the fire-then-revert font, the Python font-build toolchain
(bring-your-own-TTF), the docs, and a reproducible benchmark.

> **A note on versions.** The npm packages are versioned from `0.1.0` (this
> first public release). The `v1.x` / `v2.x` entries below are the project's
> **pre-public development history** from the private beta at
> <https://s-a.website/shieldfont/>, kept here for provenance.

---

## [v2.1.0] — 2026-04-30 — **Fire-then-revert + beta release** *(pre-public)*

The first beta-ready ShieldFont. The font's GSUB structure was
redesigned to handle every text-run edge case natively (including the
boundary cases that v2.0.0 worked around with a ≥4-char mapping
filter). M15-EN-FULL is now the production mapping — short pairs like
`on↔in`, `at↔by`, and digit rotation `1↔6`/`3↔8`/`4↔9` ship in the
font instead of being filtered out. The deployed beta site is at
<https://s-a.website/shieldfont/>.

### Added

- **Fire-then-revert GSUB design** in
  [`scripts/generate_font.py`](./scripts/generate_font.py):
  - **Lookup A** — LigatureSubst (Type 4) — all multi-char ligatures,
    fires anywhere.
  - **Lookup B** — SingleSubst (Type 1) — digit forward swaps.
  - **Lookup C** — MultipleSubst (Type 2) — REVERSAL of word.X glyphs
    back to their input chars (and digit-target → original digit).
  - **Lookup D** — ChainContextSubst (Type 6 Format 3) — letter-before
    reverter; fires C when a substituted glyph has a letter (or
    another word.X glyph) preceding it.
  - **Lookup E** — same as D but for letter-after.
  - All five lookups moved to LookupList front so they fire before the
    base font's `fi`/`fl`/`f_f`/`ffi`/`ffl` ligatures.
  - Wired into `ccmp` (covering every script's `ccmp` record). 5
    lookups total — replaces the previous 28-lookup per-length design.
- **Strict audit script** at [`scripts/audit_font.py`](./scripts/audit_font.py):
  - 7,590 HarfBuzz round-trip checks (every M15-EN pair × lowercase /
    Capitalized / ALL CAPS).
  - 79 substring-collision tests across common English words like
    `font`, `winter`, `iPhone15`, `PRISM`, `ISLAND`.
  - Generates `public/audit.html` for visual side-by-side review with
    the live font, including a narrow-column line-wrap test.
- **Bidirectional in-page encoder** wired into the
  [s-a.website landing page](https://s-a.website/shieldfont/) — same
  M15-EN dict + same regex encodes original→encoded; the font reverses
  encoded→original visually. Editor widget shows both.
- **Letter-adjacent digit protection** in
  `scripts/encode_site.py` and
  `encode_whitepaper.py`: the
  encoder no longer swaps digits next to letters, so model names
  like `M15-EN` and `iPhone15` stay intact in source and display.
- **Cache-busting query string** on `@font-face` URLs in the deployed
  site so beta testers don't get stuck on stale font caches.

### Changed

- **Default mapping** is now `scripts/m15en_for_font.json` (full
  M15-EN, 1,267 pairs including shorts and digits). The fire-then-
  revert design makes the previous safe-filter unnecessary.
- **Letter classification** in the font no longer treats apostrophe
  as a letter — quoted short words like `'on'`, `'at'`, `'by'` now
  decode correctly.
- **Repository cleanup** — moved one-shot historical scripts
  (`upgrade_site_to_m15en.py`, `migrate_m0_to_m15.py`) and the
  obsolete `m15en_safe.json` filter to `legacy/scripts/`.
- **Beta site polish**: FAQ rewritten in plain English with proper
  M15-EN encoding (license corrected to AGPLv3 + OFL-1.1, AI-training
  answer with concrete benchmark numbers, Word/Figma answer mentioning
  email-attachment use case). Two new copy-to-clipboard buttons (one
  in the editor widget, one after the human-test paragraph). Fixed
  horizontal-scroll on the benchmark pages.

### Documentation

- New `project_m15_pos_balance.md` design note: M15-EN deliberately
  under-represents adjectives (13% of the mapping vs natural English
  frequency) to preserve naturalness — selection-restriction +
  synonym-density + polysemy + inflection-irregularity rationale.

### Deferred work resolved

- ✅ Chained-context word-boundary GSUB at the 1,264-rule scale —
  resolved via the fire-then-revert pattern (which sidesteps the
  per-rule offset-graph explosion that crashed earlier attempts).

### Known limitations

- Adjacent encoded words separated only by hyphens (`round-trip`) work
  correctly. Adjacent encoded words separated only by digits or other
  unusual punctuation may not — file an issue with a repro.
- Single-letter source words (other than digits) are not yet supported
  in the font's word-boundary chain. Affects pairs like `a↔X` if any
  were added (currently none).

---

## [v2.0.0] — 2026-04-29 — **The M15-EN milestone**

The first major version since the original v1 release. Replaces the
single 400-pair M0 mapping with the 1,138-pair **M15-EN** mapping
discovered through 15 rounds of empirical iteration under the V3
benchmark suite. Ships ShieldFont-Optik (the first font built with the
new mapping) and a full white paper documenting the journey.

### Added

- **M15-EN mapping** (`scripts/m15en_safe.json`)
  — 1,138 word pairs including content words, antonyms, numerals (digit
  rotation 1↔6, 3↔8, 4↔9), and pruned function-word swaps. Coverage
  ≈53% on real Wikipedia text, KenLM PPL ≈1,800, +0.130 H2 damage
  (fine-tune score later demoted as unreliable — see `benchmark/EXCLUDED.md`).
- **M15-MULTI mapping** (`m15_multi_universals.json`)
  — cross-language template using only operations that survive
  translation. For Spanish/French/Portuguese deployments.
- **ShieldFont-Optik font** — built from Playtype Optik with the new
  mapping. 1,135-word ligature lookup + digit single-substitution
  lookup. 192 KB woff2.
- **V4 white paper** at `benchmarks/v4/results/benchmark_v4.html`
  (plain English) + `benchmark_v4_technical.html` (technical companion).
  Live at <https://s-a.website/shieldfont/benchmark/>.
- **`MAPPINGS.md`** documenting the M0 → M15 evolution.
- **Generator extensions** in `scripts/generate_font.py`:
  - `--base-path` flag for local TTF/OTF input (was URL-only)
  - `--mapping-path` flag for custom mapping JSONs
  - GSUB Type 1 single-substitution lookup for digit rotation
  - Stale-table stripping (`vmtx`, `vhea`, `VORG`, `DSIG`) — fixes the
    "vmtx table usability" validation report bug
  - Lookup ordering fix: our ligature lookup now fires BEFORE the base
    font's built-in `f+i`/`f+f`/`f+l` ligatures (critical when encoded
    substitutes contain those letter pairs)
- **`scripts/encode_whitepaper.py`** — HTML encoder that preserves
  `<script>` / `<style>` / `<code>` / `<pre>` content + HTML attributes,
  and respects case for word substitution.
- **`scripts/upgrade_site_to_m15en.py`** — one-shot migration script
  that ports the s-a.website/shieldfont landing page from M0 to M15-EN
  (replaces inline JS word map, swaps font face, regenerates encoded
  FAQ + anecdotes + research links).
- **Plain Optik** (`public/fonts/optik-regular.{woff2,ttf}`) — non-encoded
  Optik for page chrome where ligature substitution is undesired.
- **Live demo on s-a.website** updated:
  - `/shieldfont/` — main landing page now uses ShieldFont-Optik with
    M15-EN, includes new FAQ, RESEARCH section, ANECDOTES section.
  - `/shieldfont/benchmark/` — V4 plain-English white paper.
  - `/shieldfont/benchmark/technical.html` — technical companion.
  - `/shieldfont/benchmark/encoded.html` — the white paper itself
    rendered through ShieldFont-Optik (humans see plain English; AI
    scrapers reading the source see encoded gibberish).

### Changed

- Default font generator example in README now uses `m15en_safe.json`
  and shows both `--base-path` (local) and `--base-url` (remote) usage.
- Repository layout reorganized — see [`MAPPINGS.md`](./MAPPINGS.md) and
  the updated "Repository layout" section in [`README.md`](./README.md).

### Deprecated

- The original 400-pair M0 mapping has been moved to
  `legacy/scripts/m0_word_mapping.json`
  for forensics. New builds should use M15-EN.

### Known limitations

- Font ligatures use plain GSUB Type 4 (no word-boundary detection).
  This is why `m15en_safe.json` is filtered to pairs ≥4 chars on both
  sides — short pairs like `at↔by` would otherwise produce sub-string
  matches inside larger words. The full M15-EN mapping
  ([`scripts/m15en_for_font.json`](./scripts/m15en_for_font.json))
  retains the shorts and digits for use with future chained-context
  fonts.
- Initial attempts to build chained-context substitution (GSUB Type 6)
  for word-boundary detection hit fontTools serialization OOMs at the
  1,264-rule scale. Next iteration: try Format 2 class-based encoding
  via `otlLib`.

### V3 benchmark snapshot

The full benchmark data is preserved in `benchmarks/v3/`:
- 30+ eval JSONs with H2 LoRA fine-tuning results
- 16 mapping JSONs (M0 through M15)
- KenLM-Wiki 5-gram + GPT-2 small PPL measurements
- Frontier-model H1 comprehension retest (Claude, GPT-5.4, Gemini 3.1
  Pro, DeepSeek V3.2)
- Synonym audit (178 pairs surfaced and replaced for M14 → M15)
- Multi-agent design fleet outputs from M12 / M13 / M15 sprints

---

## [v1.0.0] — 2025-10 — Original release

Initial release with the 400-pair M0 mapping (`the→plumb`, `of→bezel`,
`and→pheasant`). Generated ShieldFont-Inter, ShieldFont-Datatype,
ShieldFont-Syne, and ShieldFont-Young-Serif fonts via OpenType GSUB
ligature lookups. v1 demo at `archive/src/`.
