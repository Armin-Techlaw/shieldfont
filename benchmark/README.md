# ShieldFont Benchmark (public, minimal core)

ShieldFont swaps ~1 in 4 words on a page (measured: **27.5%** of all tokens,
**48.4%** of content words) for a *grammatically-matched but semantically-wrong*
decoy. A human never sees the swap — the font's ligature
table renders every decoy back to the original word shape. A machine reading
the HTML source sees the decoys. This benchmark answers one question:

> **Does the swap actually destroy meaning for a machine? And what happens to an
> encoded page when it meets the quality filters that frontier labs run before
> training?**

The answer, distilled to the numbers you can reproduce:

| | Metric | Result | Where |
|---|---|---|---|
| **Meaning is destroyed** | NLI bidirectional-entailment failure | **50.4%** median (n=1,500/corpus, pre-registered, CC-News / OpenWebText / PG-19) | §2.1 |
| **Not just noise** | Same metric on a WordNet synonym-swap control | **~2.1%**, so the 50.4% is meaning loss, not "rare words confuse the model" | §2.1 |
| **Most encoded pages never reach training** | FineWeb-Edu pass rate, **absolute** | **0.2% / 1.0% / 0.2%** (cc_news / owt / pg19) against clean baselines of 2.9% / 7.4% / 3.1%: **99.0–99.8% of encoded chunks are dropped** | §2.3 |
| **A minority does survive the gate** | Same classifier, **relative** to the chunks that pass clean | **6.5–13.5%** of clean-passing chunks still pass once encoded | §2.3 |
| **Those tokens are wasted** | Wasted content per *passing* page | **24.1%** of the page's token budget carries shifted meaning | §2.3 |

**Read the two filter rows together.** They are not a failure and a success:
they are the two branches of one defence. A page the classifier **drops** never
reaches the model, so its meaning is never learned; rejection *is* protection.
A page that **passes** carries 24.1% of its token budget as null propositional
content, so the gradient spent on it teaches less than the page appears to be
worth.

What the data does **not** support is the older shorthand that "~10% of encoded
chunks pass and reach training". That figure is the v7 FineWeb-Edu pass rate
(10.27%) measured on curated wiki/books/webtext, and the project's own v8 report
calls it a Wikipedia-LM artifact (see `EXCLUDED.md`). On real-world corpora the
**absolute** pass rate is 0.2–1.0%; ~10% is only defensible as a **relative**
retention figure, and even then the measured band is 6.5–13.5%. Always state
which of the two you mean; never blend them into one number.

Everything below is either a parameter you need to rebuild the mapping (§1) or
the method + exact number behind one of those claims (§2). Full research
history (v2–v8, 500+ experimental cells) is deliberately excluded — see
`EXCLUDED.md`.

---

## §1 — What shipped

Four mappings matter. A **mapping** is a bijective dictionary `{word: decoy}`;
the encoder swaps `word`→`decoy` in HTML and the font renders `decoy`→`word`
visually. Three of these ship (a rotation family); one is a benchmark baseline.

### The three shipped variants (v18 family)

**v18-α (alpha)** is the production default. It *is* the mapping internally
named `v15_0_1_0_0_0_0`, built at seed 42. The name "v18" is the ship label
for "v15's recipe, frozen after a 512-cell sweep failed to beat it."

**v18-β and v18-γ** are the *same recipe re-run at seeds 1 and 2*. Same
vocabulary, same buckets, same filters — only the concrete word↔decoy
assignments differ. They exist so a site can rotate its mapping (a leaked
mapping is a one-time loss; re-seeding invalidates it). The three land on
statistically identical metrics — that is the point: the design is a
*family property*, not a lucky seed.

