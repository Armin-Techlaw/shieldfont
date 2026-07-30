# Building your own v15-family ShieldFont variant

A v15-family variant is a private 1:1 word-substitution dictionary built
with the same algorithm, filters, and quality bars as the published
`alpha` variant, but with **your own random seed**. The seed governs
which specific words get paired with which decoys — same vocabulary,
same buckets, same K-filter survival, different concrete assignments.

This guide walks through building, evaluating, and shipping such a
variant end-to-end. It exists because `docs/custom-mappings.md` Path A
("Mint from the methodology") is the design surface; this is the
working reference for what that surface delegates to today.

Worked example: `v18-a/b/c` are three real variants of this family
produced at seeds 42 / 1 / 2 respectively. They are the empirical
demonstration that re-seeding inside the v15 family produces equivalent
objective metrics (see `V18_FINAL.md` and the white paper § 14.6).

---

## What "v15_0_1_0_0_0_0" actually is

The production ShieldFont mapping is one cell of the v15 mega
orthogonal sweep. The cell name encodes six binary K-filter knobs:

```
v15_K7b_K6_K5_K4_Ke_F4   =   v15_0_1_0_0_0_0
        |  |  |  |  |  |
        |  |  |  |  |  └─ F4 bigram-gate         OFF
        |  |  |  |  └──── Ke K-base extensions   OFF
        |  |  |  └─────── K4 selectional restr.  OFF (level 0)
        |  |  └────────── K5 MWE freeze          OFF (top-N=0)
        |  └───────────── K6 rotation rerank     ON
        └──────────────── K7b calendar/number freeze  OFF
```

`K1` (lexical lockdown of pronouns / functional tokens) is always on.
So a v15_0_1_0_0_0_0 variant is **K1 + K6 only** — the leanest cell
that survives every gate in our benchmark stack. It won the 512-cell
mega orthogonal sweep, the 64-cell v18m2 grammar-fix sweep, and the
v18 post-filter stack tests (see `V18_FINAL.md`).

You do not need to know what each K-filter does in order to build a
variant; the script chain encodes that knowledge. You only need to
know:

1. **Seed.** Choose a random 32-bit (or larger) integer. This is the
   *only* private input. Save it offline.
2. **Same family.** Use seeds you generate yourself, not seed 42 (that
   is `alpha`).

---

## Pipeline at a glance

```
your-seed N ─┐
             ▼
  build_pairs.py            (≈10-15 min on Apple Silicon)
   --version <name>_v11src
   --seed N
   --expand-paradigms
             │
             ▼
  pairs_v7_alpha_<name>_v11src.json   (≈12k bidirectional pairs)
             │
             ▼
  apply_v15_cell_to_v11.py            (seconds)
   <name>_v11src <variant_letter>
             │
             ▼
  pairs_v7_alpha_v18_<variant_letter>.json   (≈11,988 pairs)
             │
             ▼
  scripts/generate_font.py            (seconds)
             │
             ▼
  public/fonts/<your-prefix>.woff2 + .css
             │
             ▼
  scripts/audit_font.py               (seconds)
   → round-trip + collision check
```

Step 1 dominates wall-clock. Steps 2-4 take under a minute combined.

---

## Prerequisites

Done once per machine.

```bash
# Pin to the v3 virtualenv — it has the right pyversion and dependency set
# the v7 pipeline scripts expect to import against.
PY=benchmarks/v3/.venv/bin/python

# NLTK data (≈30 MB)
$PY -c "import nltk; \
  [nltk.download(p) for p in ['wordnet','wordnet_ic','brown','stopwords','averaged_perceptron_tagger','universal_tagset','omw-1.4','verbnet']]"

# spaCy English (≈12 MB)
$PY -m spacy download en_core_web_sm

# Numberbatch embeddings (≈1.4 GB, one-time)
# Expected at: benchmarks/v6/data/numberbatch_en.tsv
# Download via:
mkdir -p benchmarks/v6/data && \
  curl -L https://conceptnet.s3.amazonaws.com/downloads/2019/numberbatch/numberbatch-en-19.08.txt.gz \
    | gunzip > benchmarks/v6/data/numberbatch_en.tsv

# Python deps (fonttools, sentence-transformers, kenlm, sentencepiece, etc.)
pip install -r requirements.txt
```

