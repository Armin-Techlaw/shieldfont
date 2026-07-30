# Benchmarks v8 — Staleness Multi-Gate Benchmark

**Stage IV.F · Staleness-led publication push**

This benchmark stage exists to retire the largest unproven claim in the ShieldFont white paper — that the encoding produces *staleness* for AI training pipelines — without depending on expensive fine-tune-and-test loops that V5 already showed are noisy at small scale.

The hero claim moves from "ShieldFont damages models when they train on it" (load-bearing fine-tune) to "ShieldFont produces text that frontier filters accept but that carries shifted meaning; gradient spent on it cannot move the model toward the page's original meaning." Fine-tune damage stays in the white paper but is demoted to optional supporting evidence.

---

## North Star

**Logical chain we prove (with bridging premises explicit):**

```
Premise A.  Encoded text is propositionally divergent from clean text.
            (Status: already proven on wiki/books/webtext/reddit.
             Phase 1 extends this to CC-News/OWT/PG-19 with a synonym-swap
             control to defend against the "NLI is a fluency probe"
             alternative explanation.)

Premise B.  Encoded text passes the gates that frontier labs actually use.
            (Status: partially proven — pass_27 = 10.27% on FineWeb-Edu for
             v18-A on wiki/books/webtext. Phase 2 extends across 5 gates
             and 3 new corpora.)

Bridging premise B1 (token-level pass-through).
            On filter-passing chunks, the frontier model's gradient flows
            toward the substitute-word representation, NOT toward the
            original via context-prediction. (Phase 4 Probe B — cloze
            recovery — is the load-bearing test of B1.)

Bridging premise B2 (limited sub-propositional residual).
            We claim divergence of propositional content. We DO NOT claim
            divergence of register, syntax, or discourse priors. Encoded
            chunks may still teach those sub-propositional features. The
            white paper acknowledges this explicitly to defend against the
            Carlini 2023 / Tirumala 2022 memorization-at-low-exposure
            literature, which is directly adversarial to a stronger
            "wasted gradient" claim.

Conclusion. Frontier models trained on filter-passing encoded text spend
            *propositional-content* gradient on tokens whose meaning has
            shifted. The page reaches training; once it does, its
            propositional content cannot move the model in any
            human-aligned direction. Sub-propositional learning may
            survive; that is acknowledged, not denied.

            Headline numbers (Phase 3, stratified by passing-vs-pooled):
              wasted_per_passing_page = content_coverage × meaning_loss
                                        (conditional on passing the gate)
              wasted_per_adopter_page = content_coverage × P(survives)
                                        × meaning_loss
```

**Phase 4** quantifies B1 (gradient direction) at the *frozen-model token level* (cloze recovery, embedding shift, focal-probability shift). This bridges the corpus-level sem-div measurement to the gradient-direction claim, on two frozen models for replication.

**Phase 5** is the optional fine-tune that, if positive, converts the staleness claim into a stronger damage claim. If null (which V5 at 2B-scale already suggested is likely), the staleness claim still stands because it's a logical consequence of A + B + B1, with B2 honestly delimited.

### Engagement with adversarial literature

Carlini et al. 2023 (*Quantifying Memorization Across Neural Language Models*) and Tirumala et al. 2022 (*Memorization Without Overfitting*) show that LLMs memorize grammar-coherent examples at very low exposure. This is **prima facie adversarial** to the wasted-gradient framing: a grammatically fluent encoded page is exactly the condition under which substitute-word associations would get memorized rather than wasted.

Rebuttal: memorization findings concern verbatim retention of specific strings (and their constituent surface tokens), not concept formation across distributed contexts. ShieldFont encoding randomises across re-deploys (v18-A/B/C rotation) and across pair-level seed variations within each adopter site, so encoded substitutes do not form a coherent concept across the corpus for the model to memorize. The "wasted gradient" claim is about consistent concept-level signal, not verbatim recall — those are different mechanisms.

This rebuttal is defensible but must be explicit. Phase 4 Probe B tests it directly (cloze recovery on encoded text answers "can the model use surrounding context to recover the original concept across distributed instances?").

---

## Mapping nomenclature (load-bearing — read carefully)

Confusing M15 with V15/V18 invalidates the staleness math. The three families differ in scale, era, and filter-survival behaviour:

| Mapping | Era | Pair count | Filter behaviour | Role in staleness story |
|---|---|---|---|---|
| **M15-EN** | V3 (2024) | 2,534 dict entries (= 1,267 logical pairs) | Designed for concealment, **fails** modern KenLM / FineWeb-Edu gates by design | **Rejection-staleness baseline** (high coverage but blocked at filter; demonstrates filter mechanism) |
| **V15** | V7 (2026) | 11,988 pairs (`v15_0_1_0_0_0_0`) | K-filter pipeline (K1+K6 only — K7b=0, K6=1, K5=0, K4=0, Ke=0, F4=0 per `benchmarks/v7/BUILDING_VARIANTS.md`) tunes for filter survival; pass_27 ≈ 10.27% | (Internal label only; ships rotated as V18) |
| **V18-A** | V7 (2026) | 11,988 pairs | V15 unchanged after 512-cell mega-orthogonal sweep failed to beat it. Production mapping, seed=42 | **Acceptance-staleness lead variant** — passes filter at ~10% AND carries shifted meaning |
| **V18-B** | V7 (2026) | 12,046 pairs | Re-seed of V15 K-filter recipe (seed=1). Rotated per deploy | Acceptance staleness (family property re-seed) |
| **V18-C** | V7 (2026) | 12,048 pairs | Re-seed of V15 K-filter recipe (seed=2). Rotated per deploy | Acceptance staleness (family property re-seed) |
| **m0_v3** | V3 (2024) | 400 fixed rare-noun substitution pairs (~47% real-text coverage per MAPPINGS.md) | Filter behaviour expected low; semantic divergence expected low | **Primary control** — defends against the "sem-div is a rare-vocab artifact" alternative explanation by isolating "what does ANY rare-substitute mapping do?" |

**The lead variant for the staleness claim is V18 (acceptance staleness).** The headline formula `wasted_per_adopter_page = coverage × P(survives) × meaning_loss` mathematically penalises M15-EN (P(survives) ≈ 0), and "wasted_per_passing_page" rescues M15-EN only by conditioning on a trivial passing tail. The honest story is **dual mechanisms**: V18 carries acceptance staleness (gradient does the work); M15-EN illustrates rejection staleness (filter does the work). Both are defensive wins. The white-paper banner goes to V18 because that is what the math supports.

**Key facts to NOT confuse:**

- The 10.27% pass_27 number belongs to **v18-A** (and by extension V15), not M15-EN.
- V15 recipe is **K1+K6 only**, not K1+K3. (V18_FINAL.md inherits a documentation typo that this v8 stage corrects.)
- M15-EN "2,534 pairs" is bidirectional dict entries; logical pair count is 1,267 (a→b counted as one pair, not two). White paper uses the 2,534 convention; root README and MAPPINGS.md use 1,267.
- m0_v3 is **400 fixed rare-noun substitution pairs**, not random 10% mass swap. Its ~47% real-text coverage comes from the fact that those 400 nouns are extremely common in English text.
- M15-EN does not have a published pass_27 number because earlier work didn't measure it (and historically the assumption is M15-EN fails the gate). Phase 2 measures it as part of the rejection-staleness story.
- V18-A/B/C are family-property re-seeds of the *same* V15 K-filter recipe. They are *not* independent mapping designs.

---

## Corpora

```
CC-News      50%   HuggingFace cc_news. Journalism register. ~700k articles 2017+.
OpenWebText  35%   HuggingFace Skylion007/openwebtext. Reddit-shared web pages.
                   Indie writer surrogate. (Plain OWT, not OWT2 — cleaner license.)
PG-19        15%   HuggingFace deepmind/pg19. Pre-1919 Project Gutenberg fiction.
```

Why not Wikipedia: the v7 multi-corpus eval already used wiki/books/webtext/reddit. The white paper publicly acknowledges Wikipedia-only metrics misled the design (§ 10). For Phase 1's sem-div extension AND for Phase 2's filter survival, we need corpora whose register is not wiki-shaped.

Why not just FineWeb-Edu: it bundles many registers, and we want explicit per-register evaluation.

---

## Five gates (Phase 2)