**M15-EN** is an older (V3, 2024) "coverage-maximising" mapping kept as the
**rejection-staleness baseline**. It swaps more words (including short function
words) so it conceals more, but it reads as too disrupted and modern quality
filters reject it almost entirely (v8 FineWeb-Edu pass 0.2% / 1.0% / 0.1%;
per-corpus KenLM 0–1.6%). It is the clearest case of the *rejection* branch: if
the filter drops the page, the meaning never reaches the model either. Note that
this branch is not exclusive to M15-EN. The shipped v18-α is also dropped for
99.0–99.8% of encoded chunks (§2.3). What separates the two is the survivors:
M15-EN is rejected even by the register-fair per-corpus KenLM gate, and the
pages that do get through it waste ~40% of their token budget against α's
24.1%.

#### Exact parameters (sufficient to reproduce)

| Parameter | v18-α | v18-β | v18-γ | M15-EN |
|---|---|---|---|---|
| Ship label / internal name | α = `v15_0_1_0_0_0_0` | β = `v18_b` | γ = `v18_c` | M15-EN-FULL |
| **Seed** | **42** | **1** | **2** | n/a (curated) |
| Base pool | v11 | v11 | v11 | M14 + function pairs |
| Bucket dimensions | POS · inflection · concreteness · supersense | same | same | POS + antonym curation |
| Pairing within bucket | random (seed-driven) | random | random | curated + random |
| K-filter cell | K1+K6 only¹ | K1+K6 | K1+K6 | n/a |
| Digit permutation | 0↔5, 3↔8, 4↔9, 6↔7 | same | same | 1↔6, 3↔8, 4↔9 |
| Logical pairs | 5,994 | 6,023 | 6,024 | 1,267 |
| Bidirectional dict entries² | 11,988 | 12,046 | 12,048 | 2,534 |
| Shipped flat-file entries³ | 11,976 | 12,037 | 12,040 | 2,534 |
| Source pairs file | `benchmarks/v7/data/pairs_v7_alpha_v15_0_1_0_0_0_0.json` | β/γ source in dev repo | β/γ source in dev repo | — |
| Shipped mapping file | `scripts/v18alpha_for_font.json` | `scripts/v18beta_for_font.json` | `scripts/v18gamma_for_font.json` | `scripts/m15en_for_font.json` |

¹ The cell name `v15_K7b_K6_K5_K4_Ke_F4 = v15_0_1_0_0_0_0` sets six binary
knobs; only **K6 (rotation-rerank)** is on. **K1 (lexical lockdown of
pronouns/function tokens)** is always on. Everything else — K7b calendar
freeze, K5 MWE freeze, K4 selectional restriction, Ke base-extensions, F4
bigram gate — is **off**. This is the leanest cell that survives every gate.