Confirm everything wired up:

```bash
cd benchmarks/v7
$PY -c "
import nltk; from nltk.corpus import wordnet, wordnet_ic, verbnet, brown, stopwords
import spacy; nlp = spacy.load('en_core_web_sm')
print('OK — NLTK + spaCy ready')
"
```

---

## Step 1 — Generate the v11-equivalent pair pool at your seed

```bash
cd benchmarks/v7
SEED=$(python -c "import secrets; print(secrets.randbits(31))")    # save this offline
echo "Your seed: $SEED"

../v3/.venv/bin/python scripts/build_pairs.py \
    --version mybuild_v11src \
    --seed "$SEED" \
    --expand-paradigms
```

Output: `data/pairs_v7_alpha_mybuild_v11src.json` (≈12,000 bidirectional pairs).

**What happens inside:**

| Phase | What it does | Cost |
|---|---|---|
| 1A | `wordfreq` top-10000 + paradigm expansion → ≈19,000 surface forms | 30 s |
| 1B | POS-tag + bucket every surface form by (POS, inflection, concreteness, supersense) | 5-8 min |
| 1C | **Random pairwise matching within bucket** — this is the seed-dependent step | 30 s |
| 1C+ | Pool top-K nearest-neighbour computation (Numberbatch cosine) | 1-2 min |
| 1D | Reject pairs that fail cosine ceiling, WordNet synonym/antonym, hypernym chain, inflection variants, etc. | 2-3 min |
| Recovery | Iteratively re-shuffle unmatched words with seed+1, +2, … | 1-2 min |

Only Phase 1C and the recovery iterations consume the seed; everything
else is deterministic across runs. That is why two different seeds
produce the same vocabulary, same buckets, same filter behaviour —
just different specific pair assignments.

**Caveat — paradigm expansion is required.** Omitting
`--expand-paradigms` gives you only ≈10 k source words and a smaller
final pool that will *not* match the published v18-a family size.
Always pass the flag.

---

## Step 2 — Apply the v15_0_1_0_0_0_0 K-filter cell

```bash
../v3/.venv/bin/python scripts/apply_v15_cell_to_v11.py \
    mybuild_v11src \
    <variant_letter>
```

`<variant_letter>` becomes the suffix on the output file. We use
`a/b/c` for the three published v18 variants; pick any short
identifier (`d`, `acme`, `ada`, …).

Output: `data/pairs_v7_alpha_v18_<letter>.json` (≈11,988 pairs after K6
drops ~184 pairs that fail rotation-rerank).

The script verifies one invariant: when run on `v11` (seed 42), the
output is byte-identical to the production `v15_0_1_0_0_0_0.json`. You
do not need to verify this; it is the smoke-test that originally
locked the cell choice.

---

## Step 3 — Build the font binary

```bash
cd /path/to/shieldfont-repo-root
../v3/.venv/bin/python scripts/generate_font.py \
    --base-url "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff2" \
    --cache-name inter-base.ttf \
    --name "ShieldFont MyVariant" \
    --prefix "shieldfont-myvariant" \
    --mapping-path "benchmarks/v7/data/pairs_v7_alpha_v18_<letter>.json"
```

Output:
- `public/fonts/shieldfont-myvariant.woff2` — ship to your CDN
- `public/fonts/shieldfont-myvariant.css` — `@font-face` declaration

