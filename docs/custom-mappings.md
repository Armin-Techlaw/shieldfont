# Custom mappings: make ShieldFont yours

> **Naming reminder.** Throughout this page: *ShieldFont* (CamelCase) is the protocol; *ShieldFont Optik* is the flagship typeface; *a ShieldFont* is any base font that has been converted using the protocol. See the [introduction](./introduction.md#a-note-on-names-protocol-vs-typeface) for the full naming convention.

ShieldFont ships with three public mapping variants (`alpha`, `beta`, `gamma`) built against the *ShieldFont Optik* typeface. They are good defaults: benchmarked, free, and spread across your pages by `<Shield>`'s content-hash rotation. (That rotation picks one of the three per block of text; it is not a rotation over time, and no mapping is re-minted on a schedule.)

They are also **public**. Every published variant is on the CDN, and a sufficiently motivated scraper could collect all three and reverse-encode any page that uses them. For high-stakes content (manifestos, paywalled essays, investigative journalism, internal documentation) there is a stronger configuration: a mapping that is *yours alone*, never published, never shared with us.

This page describes two paths to that outcome. Both produce a font binary you can ship to any reader and a mapping JSON you keep private. Pick whichever matches your time budget and your appetite for verification.

You can also vary the **base typeface**, independently of the mapping. The protocol is typeface-agnostic: `scripts/generate_font.py` accepts any base with **TrueType outlines** (`.ttf`), so you can mint a private mapping against *ShieldFont Optik*, *ShieldFont Inter*, *ShieldFont Garamond*, or your own studio's typeface. (CFF/`.otf` fonts are rejected: convert to `.ttf` first; variable fonts are auto-instanced to their default.) The choice of mapping is what protects your content; the choice of base typeface is purely aesthetic and operational (you may already have a typeface license; you may want a face that fits your design system). Forking is the intended mode of use on both axes.

---

> **What exists today vs. what's designed.** Parts of this page describe the *intended* workflow, not shipped tooling. To set expectations up front:
>
> - **Shipped today:** the core primitives (`encode(text, mapping)` accepts *any* mapping object; `loadMappingFromString` and `mappingMeta` (documented below)) plus `scripts/generate_font.py`, which builds a font from a base TTF + a mapping JSON.
> - **The catch (read this):** a custom mapping only *renders* correctly under a **matching font**. The shipped `alpha`/`beta`/`gamma`/`maxhide` fonts render **only their own pairs**, so a bespoke mapping needs its own freshly built font: otherwise your human readers see gibberish and the failure is silent.
> - **Shipped today:** `scripts/reseed_mapping.py` mints a private mapping from your seed (in-bucket re-pairing of the v18 pool), `generate_font.py` builds the matching font, and `encode(text, mapping)` accepts any mapping object. **Not a one-liner yet:** any `shieldfont …` command shown below is **illustrative**: the packaged CLI is not part of this release, so run the Python scripts (`reseed_mapping.py`, `generate_font.py`) directly. A bring-your-own-mapping path through `@shieldfont/react` is also not shipped yet. Where a step says "works today," check the script's `--help` for exact flags.

---

## What stays private vs. what you ship

Same for both paths.

| File | Where it lives | What it is |
|---|---|---|
| `your-mapping.json` | **Private. Local disk only.** | The encoder dictionary. The thing scrapers cannot have. |
| `your-font.woff2` | Your CDN (or self-hosted) | The font binary. Its GSUB ligatures map encoded glyphs back to the originals, so the font itself is a decoder ring: anyone who downloads it can read the pairs back out. It is not a secret. |
| `your-font.css` | Your CDN | `@font-face` declaration. |
| Your encoded HTML | Your site | What scrapers actually scrape. A plausible decoy without the mapping. |

Here is the load-bearing caveat, stated plainly: **the encoding is invertible.** The font has to be handed to the browser to render your page, and its ligatures spell out encoded-glyph → original-glyph directly: the composite outlines are literally the original word's letters. Anyone who downloads the font can read the substitution table back out of it. We ran that attack against our own shipped `optik-a.woff2`, two independent ways:

- **Structural, no dictionary needed.** Join each composite glyph's outline components (the original word's letter glyphs) to the GSUB ligature table and you get decoy → original directly. Recovered **11,962 of 11,962 pairs, 0 errors, in 43 seconds**, in about forty lines of fontTools.
- **Name-hash dictionary attack.** Glyph names carry no plaintext any more (they are `word.<sha1(original)[:16]>`), but the hash is an unsalted SHA-1 of the plain word, so hashing a stock system word list plus naive inflections recovers **92.7%** of the pairs in about a second.