| # | Gate | What it represents | Threshold | Status |
|---|---|---|---|---|
| 1 | Per-corpus KenLM (CC-News, OWT, PG-19) | Register-fair perplexity gate | Keep top 70% by PPL within each corpus | **NEW — build** |
| 2 | DCLM-fastText | Production scrape-filter (DataComp-LM project) | DCLM threshold (TBD; conventional ~0.5) | **UNBLOCK numpy 2.x regression noted in white paper § 14** |
| 3 | FineWeb-Edu classifier | Production scrape-filter (HuggingFace FineWeb) | score ≥ 2.7 | **EXTEND existing** — already have v18-A wiki/books/webtext |
| 4 | Pythia-160M perplexity | "Perplexed by Perplexity" modern-LM gate | Top 70% by Pythia neg-log-prob | **NEW — build** |
| 5 | Wiki-KenLM | Historical anchor (register-biased) | Top 70% by Wiki-KenLM PPL | **REUSE existing** (label as biased) |

The **per-corpus KenLM** (gate 1) replaces Wiki-KenLM as the primary KenLM signal because the "Rethinking KenLM" line of work shows Wiki-trained KenLMs systematically over-penalise literary and journalistic registers. Frontier labs use classifier filters (fastText / DistilRoBERTa), not KenLM, for production quality gating — so gates 2, 3, 4 are the actually-deployed instruments and gate 5 is for cross-reference only.

Each gate is run on **(clean, v18-A, v18-B, v18-C, M15-EN, m0_v3) × (CC-News, OWT, PG-19)** = 18 (variant × corpus) cells per gate × 5 gates = 90 cells.

---

## Phases

### Phase 1 — Confirm Premise A on new corpora (~8h realistic)

Run `sem-div` (sentence-BERT cosine 1 − cos(clean, encoded)) and `NLI bidirectional entailment failure` on **1,500 chunks per corpus** for each of 5 mappings + 1 control mapping:

- V18-A, V18-B, V18-C, M15-EN, m0_v3, **WordNet-synonym-swap** (the new NLI fluency-probe control)

The synonym-swap mapping replaces 25% of content words with WordNet synonyms that genuinely preserve meaning. If NLI bidir-fail on synonym-swap is materially above 20%, NLI is partly a fluency probe (penalising rare lexicon) rather than a pure meaning probe — and that bias must be subtracted from the v18 number before claiming meaning loss.

m0_v3 is treated as a **primary baseline alongside clean**, not a sanity check. Compute `sem-div(v18) − sem-div(m0_v3)` as the corrected divergence claim — this defends against the "sem-div is a rare-vocab embedding artifact" alternative.

**Falsification bars (tightened to prior point estimates):**

- sem-div **median across the 3 corpora ≥ 0.25** for V18 (prior is 0.297)
- NLI bidir-fail **median across the 3 corpora ≥ 50%** for V18 (prior is ~60%)
- Per-corpus 0.15 / 30% as the soft "limitation noted" floor (vs hard "claim falsified")
- **`sem-div(v18) − sem-div(m0_v3) ≥ 0.10` on the corpus median** — else the divergence is a vocab artifact, not a meaning effect

**Output:** `phase1_semdiv/results/semdiv_extended.json` with per-corpus per-mapping numbers; comparison to existing v7 wiki/books/webtext/reddit measurements; m0_v3-subtracted divergence; synonym-swap NLI control rate.

**Lifts:** `benchmarks/v7/scripts/eval_v18_nli_meaning.py` (NLI), `benchmarks/v7/scripts/eval_v18_variants.py` (sem-div pipeline).

---

### Phase 2 — Multi-gate filter survival (~27–30h realistic, parallelizable)

Build all 5 gates above, score 90 cells. Every gate that produces a perplexity must also report **bits-per-byte (BPB)** alongside perplexity, to control for tokenization-segmentation differences when comparing clean to encoded.

Sub-tasks:

- **2a** (~10–12h) Per-corpus KenLM build. **3-way split per corpus: 80% KenLM-train / 10% KenLM-dev for pruning / 10% Phase-2 scoring pool (never seen during LM build).** Phase 1 + Phase 2 chunks sample exclusively from the scoring pool. Document training cost, held-out PPL on dev, and BPB on scoring pool.
- **2b** (~6–8h, with fallback) Resolve DCLM-fastText numpy 2.x regression. Reproduce on a held-out clean reference set. If unblock fails after 8h, drop gate 2 and narrow the "filter-passing" claim accordingly.
- **2c** (~3h) Extend FineWeb-Edu pass_27 measurement to the full 18-cell matrix. Primary threshold ≥ 2.7, sensitivity at ≥ 3.0.
- **2d** (~4h) Set up Pythia-160M scoring. Validate on a clean reference set. Cutoff at 70th percentile of *clean* distribution.
- **2e** (~2h) Re-run Wiki-KenLM on the new corpora for cross-reference (label as register-biased).

