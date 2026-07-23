# PROVENANCE — every number in README.md → its source

All paths are relative to the project's development repository root.
**VERIFIED** = the exact value was read out of that source file.
**ASSUMED** = taken from background notes or the white paper prose
without an independent computed source in the benchmark data.

Legend for JSON: `file › key.path` means the value lives at that key.

---

## §1 — Shipped-mapping parameters

| # | README claim | Source | Status |
|---|---|---|---|
| 1 | α = internal `v15_0_1_0_0_0_0`, seed **42** | `benchmarks/v7/data/pairs_v7_alpha_v15_0_1_0_0_0_0.json › _seed` = 42; `_v15_cell` = "v15_0_1_0_0_0_0" | VERIFIED |
| 2 | β seed **1**, γ seed **2** | `benchmarks/v7/data/pairs_v7_alpha_v18_b.json › _seed` = 1; `…_v18_c.json › _seed` = 2. Also `benchmarks/v7/BUILDING_VARIANTS.md:14-17` ("seeds 42 / 1 / 2") | VERIFIED |
| 3 | α is *pair-identical* to `v18_a` | Computed: src→tgt set of both files identical, symmetric-difference = 0 (both 11,988 `all_pairs`). NB the two files are **not byte-identical** (differ in metadata/serialization); `BUILDING_VARIANTS.md:182` overstates "byte-identical" | VERIFIED (+flag) |
| 4 | K-cell = **K1+K6 only**; six-knob decoder | `benchmarks/v7/data/…v15_0_1_0_0_0_0.json › _v15_factors` = {K7b_freeze:0, K6_rotation:1, K5_top_n:0, K4_selectional:0, K_base_ext:0, F4_bigram_gate:0}. Decoder text: `benchmarks/v7/BUILDING_VARIANTS.md:26-41`; K1 always-on stated `:37` | VERIFIED |
| 5 | Base pool = **v11** | `…v15_0_1_0_0_0_0.json › _v15_base` = "v11"; `_clustering.input` = "v11" | VERIFIED |
| 6 | Bucket dims = POS · inflection · concreteness · supersense | `benchmarks/v7/BUILDING_VARIANTS.md:149` (Phase 1B "bucket every surface form by (POS, inflection, concreteness, supersense)"); bucket names confirmed in `…v15_0_1_0_0_0_0.json › buckets` (e.g. `verb.transitive.VB_VBP`, `noun.artifact.concrete.sing`, `adj.non_gradable.pos`, `adv.adv.all`) | VERIFIED |
| 7 | Pairing = **random within bucket**, only seed-dependent step | `benchmarks/v7/BUILDING_VARIANTS.md:150,155-158` (Phase 1C "Random pairwise matching within bucket … Only Phase 1C … consume the seed") | VERIFIED |
| 8 | Semantic vetoes + exact reject tallies | `…v15_0_1_0_0_0_0.json › _reject_reasons` = {cosine_missing:18690, dominant_pos_mismatch:5502, verbnet_frame_jaccard_low:4598, in_top_k_nn:1486, wn_hypernym:206, wn_synonym:20, cosine_too_high:4, wn_hyponym:2} | VERIFIED |
| 9 | Source words **13,360**; buckets **204** (167 used); candidates **13,132**; accepted **11,988**; acceptance **0.816** | `…v15_0_1_0_0_0_0.json › _n_source_words / _n_buckets / _n_buckets_used / _n_candidate_pairs / _n_accepted_pairs / _acceptance_rate` | VERIFIED |
| 10 | α digit permutation 0↔5, 3↔8, 4↔9, 6↔7 | `…v15_0_1_0_0_0_0.json › _digit_permutation` = {"0":"5","5":"0","3":"8","8":"3","4":"9","9":"4","6":"7","7":"6"} | VERIFIED |
| 11 | Clustering added **1,456** pairs | `…v15_0_1_0_0_0_0.json › _clustering` = {input:"v11", added:1456, added_clusters:1456} | VERIFIED |
| 12 | Logical pairs 5,994 / 6,023 / 6,024 (α/β/γ) | `benchmarks/v8/results/INTERIM_REPORT.md:9-11` (Phase-0 "Unique pairs" 5,994 / 6,023 / 6,024) | VERIFIED |
| 13 | Bidirectional entries 11,988 / 12,046 / 12,048 | `benchmarks/v7/results/v18_variants_eval.json › [].n_pairs`; also `benchmarks/v8/README.md:78-80` | VERIFIED |
| 14 | Shipped flat-file entries 11,976 / 12,037 / 12,040 (v18) and 2,534 (M15) | Computed from `scripts/v18alpha_for_font.json` (11,976 = 11,968 words + 8 digits), `v18beta_for_font.json` (12,037), `v18gamma_for_font.json` (12,040), `m15en_for_font.json` (2,534 = 2,528 words + 6 digits) | VERIFIED |
| 15 | Flattening drops collisions (last-write-wins) + adds digit entries | `scripts/build_alpha_mapping.py:26-36` (collision counter, digit loop) | VERIFIED |
| 16 | M15-EN = 2,534 dict entries = 1,267 logical pairs | `benchmarks/v8/README.md:76,89`; `MAPPINGS.md:21` (1,267); shipped file confirms 2,534 | VERIFIED |
| 17 | M15-EN digits 1↔6, 3↔8, 4↔9; shorts + antonyms; ~53% coverage | `MAPPINGS.md:23-26,54` | VERIFIED |
| 18 | M15-EN wiki-KenLM rise ~266%; over ~150% cliff → fails modern gates | `site/app/white-paper/page.tsx:745` ("M15 266% … on the wrong side of the cliff") | VERIFIED |
| 19 | M15-EN v8 per-corpus KenLM pass 0–1.6% | `benchmarks/v8/results/FINAL_REPORT.md:46,53` (m15_en 1.6% / 0.0% / 0.3%) | VERIFIED |
| 20 | m0_v3 = 400 pairs (`the→plumb`, `of→bezel`), function-word swaps, ~47% cov | `benchmarks/v8/data/mappings/m0_v3.json › all_pairs` (len 400, samples the→plumb, of→bezel); `benchmarks/v8/README.md:81` | VERIFIED |