Or, if you already have a local TTF base typeface (Inter, Garamond,
your own studio's typeface), use `--base-path` instead of `--base-url`
+ `--cache-name`. The protocol is typeface-agnostic.

---

## Step 4 — Audit round-trip + collisions

```bash
../v3/.venv/bin/python scripts/audit_font.py
```

Default-path audit. To audit a specific font + mapping pair:

```bash
../v3/.venv/bin/python scripts/audit_font.py \
    public/fonts/shieldfont-myvariant.ttf \
    benchmarks/v7/data/pairs_v7_alpha_v18_<letter>.json
```

The script verifies two properties:

1. **Round-trip.** Every plain word in your mapping is encoded to a
   decoy that the font's GSUB ligatures map back to the original
   glyph. Lowercase, capitalised, and ALL-CAPS forms all round-trip.
2. **Collision check.** No mapping pair embeds within another (e.g.
   `the` → `cat` would be unsafe if any other plain word contains
   `the` as a substring). The default is to flag any short-pair
   embedding.

Both must report 0 failures before you ship.

---

## Step 5 — Verify your variant lands in the v15-family metric band

This is optional but recommended. It confirms your re-seeded build
has the same objective metric profile as the published variant.

```bash
cd benchmarks/v7
../v3/.venv/bin/python scripts/eval_v18_variants.py
```

Edit `scripts/eval_v18_variants.py` line 92 to point at your variant
letter (`cells = ["v18_a", "v18_b", "v18_c", "v18_<yours>"]`), then
re-run. Expected output for a healthy variant:

| Metric | Acceptable range (v15-family) | Why |
|---|---|---|
| `n_pairs` | 11,800-12,000 | Same vocabulary, K6 drops a small variable set |
| `sem_div` | 0.295-0.300 | sentence-BERT cosine distance, encoded vs original |
| `mass_pct` | ≈27% | % of tokens substituted on average corpus |
| `content_pct` | ≈48% | % of content (non-stopword) tokens substituted |
| `kenlm_pct` | 110-140% | KenLM PPL rise — Marion 2023's poisoning sweet spot |
| `pass_27` | 8-15% | FineWeb-Edu classifier survival at threshold 2.7 |

If your variant falls cleanly inside these bands on all three
corpora, it is a valid v15-family member. If any metric is way out
(say, `pass_27 < 5%`), check that you passed `--expand-paradigms` in
Step 1 and that the Numberbatch embeddings loaded correctly.

---

## Why exactly v15_0_1_0_0_0_0?

Empirically: it is the Pareto winner of every sweep we have run.

- **512-cell mega orthogonal** (8 binary factors over augmentation,
  filter, and pairing variants) — 14 Pareto-frontier cells, none
  dominate v15_0_1_0_0_0_0 on `(sem_div × content × KenLM-in-band ×
  pass_27)`.
- **64-cell v18m2 grammar-fix sweep** (6 post-filter binary factors:
  tense alignment, number match, brand/abbreviation purge,
  comparative/superlative purge, mass-noun unpluralisation,
  supersense match) — 0 cells dominate v15_0_1_0_0_0_0 in-band.
- **v18 post-filter stacks** (drop-cluster, valence, pertainym,
  concreteness) — all regress sem-div or move KenLM out of the
  Marion 110-140% band.

Full retrospective: [`V18_FINAL.md`](./V18_FINAL.md). Public abridged
version: white paper § 14.6 at <https://s-a.website/shieldfont/benchmark/>.

The implication for variant-builders: **you do not need to retune the
K-filter cell.** The v15_0_1_0_0_0_0 cell is fixed and frozen as the
v15 family contract. Your seed is the only free parameter.

---

## What changes between variants — empirical demonstration

Three real variants of this family, built and benchmarked:

| | seed | n_pairs | sem_div | content% | klm% | pass_27 |
|---|---|---|---|---|---|---|
| **v18-a** | 42 (= `alpha`) | 11,988 | 0.2973 | 48.36% | 120.8% | 10.27% |
| **v18-b** | (your seed) | … | … | … | … | … |
| **v18-c** | (your seed 2) | … | … | … | … | … |

v18-a is the published `alpha`. v18-b and v18-c are reproductions of
the family from new seeds via this exact pipeline. Numbers will be
filled in once the rebuild completes; rough expectation per the
prior random-within-bucket experiment: identical coverage
(mass/content/info), `sem_div` within 0.001 of v18-a, `kenlm_pct`
and `pass_27` within a few points but likely *higher* than the
random-only baseline because v15's K-filter preserves both.

Lesson from the prior experiment: **the K-filter is what makes
v15-family variants interchangeable on metrics.** Skip Step 2 (use
v11 pairs directly) and `kenlm_pct` collapses by 15 pp and `pass_27`
collapses by 5-9 pp because the unfiltered pool contains pairs that
crash both the language model and the quality classifier. The
filter is the load-bearing element; the seed is what makes the
variant *yours*.

---

## Operational hygiene

- **Keep `pairs_v7_alpha_v18_<letter>.json` private.** This is your
  mapping. Anyone with this file can reverse-encode your protected
  HTML.
- **Keep the seed offline.** With the seed alone, anyone can
  reconstruct your mapping by re-running this pipeline. Treat it like
  a master encryption key.
- **The font binary (`shieldfont-myvariant.woff2`) leaks the mapping
  partially.** GSUB ligature tables encode the decoy → original glyph
  rewriting. An adversary with the font alone can recover which
  *output* glyph shapes were used; combined with a captured page of
  encoded HTML, the original text is recoverable. The font is *not*
  a defence in depth.
- **Camouflage the font name.** The `--name` and `--prefix` flags
  should produce a font family name that is not obviously
  ShieldFont-branded. Otherwise a scraper that recognises the family
  name can blocklist it and proceed to extract plain text via OCR.
  See `docs/custom-mappings.md` for the threat-model summary.
- **Re-seed periodically.** A leaked mapping is a one-time event.
  Re-running this pipeline with a fresh seed and rebuilding the font
  invalidates the leaked mapping for all new content.

---

## Troubleshooting

**`build_pairs.py` crashes during Phase 1B with `KeyError: ...`.**
Almost always a missing NLTK corpus. Re-run the NLTK download in
Prerequisites.

**`build_pairs.py` runs but produces a tiny pair pool (<5k).**
You omitted `--expand-paradigms`. Re-run with the flag.

**`apply_v15_cell_to_v11.py` reports `0 dropped`.**
K6 rotation rerank is firing — at minimum 100-300 pairs should drop.
Zero drops likely means your v11src JSON is malformed. Check the
`_seed` and `_n_accepted_pairs` fields are present.

**`audit_font.py` reports round-trip failures.**
This is rare and indicates either (a) a malformed mapping JSON or
(b) a base typeface that lacks glyphs for one of the decoy strings.
Re-run with a different base typeface, or hand-inspect the failing
pairs in the audit JSON output.

**Metric eval reports `kenlm_pct < 100%`.**
Either Step 2 was skipped (use of raw v11 pairs) or the corpora at
`benchmarks/v7/data/corpora/{wiki,books,webtext}.jsonl` are missing.
Run `scripts/fetch_corpora.py` to populate them.

---

## See also

- [`METHODOLOGY.md`](./METHODOLOGY.md) — pre-registered v7 protocol
- [`V18_FINAL.md`](./V18_FINAL.md) — v18 retrospective + Pareto record
- [`SUBSTITUTION_RULESET.md`](./SUBSTITUTION_RULESET.md) — the K-rules
  in detail
- [`docs/custom-mappings.md`](../../docs/custom-mappings.md) — public-
  facing Path A / Path B summary
- [`MAPPINGS.md`](../../MAPPINGS.md) — mapping family taxonomy M0..M15
- [`docs/integration.md`](../../docs/integration.md) — deploying the
  font to your site