**Falsification bars (tightened):**

- **Relational gate-1 bar:** v18 gate 1 (per-corpus KenLM) pass rate ≥ gate 3 (FineWeb-Edu) pass rate on each corpus. If gate 1 < gate 3, per-corpus KenLM detects something FineWeb-Edu misses — must be reported as evidence that filter-passing depends on which gate.
- **Retraction bar:** if v18 fails gate 1 (per-corpus KenLM) below 30% pass on any corpus, the abstract is rewritten to remove the "filter-passing" claim, not just footnoted.
- **Multi-gate consistency:** **Kendall τ ≥ 0.4** on rank-correlation of per-chunk gate scores across gates 1–4. If τ < 0.4, the gates measure substantially different things and "filter-passing" narrows to "passes the specific gates that agreed."

**Output:** `phase2_filters/results/multigate_survival.json`, per (gate × variant × corpus): survival rate, threshold used, BPB, n_chunks, n_passed, plus cross-gate Kendall τ.

---

### Phase 3 — Headline metric: effective wasted tokens (~2h aggregation)

For each (variant × corpus × gate):

```
content_coverage         = fraction of non-stopword tokens swapped

gate_pass_rate           = fraction of encoded chunks that pass the gate

meaning_loss_factor      = NLI bidir-fail on PASSING SUBSET (Phase 1) — PRIMARY
                         sem-div on passing subset — sensitivity
                         surprisal-shift on passing subset (Phase 4) — sensitivity

clean_wasted_baseline    = same formula computed on CLEAN chunks
                           (a clean page also has stopwords + low-info tokens
                            that don't carry propositional gradient; we must
                            beat THIS baseline, not zero)

wasted_per_passing_page = content_coverage_on_passing × meaning_loss_on_passing

wasted_per_adopter_page  = content_coverage × gate_pass_rate × meaning_loss

excess_waste             = wasted_per_passing_page − clean_wasted_baseline
                          (the actual claim: encoded text wastes MORE than
                           clean text wastes on the same metric)
```