## §1 — per-variant objective metrics table

| # | README claim | Source | Status |
|---|---|---|---|
| 21 | α: mass 27.49%, content 48.36%, info 34.27%, sem_div 0.2973, kenlm 120.8%, pass_27 10.27% | `benchmarks/v7/results/v18_variants_eval.json › [0]` (cell v18_a) | VERIFIED |
| 22 | β: n 12,046, mass 27.81, content 48.95, sem_div 0.2991, kenlm 127.6, pass_27 12.98 | `benchmarks/v7/results/v18_variants_eval.json › [1]` | VERIFIED |
| 23 | γ: n 12,048, mass 27.71, content 48.85, sem_div 0.2954, kenlm 122.8, pass_27 6.73 | `benchmarks/v7/results/v18_variants_eval.json › [2]` | VERIFIED |

> **Note / minor internal disagreement (both internally consistent):**
> `benchmarks/v7/V18_FINAL.md:139` reports the *v15-baseline* numbers as
> content **46.4%**, KenLM **114.9%**, sem-div **0.297**, pass_27 **10.27%**
> (from the 512-cell mega harness), while `v18_variants_eval.json` (the
> dedicated α/β/γ re-eval, matching `BUILDING_VARIANTS.md:300`) gives content
> **48.36%**, KenLM **120.8%**. They agree on sem-div (~0.297) and pass_27
> (10.27%). README uses the `v18_variants_eval.json` figures. VERIFIED both.

---

## §2.1 — NLI hero (headline)