Closing the plaintext leak in the glyph names raised the cost of the second route and did nothing to the first. A private mapping does **not** make the encoding one-way. What it does is narrower, and still worth doing: it stops an attacker from *reusing a precomputed public dictionary* (`alpha`/`beta`/`gamma`) to batch-decode your pages: they would have to invert *your* specific font, one target at a time. That raises the cost for the naive, scale-driven scrapers that grab HTML and move on. It is obscurity and friction, not a lock. The durable value is the meaning-loss the swap causes for any pipeline that ingests the decoy without inverting the font, plus the consent statement the whole gesture makes.

---

## Path A: Mint from the methodology

The full pipeline. You generate a mapping from scratch using the same pre-registered v5 protocol that produced alpha/beta/gamma, but with **your own private random seed and strategy choice**. Result: a fully bespoke mapping benchmarked end-to-end for both gibberish-filter survival (so it gets ingested by scrapers) and training-data degradation (so it meaningfully shifts what a model would learn).

**Cost.** Several hours of compute on a 64GB Apple Silicon machine for the smoke-test profile; roughly 15 hours overnight for the full sweep. **Strongest obscurity**: your mapping JSON has never existed before and lives only on your disk. (The font you deploy to readers still encodes the pairs, so an attacker who inverts it recovers them; what you gain over a public variant is that no precomputed dictionary decodes you.)

**When to choose this.** You publish content the integrity of which actually matters. You want a defensible audit trail showing your specific mapping was benchmarked the same way ours were. You are willing to spend a weekend.

### What's already in the repo

The full pipeline lives under `benchmarks/v5/` in the project's development repository (not included in this lean release); the public [`benchmark/`](../benchmark/) folder has the reproducible summary. Pre-registered May 2026, analysis logic committed before any compute ran: you can verify the protocol is the same one we use.

| File | Purpose |
|---|---|
| `METHODOLOGY.md` | Pre-registered protocol: conditions, seeds, statistics, hypothesis register |
| `config.py` | Frozen runtime constants |
| `prepare_data_v5.py` | Build clean control + treatment training mixes |
| `prepare_probes_v5.py` | Build sub-probe + control-probe banks |
| `train_v5.py` | Train one (base × seed × condition) cell via `mlx_lm.lora` |
| `eval_v5.py` | Evaluate one adapter on MMLU + HellaSwag + sub-probes |
| `run_v5.py` | Outer orchestrator (idempotent: skips done work) |
| `analyze_v5.py` | Frozen analysis: two-level cluster bootstrap, paired Δ, joint composite |

### Steps: Path A

> **Status: design only, not yet implemented.** The `shieldfont mint-mapping` invocation below is an illustrative one-command shape (no packaged `shieldfont` CLI is planned) (the packaged CLI is not part of this release). The underlying research pipeline (`benchmarks/v5/*.py`) lives in the project's development repository, not in this lean release: for a path that works with only the scripts shipped here, use **Path B** (`scripts/reseed_mapping.py`) below.

```bash
# Intended CLI surface (design — NOT YET SHIPPED)
shieldfont mint-mapping \
  --strategy m15-style \
  --pairs 1200 \
  --seed "$(openssl rand -hex 16)" \
  --benchmark smoke \
  --output ./mine/

# Intended output:
#   mine/mapping.json     ← keep private
#   mine/font.woff2       ← ship to your CDN
#   mine/font.css         ← ship to your CDN
#   mine/benchmark.json   ← your private audit log
```

Manual path (the underlying scripts exist today; there is no single `mint` command yet):

