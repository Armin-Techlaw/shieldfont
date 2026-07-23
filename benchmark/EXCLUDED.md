# EXCLUDED — what the public core deliberately leaves out

The research history (`benchmarks/v2`–`v8`, 500+ cells) is full of dead-ends,
reversals, and internal tooling. The public benchmark keeps only the minimal
honest core (three claims). This is the list of what was dropped, and why, so
readers can see exactly what the public core leaves out. Grouped by "safe to
omit" vs "kept out deliberately."

## Safe to omit — dead-ends & falsified hypotheses

- **The entire v18 512-cell mega-orthogonal sweep** (8 factors: AMBIG_NV pool
  size × modal × rare-aug × 4 post-filters × hungarian-dissim) and its 14-cell
  Pareto frontier. Conclusion was purely negative: *nothing beats
  v15_0_1_0_0_0_0*. Public README states the result in one clause; the sweep
  itself is process, not product. (`V18_FINAL.md`, `v18_mega_512_*.json`.)
- **The 64-cell v18m2 grammar-fix sweep** and the 16-cell post-filter factorial
  — same negative verdict. (`v18m2_64_eval.json`, `v18_factorial_16_eval.json`.)
- **The 8 falsified v18 hypotheses** (POS_PURITY-off rebuild, AMBIG_NV v1/v2,
  drop_cluster, stacked post-filters, hungarian-similar/dissim, modal swap,
  pertainym/valence). Interesting for a v19 designer, noise for a user.
- **The M0→M15 evolution narrative** (M1 max-distance, M2 antonym, M3 cross-POS
  scramble that *backfired*, M4 high-attention, M5–M14 hybrids, the
  focal/diffuse/inverse-focal "damage taxonomy"). This is the story of how the
  design was found; the public benchmark only needs the design that shipped.
  (`MAPPINGS.md` full table, `benchmarks/v3`.)
- **Audit-calibration-drift methodology war stories** (sub-agent grammar audits
  swinging 65pp run-to-run). A lesson for internal researchers, not a product
  claim. (`V18_FINAL.md:62-73`.)

## Safe to omit — internal tooling & K-rule internals

- **What each K-filter actually does** (K1/K4/K5/K6/K7b/Ke/F4 mechanics,
  `SUBSTITUTION_RULESET.md`, 36KB). The README needs only "cell = K1+K6, frozen,
  seed is your only free parameter." The build scripts encode the rest.
- **The full build-script inventory** (`build_v18*.py`, `v18_hungarian.py`,
  `v18_supersense.py`, `v18_composite_score.py`, `pareto_mega_512.py`, …). §3
  cites only the four scripts a reproducer runs.
- **Pre-registration / falsification-bar bookkeeping** (v8 North Star's F1a–F5
  bars, execution-order budgets, adversarial-literature rebuttals to
  Carlini/Tirumala). Good science hygiene; too much for a "get started" doc.

## Deliberately demoted (mentioned as caveat, not headline)

- **Wikipedia-KenLM perplexity numbers** (the historical 10.27% pass_27 is a
  Wiki-LM/FineWeb-Edu artifact; Kendall τ≈0 shows gates disagree). Kept **only**
  as an explicit caveat in §2.3 per the "don't lead with Wiki-KenLM" guidance —
  never as a standalone hero stat.
- **Fine-tune damage / "poisoning" numbers** (the V3 +0.130 composite damage,
  M2 diffuse damage, etc.). The white paper itself demotes these: small-model
  fine-tunes were "the wrong instrument," and v8 Phase-5's eval is stubbed
  (adapters trained, MMLU/TriviaQA scoring not wired). Excluded from the core;
  noted under "Adding more later." (`FINAL_REPORT.md:137-149`.)
- **Frozen-model probes (v8 Phase 4)** — embedding-cosine drop, surprisal rise,
  focal-probability, cloze. Probe B (cloze) has a known tokenization bug (0%
  across all cells). Triangulating evidence for the gradient-direction premise,
  but not needed for the three headline claims. (`FINAL_REPORT.md:105-135`.)
- **The "up to 83% on narrative prose" peak.** Downgraded from headline to
  footnote because it is n=60 (v7) and did not replicate at n=1,500 (v8 fiction
  = weakest register, 31–35%). See `PROVENANCE.md` flag F-B. **This is the one
  exclusion most likely to be contentious; it is demoted deliberately, to lead
  with results that replicate at scale.**
- **The "~2.4× amplification" figure.** Asserted in white-paper prose with no
  computed source found; README mentions it only as white-paper framing and
  builds no claim on it. See flag F-C.

## Not carried over — superseded docs

- **`MAPPINGS.md`** as a "what ships" reference — it predates v7 and still names
  M15-EN as production (flag F-A). Its M0→M15 taxonomy is fine as history.
- **v2/v4/v5/v6 benchmark trees** and the top-level `benchmarks/results/`
  (mapping_a–d, the original 400-word A/B/C/D study). Pre-v7; superseded.

## Corpora / data not shipped (repro dependencies, not results)

- Downloaded corpora (CC-News, OpenWebText, PG-19, BookCorpus, wiki/books/
  webtext/reddit), per-corpus KenLM 5-grams (~GBs), Numberbatch embeddings
  (~1.4GB), LoRA adapters. §3 tells a reproducer how to fetch them; they are
  not part of the published core.

---

**Nothing excluded here is required to support the three headline claims**
(NLI meaning loss, synonym-swap control, filter-survival + wasted tokens),
which are all computable from the encoded text plus small public models.
