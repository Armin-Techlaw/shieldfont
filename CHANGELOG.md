# Changelog

All notable changes to ShieldFont. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