| # | README claim | Source | Status |
|---|---|---|---|
| 24 | v7 mean bidir-fail **59.6 / 61.3 / 60.0%** (α/β/γ) → "~60%" | `benchmarks/v7/results/v18_variants_nli.json › v18_a.__avg__.bidir_failure_rate` = 0.5958, `v18_b…` = 0.6125, `v18_c…` = 0.6000 | VERIFIED |
| 25 | v7 **83.3%** books peak (γ) → "up to ~83% narrative prose" | `benchmarks/v7/results/v18_variants_nli.json › v18_c.books.bidir_failure_rate` = 0.8333 (α books 0.7333, β books 0.80) | VERIFIED |
| 26 | v7 n = **60** chunks/corpus, 4 corpora (wiki/books/webtext/reddit) | `v18_variants_nli.json › *.*.n` = 60; `benchmarks/v7/scripts/eval_v18_nli_meaning.py:41` (CORPORA), `:34` (n=60) | VERIFIED |
| 27 | NLI model = `cross-encoder/nli-deberta-v3-base`; bidir-fail = either dir P_entail<0.5 | `benchmarks/v8/scripts/eval_phase1_semdiv.py:131,200`; same model in v7 `eval_v18_nli_meaning.py` | VERIFIED |
| 28 | v8 median bidir-fail **50.4%** (3 corpora, n=1,500, pre-registered) | `benchmarks/v8/results/FINAL_REPORT.md:8,30` and `benchmarks/v8/phase1_semdiv/results/semdiv_extended.json › falsification_bars.F1b.actual` = 0.504 | VERIFIED |
| 29 | α/β/γ within 2.4pp (family property) | `benchmarks/v8/results/INTERIM_REPORT.md:74` (medians 51.9/49.5/50.4%) | VERIFIED |
| 30 | Synonym-swap control **~2%** bidir-fail | `semdiv_extended.json › derived.synonym_swap_nli_bidir_fail_median` = 0.021 (per-corpus 2.5/1.9/0.9/2.3%); `FINAL_REPORT.md:8` says 2.1% | VERIFIED |
| 31 | v8 n = **1,500** chunks/corpus, real corpora CC-News/OWT/PG-19 | `eval_phase1_semdiv.py:44` (N_CHUNKS=1500); `benchmarks/v8/README.md:99-103` | VERIFIED |
| 32 | ⚠️ "83% books" did NOT replicate: v8 fiction (pg19/bookcorpus) = **31–35%** | `semdiv_extended.json › results.v18_a.pg19.nli_bidir_fail` = 0.311, `.bookcorpus` = 0.345; β/γ 0.32–0.34; `FINAL_REPORT.md:34` ("PG-19 … 31-34% … weakest corpus") | VERIFIED (loud flag) |
| 33 | ⚠️ 4-corpus v8 median drops to **41.8%** when bookcorpus added | `semdiv_extended.json › derived.v18_nli_bidir_fail_median_across_corpora` = 0.418 (vs `falsification_bars.F1b.actual` 0.504 computed on original 3 corpora — a genuine within-file inconsistency; FINAL_REPORT reports the 3-corpus 50.4%) | VERIFIED (loud flag) |

## §2.1 — supporting hero-claim prose (white paper)

| # | README claim | Source | Status |
|---|---|---|---|
| 34 | "~25% of tokens swapped" framing | `site/app/white-paper/page.tsx:92,302`. Corresponds to α **mass_pct 27.49%** (`v18_variants_eval.json`). "25%" is the rounded surface/mass swap rate, distinct from **content** coverage ≈48% | VERIFIED (mass_pct); rounding ASSUMED |
| 35 | "~2.4× amplification per swap vs uniform baseline" | `site/app/white-paper/page.tsx:92` **only**. No computing script or result JSON found (grep for `2.4`/`amplif` across `benchmarks/v7,v8` returns no metric). | **ASSUMED — not independently verified.** Flagged; README states it only as white-paper framing and does not rely on it. |

---

## §2.2 — Semantic divergence

| # | README claim | Source | Status |
|---|---|---|---|
| 36 | α sem-div **0.297** (v7) | `benchmarks/v7/results/v18_variants_eval.json › [0].sem_div` = 0.2973 | VERIFIED |
| 37 | α sem-div **0.268** median (v8) | `benchmarks/v8/results/FINAL_REPORT.md:8,29`; `semdiv_extended.json › falsification_bars.F1a.actual` = 0.268 | VERIFIED |
| 38 | family ~0.27–0.30 across seeds | `semdiv_extended.json › results.{v18_a,v18_b,v18_c}.__median__.sem_div_mean` = 0.2656 / 0.2690 / 0.2644 (4-corpus); v7 0.2973/0.2991/0.2954 | VERIFIED |
| 39 | sem-div method = 1−cos, `all-MiniLM-L6-v2` | `eval_phase1_semdiv.py:127,188-190` | VERIFIED |
| 40 | m0_v3 sem-div **0.46–0.53** (higher, grammar-breaking) | `FINAL_REPORT.md:25` and `semdiv_extended.json › results.m0_v3` (cc_news 0.465, owt 0.495, pg19 0.529) | VERIFIED |
| 41 | Interpretation: muted sem-div is a feature (grammar preserved) | `FINAL_REPORT.md:31,157`; `INTERIM_REPORT.md:96-98` | VERIFIED |

---

## §2.3 — Staleness / filter survival