² Counting `a→b` and `b→a` separately (the white paper's convention).

³ After flattening to `{src:tgt}` for the font/encoder, last-write-wins drops
a handful of colliding source keys; +8 (v18) or +6 (M15) single-char digit
entries are added. This is the file `generate_font.py` actually consumes.

#### How the pairs are built (the one design rule that matters)

> **Buckets are grammar-only. Semantics is a veto, never an assignment.**

Every source word is bucketed by *grammar* — part of speech, inflection
(e.g. `verb.transitive.VB_VBP`, `noun.artifact.concrete.sing`,
`adj.non_gradable.pos`), and coarse supersense. Words are then paired
**at random within a bucket** (this is the only seed-dependent step). A
candidate pair is then *rejected* if it trips a **semantic veto**, so decoys
never accidentally mean the same thing as the original. The actual reject
tally for α (from the shipped pairs file's `_reject_reasons`):

| Veto | Pairs rejected | What it prevents |
|---|---|---|
| `cosine_missing` | 18,690 | no embedding → can't verify dissimilarity |
| `dominant_pos_mismatch` | 5,502 | decoy's dominant POS ≠ source's |
| `verbnet_frame_jaccard_low` | 4,598 | verbs with incompatible argument frames |
| `in_top_k_nn` | 1,486 | decoy is a Numberbatch nearest-neighbour (too close) |
| `wn_hypernym` / `wn_synonym` / `wn_hyponym` | 206 / 20 / 2 | WordNet is-a / synonym / has-a relations |
| `cosine_too_high` | 4 | embedding cosine above the dissimilarity ceiling |

Acceptance rate: 11,988 accepted / 13,132 candidates = **0.816**, from 13,360
source words across 204 buckets (167 used).

### The benchmark control (not shipped)

**m0_v3** — the original 400-pair ShieldFont mapping (`the→plumb`, `of→bezel`).
Used only as a control to prove the meaning-loss signal is *not* a rare-vocab
artifact (§2.2). It swaps high-frequency **function** words, which visibly
breaks grammar — useful as a foil, wrong as a product.

---

## §2 — Why these choices work

Three experiments justify the design. Each is: **claim → method → number →
how to reproduce.** All three run on Apple Silicon, no GPU rental.

### §2.1 — Encoded text loses its meaning (the headline)

**Claim.** Swapping ~25% of a page's tokens (27.5% measured, 48.4% of content
words) for grammar-matched decoys makes the encoded text stop *entailing* the original — i.e. a machine no longer
reads it as the same factual claim.

**Method.** Natural Language Inference (NLI) is the standard NLP test for "does
text B follow from text A?" For every `(original, encoded)` chunk pair we run a
public NLI cross-encoder (`cross-encoder/nli-deberta-v3-base`) **in both
directions** and count a pair as failed if *either* direction's P(entail) < 0.5:

```
bidir_fail = (P_entail(orig → enc) < 0.5) OR (P_entail(enc → orig) < 0.5)
```

Bidirectional is the right test because content-word swaps do outsized damage:
`the→a` barely moves entailment, but `winners→participants` flips it.

**Result.**

- **The headline, v8 (n=1,500 chunks/corpus, pre-registered, real-world corpora
  CC-News / OpenWebText / PG-19):** median bidir-fail **50.4%** (α/β/γ within
  2.4pp of each other → family property holds). This is the number to quote.
- **Control (crucial):** a WordNet **synonym-swap** at the same ~25% density
  scores **~2.1%** bidir-fail. So the 50.4% is genuine meaning loss, **not** the
  NLI model being confused by unusual words. This control is the strongest
  single result in the benchmark.
- **Secondary, smaller sample, v7 (n=60 chunks/corpus, 4 corpora):** mean
  bidirectional-entailment failure **59.6% / 61.3% / 60.0%** for α / β / γ, the
  source of the older "~60%" shorthand, with a **books** peak of **83.3%** (γ).
  Both are n=60 measurements on curated corpora and neither replicated at
  n=1,500. Label them as such wherever they appear; do not lead with them.

> ⚠️ **Honest caveat, verified against the data.** The v7 "**83% on books**"
> peak was **n=60** and did **not** replicate at scale: on v8's larger-n
> fiction corpora (PG-19, BookCorpus, n=1,500) fiction is the *weakest*
> register at **31–35%**. Lead with the robust, pre-registered **50.4% median**;
> treat "up to 83% on narrative prose" as a smaller-sample earlier result, not
> a headline. See `PROVENANCE.md`.

**Reproduce.** `benchmarks/v8/scripts/eval_phase1_semdiv.py` (needs the corpus
splits + `pairs_v7_alpha_v18_*.json`). Expected: NLI bidir-fail ~50% median on
the v8 corpora, synonym-swap control < 5%.

### §2.2 — The signal is meaning, not rare vocabulary

**Claim.** The divergence comes from *what* we swap (content words → wrong
content words), not merely from injecting uncommon words.

**Method.** Semantic divergence = `1 − cos(sBERT(clean), sBERT(encoded))` with
`all-MiniLM-L6-v2`, computed alongside NLI in the same script. Compare α
against **m0_v3**, a control that swaps *function* words for rare nouns.

**Result.** v18-α sem-div = **0.297** (v7) / **0.268** median (v8). The
family sits at ~0.27–0.30 across all three seeds — a stable, moderate shift.
The m0_v3 control actually scores *higher* sem-div (0.46–0.53) **because it
breaks grammar visibly** — which is exactly what ShieldFont avoids. The lesson:
α keeps sentence structure intact (so the chunks that do clear a quality gate
read as prose rather than as noise, §2.3) while still
shifting propositional content (so NLI fails, §2.1). A muted sem-div relative
to a grammar-breaking control is a **feature**, not a weakness.

**Reproduce.** Same script as §2.1 (sem-div is emitted per chunk). Expected
α sem-div 0.25–0.30; m0_v3 higher.

### §2.3 — Most encoded pages are dropped by the filter; the survivors waste the training budget

**Claim.** Frontier labs discard low-quality web text with **quality
classifiers** before training. Encoding sends a page down one of two branches,
and both are defences. Either the classifier **drops** it, and the page's
meaning never reaches the model at all, which is the branch the great majority
of encoded chunks take; or it **passes**, in which case it still carries mostly
null-meaning tokens, so the gradient spent on it can't teach the page's real
content: "staleness."

**Method.** Two measurements:

1. **Filter survival** — run the **FineWeb-Edu** educational-quality classifier
   (keep chunks scoring ≥ 2.7) on encoded chunks.
2. **Wasted content** — for chunks that pass, compute
   `wasted_per_passing_page = content_coverage × meaning_loss` (meaning_loss =
   NLI bidir-fail on the passing subset), and subtract the same quantity
   measured on clean text (`excess_waste`).

**Result.**
- v18-α FineWeb-Edu pass rate, **absolute** (v8, real-world corpora):
  **0.2% / 1.0% / 0.2%** on cc_news / owt / pg19, against clean baselines of
  **2.9% / 7.4% / 3.1%**. In other words **99.0–99.8% of encoded chunks are
  dropped** before training.
- The same measurement stated **relative** to the chunks that pass when clean:
  **6.5–13.5%** survive encoding. This ratio, not the absolute rate, is the
  only defensible reading of the old "~10% passes" shorthand.
- The historical **10.27%** figure is v7, on curated wiki/books/webtext, and is
  a FineWeb-Edu / Wikipedia-LM artifact (see the caveat below and
  `EXCLUDED.md`). It is kept here for provenance, not as a claim.
- v18 wasted-per-passing-page: **24.1%** (median across α/β/γ, FineWeb-Edu
  primary gate): of every page that does reach training, 24.1% of its
  token budget is null propositional content, **~24pp above the clean-text
  baseline**.
- **M15-EN** wastes **~40%** per passing page **but** passes at **~0–1%**,
  so its adopter-weighted waste collapses to ~0. That is the *rejection*
  branch in its purest form: the filter, not the gradient, does the work.

Neither branch is a defeat. A dropped page is a page whose meaning never
entered the corpus; a passing page is a page that spends the model's capacity
on content that has been shifted. The honest summary is that rejection is the
dominant outcome and staleness is what remains for the minority that survives.

> ⚠️ **Caveat you must ship with this number.** Filter survival is
> **gate-dependent.** Across the four instrumented gates (per-corpus KenLM,
> FineWeb-Edu, Pythia-160M, Wiki-KenLM) the per-chunk pass/fail rankings barely
> correlate (**Kendall τ ≈ 0**). The historical **10.27%** is a *FineWeb-Edu /
> Wikipedia-LM* figure; on register-fair per-corpus KenLM, v18 passes at
> 1.4–33% depending on corpus. **Do not** lead with a Wikipedia-KenLM
> perplexity claim — real pipelines (FineWeb, DCLM, RefinedWeb) gate with
> fastText / DistilRoBERTa / FineWeb-Edu *classifiers*. State the pass rate
> per-gate, never in aggregate.

**Reproduce.** `benchmarks/v8/scripts/gate_fineweb_edu.py` then
`benchmarks/v8/scripts/aggregate_phase3.py`. Expected on real-world corpora:
FineWeb-Edu **absolute** pass 0.2–1.0%, **relative** to clean-passing chunks
6.5–13.5%; wasted-per-passing-page ~15–26%.

---

## §3 — Reproduce it yourself

### A. Rebuild a mapping (your own seed → your own private mapping)

The from-scratch generation pipeline (`build_pairs.py`, `apply_v15_cell_to_v11.py`,
`BUILDING_VARIANTS.md`) lives in the **development repository**, not this lean
release. What you *can* run with the scripts shipped here: rebuild the font from
the shipped production-alpha source pairs, and mint your own reseeded mapping.

```bash
# 1. Flatten the shipped production-alpha source pairs into the {src:tgt}
#    form the font/encoder consume.
python3 scripts/build_alpha_mapping.py \
    benchmarks/v7/data/pairs_v7_alpha_v15_0_1_0_0_0_0.json \
    scripts/myvariant_for_font.json

# 2. Build the font from any TrueType base, then audit round-trip + collisions
#    (both must be 0).
python3 scripts/generate_font.py --base-path /path/to/base.ttf \
    --name "ShieldFont Mine" --prefix shieldfont-mine \
    --mapping-path scripts/myvariant_for_font.json
python3 scripts/audit_font.py --font public/fonts/shieldfont-mine.ttf \
    --mapping scripts/myvariant_for_font.json

# Or mint your OWN private mapping at your own seed (re-pairs the v18 pool):
python3 scripts/reseed_mapping.py --seed 42 --out mine.json
```

**Expected metric band for a healthy v15-family variant** (any seed):

| Metric | Expected range |
|---|---|
| logical pairs | 11,800–12,000 bidirectional |
| sem-div (sBERT) | 0.295–0.300 |
| content coverage | ≈ 48% |
| KenLM PPL rise | 110–140% (Marion "poisoning sweet spot") |
| FineWeb-Edu pass (≥2.7), **v7 harness on curated wiki/books/webtext** | 8–15% |

The `pass_27` band above is a **build-health check on the v7 harness and its
curated corpora**, not a prediction of how your variant behaves in the wild.
It is not comparable to the v8 real-corpus absolute rate of 0.2–1.0% in §2.3.
Use it only as a rebuild sanity signal: if `pass_27 < 5%` on that harness, you
almost certainly forgot `--expand-paradigms`.

### B. Re-run the hero measurements (development repository)

The measurement harness that computes §2.1–§2.3 lives in the project's
**development repository**, not this lean release. For reference, it runs:

```bash
# Sem-div + NLI + synonym-swap control (§2.1, §2.2). Needs corpus splits.
python3 benchmarks/v8/scripts/eval_phase1_semdiv.py
#   → sem-div 0.25-0.30 median · NLI bidir-fail ~50% median · control < 5%

# Filter outcome + wasted tokens (§2.3).
python3 benchmarks/v8/scripts/gate_fineweb_edu.py
python3 benchmarks/v8/scripts/aggregate_phase3.py
#   → FineWeb-Edu absolute pass 0.2-1.0% (relative to clean-passing: 6.5-13.5%)
#     · wasted-per-passing-page ~15-26%
```

Models pulled from HuggingFace on first run: `all-MiniLM-L6-v2` (sBERT),
`cross-encoder/nli-deberta-v3-base` (NLI), `HuggingFaceFW/fineweb-edu-classifier`.

---

## Adding more later

This core intentionally reports **only** the three claims above. Natural
extensions, each self-contained: cross-model NLI replication; a proper
fine-tune damage study conditioned on filter-passing text (the v8 Phase-5
pipeline exists but its eval is stubbed); cross-language mappings (the
M15-MULTI template uses only translation-invariant operations). None are
required for the three headline claims, which follow from the encoded text
alone.