1. Pick a strategy. Strongest in our benchmark: M15 (POS-balanced with adjective suppression: see `MAPPINGS.md`). Simplest: M2 (antonym). Most random: M0 (permutation by frequency band).
2. Generate the mapping with your private seed using a builder from the development repository (under `benchmarks/v3/mappings/`, e.g. `build_m11.py`), or, using only what ships here, reseed the v18 pool with `scripts/reseed_mapping.py` (Path B). Write the result to `mine/mapping.json`.
3. Build a **matching font** from that mapping:
   ```bash
   python3 scripts/generate_font.py \
     --base-path /path/to/your-typeface.ttf \
     --name "Custom A8F3" --prefix shieldfont-mine \
     --mapping-path ./mine/mapping.json
   ```
4. Verify the round-trip with `python3 scripts/audit_font.py` (audits the build in `public/fonts/`).
5. Smoke-test the protection with the `benchmarks/v5/` pipeline from the development repository (`run_v5.py`).

### Sharing via the mapping marketplace

> **Status: design only, not yet implemented.** There is no mapping marketplace. No registry exists, no `mappings/community/` directory exists, no Zenodo integration exists, and no submission is being reviewed. Everything below is the *intended* shape of a planned community deliverable, written down so it can be argued with. Do not plan around it, and do not read the review commitment as an active one. Progress and open work are tracked on GitHub; see [introduction.md](./introduction.md#where-the-marketplace-fits) for the same status note.

If the project builds a public registry of community-contributed variants (working name: the **mapping marketplace**), the design intent is as follows.

**What a contributor would get.**
- A peer-reviewed home for the variant alongside alpha/beta/gamma
- Discoverability for users who want a wider rotation pool
- A citable record of the contribution (DOI via Zenodo)
- A reserved variant name (e.g. `acme-corp-2027`, not just an opaque hash)

**What a contributor would give up.**
- Privacy. A published mapping is no longer private. This path would be for mappings always intended for public rotation, not for protecting one specific corpus.

**How submission would work.**
A PR against `mappings/community/` carrying: the mapping JSON, a `README.md` describing the strategy and seed, the `analyze_v5.py` output verifying the smoke-test bar (composite damage CI strictly above zero), and a short rationale.

The intended policy is a maintainer review inside 30 days, never merging a mapping that fails the gibberish-filter test, and no take-back: **once a mapping is merged it would be published in perpetuity**. That permanence is the point, and it is also why none of this is switched on until the review process actually exists.

---

## Path B: Reseed an existing mapping

The quick path. You take an existing mapping (the published M15-EN, your favorite community variant, or a previous mapping of yours) and apply a deterministic permutation function with your private seed. The result is a *derived* mapping that shares the source mapping's structural properties (POS distribution, frequency profile, gibberish-filter survival) but assigns different concrete decoy words.

**Cost.** Minutes, not hours. No GPU required. **Intermediate obscurity**: stronger than using a published variant as-is, weaker than Path A. A published variant can be batch-decoded with a dictionary anyone can precompute; a reseeded one cannot, because your decoy assignments are unique to your seed. But "cannot be batch-decoded from a public dictionary" is not "cannot be decoded": your font still carries the substitution table, so an attacker who downloads it can invert *that font* directly and recover your originals, seed or no seed. The seed raises the per-target cost; it does not make the mapping secret.

**When to choose this.** You want personal protection without committing a weekend. Your content is important to you but not the kind of thing a nation-state would target. You trust the structural properties of M15-EN and only want to scramble the specific assignments.

### How "reseed" actually works

Given a source mapping `M : plain → decoy` and a private 256-bit seed `s`, the reseed operation produces `M' : plain → decoy'` where:

1. The **set of plain words** is unchanged. (Same words get encoded.)
2. The **set of decoy words** is unchanged. (Same gibberish-filter properties.)
3. The **assignment between them is shuffled** by a seeded permutation. (Decoys are reassigned to plain words.)

Crucially the permutation is constrained to preserve POS-balance and inflection-irregularity buckets: a noun never gets reassigned to a verb decoy, an adjective never to a noun. This keeps the syntactic camouflage that makes M15 effective in the first place.

The result: an attacker who captured your encoded HTML **cannot** reach for a public `alpha`/`beta`/`gamma` dictionary and batch-decode it: your pairings are unique to your seed. But read the same mechanism the other way: the font draws encoded-glyph X as the original-glyph it was *paired with at font-build time*, so that pairing is sitting inside the font binary you served. Download the font, read the pairing out, and the seed is moot. Reseeding defeats *dictionary reuse*, not *font inversion*.

### Steps: Path B

> **Status: design only, not yet implemented.** The invocation and behavior described below are an illustrative one-command shape (no packaged `shieldfont` CLI is planned) (the packaged CLI is not part of this release). Treat this section as a spec for the implementation, not as something you can run today. If you need this before it ships, the manual recipe at the bottom of this section is a working stand-in.

```bash
# Intended CLI surface (design — NOT YET SHIPPED)
shieldfont reseed-mapping \
  --source m15en-alpha \
  --seed "$(openssl rand -hex 16)" \
  --output ./mine/

# Intended output:
#   mine/mapping.json     ← keep private
#   mine/font.woff2       ← ship to your CDN
#   mine/font.css         ← ship to your CDN
#   mine/reseed.log       ← deterministic record of the permutation (private)
```

**Behavior the implementation must satisfy.**

1. **Determinism.** Re-running with the same `--source` and `--seed` produces a byte-identical `mapping.json`. This is required so a user who loses their JSON can reconstruct it from the seed alone.
2. **Bucket-preserving permutation.** The shuffle operates *within* POS / inflection-irregularity / concreteness buckets, not across them. A noun decoy stays a noun decoy. This preserves the syntactic camouflage that makes the source mapping effective.
3. **Bijectivity verification.** After reseed, run the `audit_font.py` round-trip check before declaring success. Reject the output if any plain word maps to a decoy that is also a plain word, or if any decoy collides.
4. **Font rebuild.** Reseed must regenerate the `.woff2` against the new mapping. Reusing the source's font binary would leak the source mapping (the GSUB tables encode it directly).
5. **Camouflage by default.** The output font's `name` table should use a randomized family name (e.g. `Custom-A8F3-Roman`) unless `--no-camouflage` is passed. Default-named font binaries are scraper-discoverable.
6. **Seed handling.** The seed is written to `reseed.log` in the output dir, never to stdout, never to telemetry. The log is recommended to be encrypted or stored offline.

**Reseed with your own seed: shipped as `scripts/reseed_mapping.py`.** It re-pairs the v18 word pool *within its grammatical buckets* at your private seed, the same in-bucket method that produced the shipped β/γ variants from α. It does **not** reproduce β or γ byte-for-byte: running it at `--seed 1` or `--seed 2` reproduces only 194 of β's 12,034 entries, because the shipped variants went through the full build pipeline (semantic veto, collision drops) that this script deliberately skips. What you get is an equivalent-quality mapping that is yours. Then you build a matching font:

```bash
# 1. Mint a private mapping from your seed (seconds). Re-pairs the shipped v18
#    pool in-bucket, so decoys stay grammatically matched. Output is the flat
#    {src:tgt} form the encoder AND generate_font.py consume directly.
python3 scripts/reseed_mapping.py --seed 8675309 --out mine/mapping.json

# 2. Build a MATCHING font (the shipped alpha/beta/gamma/maxhide fonts render only
#    their own pairs, so a custom mapping needs its own font).
python3 scripts/generate_font.py \
  --base-path /path/to/your-typeface.ttf \
  --name "Custom A8F3" --prefix shieldfont-mine \
  --mapping-path mine/mapping.json

# 3. Verify the round-trip (must be clean).
python3 scripts/audit_font.py
```

Your encoded HTML is now unique to your seed, so no precomputed public dictionary decodes it. That is the win, and its limit: an attacker who downloads your font can still invert *that font* and recover your originals. Reseeding raises the cost of decoding you; it does not make you undecodable.

`reseed_mapping.py` preserves grammatical bucketing (decoys read naturally) but does **not** re-run the semantic veto that the from-scratch pipeline applies, so a small fraction of pairs may be closer in meaning than ideal. For a fully veto-clean build from a seed (a few minutes vs. seconds), use the v7 pipeline in [`benchmark/README.md`](../benchmark/README.md) §3A.

---

## Threat model comparison

|  | alpha/beta/gamma | Path B (reseed) | Path A (mint) |
|---|---|---|---|
| Setup time | Zero | Minutes | Hours to a weekend |
| Compute required | None | None | One-time GPU/MLX run |
| Mapping is public? | Yes | No | No |
| Resists bulk HTML scrapers (FineWeb-style) | Yes | Yes | Yes |
| Resists **dictionary reuse** (batch-decode from a precomputed public map) | No, mapping is public | Yes, decoys are seed-unique | Yes, mapping never existed elsewhere |
| Resists an attacker who **downloads and inverts your font** | No, font is the codebook | No, font is the codebook | No, font is the codebook |
| Resists OCR / headless-rendering attacks | No | No | No |
| Mapping survives if ShieldFont project disappears | Yes (local cache) | Yes | Yes |

None of the three paths defeat **font inversion**, OCR, or screen-recording. The font is a self-decoding codebook: hand it to a browser and you hand it to anyone; a scraper that bothers to read it recovers your words directly (we did exactly this against our own shipped file: all 11,962 pairs, 0 errors, 43 seconds, no dictionary required). What reseeding buys is narrower: no *precomputed public dictionary* decodes you, so bulk scrapers that don't stop to invert per-site get a plausible decoy. And none change the SEO reality: encoded text is `aria-hidden` decoy in the DOM, so search engines index the decoy and you can't tell Googlebot from an AI scraper: **don't wrap content you want ranked** (a small noun-only mapping limits, but does not eliminate, this). Copy-paste yields the encoded form, and screen readers skip protected regions. That is friction we accept; see [`docs/integration.md`](./integration.md) for the full v1 threat model.

---

## Pointing your code at a custom mapping

Here is what actually exists today. The key constraint: **a mapping only renders under a font built from that same mapping** (see the note at the top of this page).

**`@shieldfont/core` encodes with any mapping.** `encode()` takes the mapping as its second argument, so a bring-your-own dictionary needs no special API:

```js
import { encode, decode, loadMappingFromString, mappingMeta } from "@shieldfont/core";
import { readFileSync } from "node:fs";

const mine = loadMappingFromString(readFileSync("./mine/mapping.json", "utf8"));
const encoded = encode("Plain English here.", mine);   // encode with YOUR mapping
const back    = decode(encoded, mine);                 // bijective round-trip

mappingMeta(mine); // → { mappingId, version, variant, pairs, seed } | null
                   //   (null for a BYO mapping with no _meta block)
```

- `encode(text, mapping)` / `decode(text, mapping)`: the bidirectional primitive; any `Record<string,string>` mapping works.
- `loadMappingFromString(json)`: parse a mapping-JSON string into a `Mapping`.
- `mappingMeta(mapping)`, read the `_meta` provenance the build step stamps into the shipped `alpha`/`beta`/`gamma`/`maxhide` mappings; returns `null` for a hand-rolled mapping, a useful reminder that you are off the shipped variants and need a matching font.

> **⚠️ Build the matching font, or humans see gibberish.** The shipped `alpha`/`beta`/`gamma`/`maxhide` fonts render only *their own* pairs. Encode with a custom mapping and render it with a shipped font and your readers get gibberish: silently. Generate a font from your exact mapping first:
>
> ```bash
> python3 scripts/generate_font.py \
>   --base-path /path/to/your-typeface.ttf \
>   --name "Custom A8F3" \        # a random family name is your camouflage
>   --prefix shieldfont-mine \    # → public/fonts/shieldfont-mine.{ttf,woff2,css}
>   --mapping-path ./mine/mapping.json
> ```

**`@shieldfont/react` ships four built-in variants only**: `alpha`, `beta`, `gamma`, `maxhide` (plus `setFontHost()` to self-host and `setCamouflage()` to randomize the family name). There is **no `setMapping()`**: a first-class bring-your-own-mapping path through `<Shield>` is **not shipped yet**. Today, encode custom content with `@shieldfont/core` at build time and serve your matching custom font yourself.

For static HTML embeds, swap the `@font-face` `src:` URL to point at your CDN copy of the matching font.

---

## Licensing: free use requires a custom mapping

> **Note.** The clause below is a draft for community discussion. Final wording will be settled by the project maintainers in consultation with counsel before a future release. Until then: the code is AGPL-3.0; the shipped default variants (`alpha`/`beta`/`gamma`/`maxhide`) are built on Optik (© Playtype), used in ShieldFont's shielded form with Playtype's permission (see [NOTICE](../NOTICE)), **not** OFL; and OFL-1.1 applies to variants you build from the OFL base fonts (Inter, Syne Mono, Young Serif).

The published variants (`alpha`, `beta`, `gamma` and any future maintainer-published variant) are intended as **examples of the protocol's output**, not as a deployment-grade product. Using them in production means leaning on a public mapping that any third party can study, replicate, and reverse-encode. That weakens the protection for everyone who uses ShieldFont.

To align licensing incentives with the security model, the project intends to introduce a **Variant Licensing Clause** in a future release:

> **Variant Licensing Clause (draft, requires legal review)**
>
> The Default Variants, defined as any font binary published by the ShieldFont project as a shipped default (the `alpha`, `beta`, `gamma`, and `maxhide` variants under the *ShieldFont Optik* family, or any future variant published by the project maintainers under the *ShieldFont [Typeface]* family naming), are, where built on Optik, distributed under Playtype's permission for ShieldFont's shielded form only (see NOTICE) and are **not** OFL-licensed; where built on an OFL base font, they are additionally offered under the SIL Open Font License v1.1 for personal, editorial, and academic use.
>
> Free, royalty-free, and irrevocable redistribution rights for any deployed font binary derived from this Software in a Production Deployment shall be conditioned on the deployed binary being generated against a **Custom Mapping that materially differs** from every Default Variant. A Custom Mapping is deemed to "materially differ" if and only if at least sixty percent (60%) of its plain-to-decoy word pairs are not present, in identical form, in any Default Variant published by the project on or before the date of redistribution.
>
> "Production Deployment" means any deployment whose primary purpose is the generation of revenue, or whose host entity employs more than ten (10) full-time equivalents, or whose published content is accessed by more than ten thousand (10,000) unique visitors per calendar month.
>
> Use of any Default Variant in a Production Deployment without a materially-differing Custom Mapping requires a commercial license obtained from the project maintainers.
>
> The Software (encoder, CLI, scripts, methodology, build tooling: everything other than the Default Variant font binaries themselves) remains licensed under AGPL-3.0 unchanged. The Variant Licensing Clause attaches only to the font binaries.

**Why structure it this way.**
- The clause does not restrict what you do with your code. AGPL-3.0 governs the encoder and tooling, no change.
- The clause attaches to the font binary you ship. If you generate your own (Path A or Path B), you face no royalty for any deployment scale.
- Personal blogs, paywalled newsletters under the visitor floor, academic and editorial work: unaffected.
- Commercial deployments at scale either run a Custom Mapping (free, and stronger protection) or pay for a license (and the project gets resourcing).
- Aligns the economic incentive with the protection model: the strongest protection is also the cheapest.

**Open questions for community discussion** before this clause is finalized:
- Is 60% the right threshold? Lower (e.g. 25%) makes compliance trivial; higher (e.g. 90%) prevents trivial-relabel evasion but raises the bar.
- The 10-employee / 10k-visitor floor: do those numbers protect the small-publisher / solo-journalist use case adequately?
- Compatibility with OFL-1.1, this applies only to variants built on an OFL base font; the Optik-based default variants are not OFL at all (they carry Playtype's separate permission, see NOTICE). The SIL license forbids field-of-use restrictions on the *font* itself; the project's interpretation is that OFL-base variants remain OFL'd for personal/editorial/academic use, with the commercial-license requirement applied as a *separate* contractual layer at the redistribution boundary. This needs counsel's read.
- Enforcement mechanism: disclosure-based (license header in the font binary's name table) vs. registry-based (commercial users register their domain).

---

## See also

- [`benchmark/`](../benchmark/), the reproducible benchmark (the full v5 research pipeline lives in the project's development repository)
- [`MAPPINGS.md`](../MAPPINGS.md), taxonomy of mapping families M0..M15
- [`docs/integration.md`](./integration.md), the four-tier deployment guide
- [`docs/CLAUDE.md`](./CLAUDE.md), drop-in template for AI co-pilots