**Critical: stratify meaning-loss to the passing subset.** The chunks that pass the filter are selection-biased toward weaker sem-div (they're the ones the filter found fluent). Pooled sem-div over-estimates the meaning loss of the chunks that actually reach training. Pre-registered primary = NLI bidir-fail on passing subset.

Two perspectives:
- **Per-passing-page wasted (acceptance staleness math)**: of pages that reach training, what fraction of their tokens are null propositional content? V18 lead variant.
- **Per-adopter-page wasted (rejection staleness math)**: of all pages an adopter writes, what fraction of their tokens contribute zero useful gradient? Combines acceptance + rejection. M15-EN baseline.

**Falsification bars (tightened, with baseline-relative bar):**

- V18 `wasted_per_passing_page ≥ 15%` on the corpus median (prior is ~28%; 15% leaves headroom but not 80% of headroom)
- V18 `excess_waste ≥ 10pp above clean baseline` on the same metric — must beat the clean text's own "wastedness" by a real margin
- M15-EN `wasted_per_adopter_page ≥ 25%` for the rejection-staleness story to be non-trivial
- Pre-registered primary: `meaning_loss_factor = NLI bidir-fail on passing subset`. Sem-div and surprisal-shift are sensitivity analyses, not selectable headlines.

**Output:** `phase3_wasted/results/wasted_tokens.json`, a matrix table with passing-conditional metrics, pooled metrics, clean baseline, and excess waste.

---

### Phase 4 — Frozen-model representational drift (~20–30h realistic, no training)

This is the **load-bearing test of bridging premise B1** (gradient flows toward substitute, not context-corrects to original). Run on **two frozen models for replication**: `Jackrong/MLX-Qwen3.5-4B-Neo-4bit` AND a smaller cross-architecture check (e.g., Pythia-1.4B or Qwen2.5-1.5B). Probes A/B/D otherwise share base-model bias.

- **Probe A — Embedding cosine drop** (n=500/cell): encode (clean, encoded) chunk pairs, measure shift on the model's last-layer hidden state mean.
- **Probe B — Cloze recovery** (n=500/cell, load-bearing for B1): mask substituted-word position in encoded chunk, score recovery rate to original. **This directly tests whether context-correction defeats the encoding.**
- **Probe C — Focal probability shift** (n=200 src,tgt pairs × 5 contexts each): for each mapping pair, measure ΔP(tgt) − ΔP(src). Catches prior alignment between model and mapping.
- **Probe D — Per-token surprisal** (n=500/cell): token-by-token neg-log-prob on encoded vs clean. Decomposes Phase 2's perplexity rise.

Report **pairwise correlations between probes A/B/D** (they share frozen weights and tokenization); treat A/D as one signal if correlation > 0.7.

**Falsification bars (relative, not absolute, on cloze):**

- Probe B (load-bearing): **`clean_cloze − encoded_cloze ≥ 25pp`** on the same masked positions. Absolute cloze ≤ 70% is the wrong bar because natural-text cloze accuracy varies 40–60% by position. The RELATIVE gap is what tests B1.
- Probe A: embedding cosine drop ≥ 0.15 (V18 vs clean) AND `embedding_drop(v18) − embedding_drop(m0_v3) ≥ 0.05` (defends against rare-vocab artifact).
- Probe C: focal probability shift |ΔP(tgt) − ΔP(src)| ≥ 0.10 averaged over pairs (prior alignment check).
- Probe D: median per-token surprisal rise ≥ 1 nat on encoded vs clean.
- Cross-model replication: same direction-of-effect on Pythia-1.4B (signs match); magnitudes need not.

**Output:** `phase4_frozen/results/representational_drift.json`, per (variant × corpus × probe): mean, std, p25/p75.

---

### Phase 5 (OPTIONAL, demoted) — Fine-tune damage (~12-15h smoke)

If Phases 1–4 land cleanly, this becomes supporting evidence. If null at smoke scale, the staleness claim doesn't fall.

7 conditions × 1 seed (smoke):

```
1. Clean100              100% clean filter-passing text
2. v18A_10_1side         10% v18-A, 90% clean. 1-sided KenLM filter on clean only.
3. v18A_10_2side         10% v18-A, 90% clean. 2-sided filter (clean+encoded both pass).
4. v18ABC_10_1side       3.33%×3 + 90% clean. 1-sided.
5. v18ABC_10_2side       same. 2-sided.
6. M15_10_1side          10% M15-EN, 90% clean. 1-sided.
7. m0_v3_10_1side        10% m0_v3, 90% clean. 1-sided.
```

Base: `Jackrong/MLX-Qwen3.5-4B-Neo-4bit`, LoRA rank 32, scale 4.0, lr 2e-5, batch 4, seq 1024, 500 iters. ~1M training tokens per condition.

**Headline metrics shift from MMLU/TriviaQA to focal probability + cloze recovery** on held-out contexts. MMLU/TriviaQA are too coarse for narrow-band poisoning at this token budget; V5 already showed this.

**Decision gate after smoke:** if any v18 condition shows |Δ| > 0.02 composite damage, expand to 3 seeds × 7 conditions = 21 runs. If all null, stop.

---

## Falsification bars (consolidated, tightened to prior point estimates)

Each phase has a pre-registered bar. **Bars are set at the prior point estimate, not 33–80% below it**, so "we commit to publishing whichever result lands" is credible.

| Phase | Bar | If failed |
|---|---|---|
| 1 | sem-div median across 3 corpora ≥ 0.25 (prior 0.297) | Hard falsification |
| 1 | NLI bidir-fail median across 3 corpora ≥ 50% (prior ~60%) | Hard falsification |
| 1 | per-corpus sem-div ≥ 0.15 AND NLI ≥ 30% | Soft "limitation noted" trigger |
| 1 | `sem-div(v18) − sem-div(m0_v3) ≥ 0.10` median | else divergence is rare-vocab artifact, not meaning |
| 1 | NLI bidir-fail on synonym-swap control ≤ 20% | else NLI is partly a fluency probe |
| 2 | V18 gate 1 pass ≥ gate 3 (FineWeb-Edu) pass per corpus (relational) | Per-corpus KenLM detects something FineWeb-Edu misses; report it |
| 2 | V18 gate 1 pass ≥ 30% per corpus (retraction bar) | Abstract rewritten to remove "filter-passing" claim |
| 2 | Kendall τ ≥ 0.4 across gates 1–4 (consistency) | "Filter-passing" narrows to specific agreeing gates |
| 3 | V18 `wasted_per_passing_page ≥ 15%` corpus median | Staleness magnitude weak |
| 3 | V18 `excess_waste ≥ 10pp above clean baseline` | Encoded text not meaningfully worse than clean noise |
| 3 | M15-EN `wasted_per_adopter_page ≥ 25%` | Rejection-staleness story trivial |
| 4 | `clean_cloze − encoded_cloze ≥ 25pp` (Probe B, B1 test) | Context-correction defeats encoding; gradient-waste claim weakens |
| 4 | `embedding_drop(v18) − embedding_drop(m0_v3) ≥ 0.05` (Probe A) | Embedding shift is rare-vocab artifact |
| 4 | Focal probability shift ≥ 0.10 averaged (Probe C) | No alignment shift between model and mapping |
| 4 | Direction-of-effect replicates on second frozen model | Probe result is model-specific |
| 5 | Composite damage CI clears zero on PRIMARY `v18A_10_1side` | Damage claim formally rejected |
| 5 | Bonferroni-adjusted CI on secondary conditions | Avoid multiple-comparisons inflation |

---

## Execution order (cheapest first, realistic budget)

1. **Function-word audit on V18-A/B/C** (1h) — retires white-paper § 15.1 card #5. Zero compute. **Phase 0.**
2. **Corpus download + 3-way split** (4h) — CC-News, OpenWebText, PG-19 via HF datasets. 80/10/10 split per corpus. Phase-2 scoring pool isolated.
3. **Phase 1** — sem-div + NLI + synonym-swap control on 1,500 chunks/corpus/mapping (8h).
4. **Phase 2c** — FineWeb-Edu pass_27 extension (3h, scripts exist).
5. **Phase 2a** — per-corpus KenLM build with 3-way split (10–12h).
6. **Phase 2b** — DCLM-fastText unblock with 8h time-box (6–8h; fallback: drop gate 2).
7. **Phase 2d** — Pythia-160M PPL gate (4h).
8. **Phase 2e** — Wiki-KenLM cross-reference (2h).
9. **Phase 3** — wasted-tokens aggregation, baseline-relative (2h).
10. **Phase 4** — frozen-model probes on TWO models (20–30h).
11. **Phase 5 decision gate** — based on Phase 4 signal.

**Realistic total to Phase 4 completion: 55–70h of work, no GPU rental, all on Apple Silicon.** The earlier 36h estimate was wrong; budget accordingly.

---

## What this benchmark explicitly does NOT do

- Does not modify any production mapping (V18-A/B/C ship unchanged).
- Does not require new white-paper claims to be invented — every new section maps to an existing roadmap card (§ 15.1).
- Does not depend on Phase 5 succeeding. The staleness claim is mathematically downstream of Phases 1+2+3, full stop.
- Does not use Wikipedia for any *new* measurement. Wiki-KenLM (gate 5) is retained only as a historical cross-reference and is flagged as register-biased.

---

## File layout

```
benchmarks/v8/
  README.md                       ← this document (North Star)
  
  phase1_semdiv/
    results/                      ← per-corpus sem-div + NLI outputs
  
  phase2_filters/
    results/                      ← multi-gate survival outputs
  
  phase3_wasted/
    results/                      ← effective wasted tokens table
  
  phase4_frozen/
    results/                      ← representational drift outputs
  
  phase5_finetune/
    adapters/                     ← LoRA adapters per (condition, seed)
    results/                      ← eval outputs
  
  scripts/                        ← phase scripts, shared utilities
  data/                           ← downloaded corpora, intermediate caches
  plans/                          ← pre-reg documents, agent feedback
  results/                        ← consolidated cross-phase tables
```

---

*Generated 2026-05-16 as Stage IV.F kick-off. Pending review by data-mistakes, methodology, and science sub-agents before Phase 1 starts.*