| # | README claim | Source | Status |
|---|---|---|---|
| 42 | α FineWeb-Edu pass **10.27%** (v7) | `benchmarks/v7/results/v18_variants_eval.json › [0].pass_27` = 10.27; `V18_FINAL.md:139` | VERIFIED |
| 43 | FineWeb-Edu threshold ≥ **2.7** | `benchmarks/v8/README.md:117`; `eval_phase1` context; FINAL_REPORT.md:56 | VERIFIED |
| 44 | v18 wasted-per-passing-page **~24%** (median α/β/γ, FineWeb-Edu primary) | `benchmarks/v8/phase3_wasted/results/wasted_tokens.json › wasted.{v18_a,b,c}.*.fineweb_edu.wasted_per_passing_page`; 3-corpus medians 0.2485 / 0.2381 / 0.2411 → cross-variant median **0.2411 = 24.1%**; `FINAL_REPORT.md:92-99` (F3a PASS 24.1%) | VERIFIED |
| 45 | ~24pp above clean baseline (excess_waste) | `wasted_tokens.json › …fineweb_edu.excess_waste` (clean baseline 0.0, so excess = wasted); `FINAL_REPORT.md:100` (F3b PASS 24.1pp) | VERIFIED |
| 46 | primary gate = FineWeb-Edu | `wasted_tokens.json › primary_gate` = "fineweb_edu" | VERIFIED |
| 47 | M15-EN ~40% per passing page but ~0–1% pass → adopter waste ~0 | `wasted_tokens.json › wasted.m15_en.*.fineweb_edu.wasted_per_passing_page` (cc 0.4056, owt 0.4001, pg19 0.2841) with `gate_pass_rate` 0.002/0.01/0.001; adopter=0.0008; `FINAL_REPORT.md:95,103` | VERIFIED |
| 48 | ⚠️ Gate-dependence: Kendall τ ≈ 0 across 4 gates | `FINAL_REPORT.md:74-79` (τ = −0.05…+0.02); `benchmarks/v8/README.md:168` (F2c bar) | VERIFIED |
| 49 | ⚠️ per-corpus KenLM pass 1.4–33% (register-dependent) | `FINAL_REPORT.md:44-46` (v18_a cc_news 16.0%, owt 1.4%, pg19 29.0%); `INTERIM_REPORT.md:31-36` (up to 33.4% v18_c pg19) | VERIFIED |
| 50 | ⚠️ Frontier labs gate with classifiers (fastText/DistilRoBERTa/FineWeb-Edu), not Wiki-KenLM | `benchmarks/v8/README.md:121`; `site/app/white-paper/page.tsx:695,702` | VERIFIED |
| 51 | Marion "poisoning sweet spot" 110–140% KenLM band | `benchmarks/v7/V18_FINAL.md:139`; `BUILDING_VARIANTS.md:259`; ~150% cliff `white-paper:745` | VERIFIED |

---

## §3 — Reproduction commands

| # | README claim | Source | Status |
|---|---|---|---|
| 52 | build_pairs → apply_v15_cell → generate_font → audit_font chain; `--expand-paradigms` required; pair-identical to α at seed 42 | `benchmarks/v7/BUILDING_VARIANTS.md:129-235,160-164,182` | VERIFIED |
| 53 | Flatten via `scripts/build_alpha_mapping.py <pairs> <out>` | `scripts/build_alpha_mapping.py:9-12` (usage) | VERIFIED |
| 54 | Expected bands: pairs 11.8–12k, sem-div 0.295–0.300, content ≈48%, KenLM 110–140%, pass_27 8–15% | `benchmarks/v7/BUILDING_VARIANTS.md:253-260` | VERIFIED |
| 55 | Hero re-run scripts + models pulled | `benchmarks/v8/scripts/eval_phase1_semdiv.py`, `gate_fineweb_edu.py`, `aggregate_phase3.py`; models at `eval_phase1_semdiv.py:127,131` + `README.md:117` | VERIFIED |
| 56 | β/γ shipped fonts built by running `build_alpha_mapping.py` on `pairs_v7_alpha_v18_b/c.json` | **INFERRED.** `build_alpha_mapping.py` is generic (argv src/out); no script or shell file names the β/γ invocations (grep found none). Files exist and match structure. | **ASSUMED (mechanism inferred, outputs VERIFIED to exist).** |

---

## Known caveats

- **Doc staleness (F-A).** `MAPPINGS.md` (dated Apr 30, pre-v7) still calls
  **M15-EN** the "current production mapping"; the current default is v18-α.
  For "what ships," trust this benchmark and each mapping's `_meta` block, not
  the older dated docs.
- **83% on books (F-B).** The white paper's "up to ~83% on narrative prose"
  rests on a **v7 n=60** measurement that the **v8 n=1,500** run *inverts* —
  fiction is v8's weakest register (31–35%). The public copy therefore leads
  with the **50.4% median** and footnotes the 83%.
- **2.4× amplification (F-C).** Asserted in white-paper prose with no computed
  source located; treated as unverified and not used for any headline claim.
- **Byte-identity (F-D).** α and its `v18_a` source are **pair-identical**, not
  byte-identical (an overstatement in an internal build doc).
- **Within-file NLI value (F-E).** One results file carries both a 3-corpus bar
  value (0.504) and a 4-corpus derived value (0.418); the reports publish
  0.504, which is the value used here.
