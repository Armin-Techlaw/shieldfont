#!/usr/bin/env python3
"""Recompute this benchmark's headline numbers directly from the committed JSONs.

No network access, no models, no external packages — just the stored per-chunk
and per-cell scores already sitting in this directory. Run with no arguments:

    python3 benchmark/data/verify.py

Each section prints the number(s) that appear in benchmark/README.md next to
its source file, so a reader can check the document against the data without
re-running any model. This does not re-generate the scores themselves (that
needs the corpora + models — see README.md §3.B); it only recomputes the
published aggregates from scores that are already on disk.
"""
import json
import statistics
from pathlib import Path

HERE = Path(__file__).parent


def load(*parts):
    with open(HERE.joinpath(*parts)) as f:
        return json.load(f)


def pct(x, digits=1):
    return f"{100 * x:.{digits}f}%"


def pearson(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = sum((x - mx) ** 2 for x in xs)
    vy = sum((y - my) ** 2 for y in ys)
    return cov / (vx * vy) ** 0.5


def section(title):
    print(f"\n=== {title} ===")


def nli_meaning_loss():
    section("§2.1 — NLI bidirectional-entailment failure")
    d = load("v8", "phase1_semdiv", "results", "semdiv_extended.json")
    r = d["results"]["v18_a"]
    corpora_3 = ["cc_news", "openwebtext", "pg19"]
    corpora_4 = corpora_3 + ["bookcorpus"]
    labels = {"cc_news": "news (CC-News)", "openwebtext": "general web (OpenWebText)",
              "bookcorpus": "fiction (BookCorpus)", "pg19": "older fiction (PG-19)"}
    for c in corpora_4:
        print(f"  {labels[c]:<28} {pct(r[c]['nli_bidir_fail'])}")
    med3 = statistics.median(r[c]["nli_bidir_fail"] for c in corpora_3)
    med4 = statistics.median(r[c]["nli_bidir_fail"] for c in corpora_4)
    print(f"  v18-alpha's own three-corpus median:   {pct(med3)}")
    print(f"  v18-alpha's own four-corpus median:     {pct(med4)}")
    # The published "50.4% / 41.8%" headline is a family statistic (median of
    # each of α/β/γ's own medians), not v18-alpha's median alone — read it
    # straight from the stored fields rather than re-deriving it here.
    print(f"  family median-of-medians, three-corpus (published headline): "
          f"{pct(d['falsification_bars']['F1b']['actual'])}")
    print(f"  family median-of-medians, four-corpus: "
          f"{pct(d['derived']['v18_nli_bidir_fail_median_across_corpora'])}")
    syn = d["results"]["synonym_swap_25"]
    syn_med = statistics.median(syn[c]["nli_bidir_fail"] for c in corpora_4)
    clean_med = statistics.median(d["results"]["clean"][c]["nli_bidir_fail"] for c in corpora_4)
    print(f"  synonym-swap control, four-corpus median: {pct(syn_med)}")
    print(f"  untouched clean-text control, four-corpus median: {pct(clean_med)}")


def wasted_tokens():
    section("§2.3 — Wasted content per passing page (FineWeb-Edu gate, v18 family)")
    d = load("v8", "phase3_wasted", "results", "wasted_tokens.json")
    corpora_3 = ["cc_news", "openwebtext", "pg19"]
    corpora_4 = corpora_3 + ["bookcorpus"]
    variants = ["v18_a", "v18_b", "v18_c"]
    per_variant_3, per_variant_4 = [], []
    for v in variants:
        w = d["wasted"][v]
        vals3 = [w[c]["fineweb_edu"]["wasted_per_passing_page"] for c in corpora_3]
        vals4 = [w[c]["fineweb_edu"]["wasted_per_passing_page"] for c in corpora_4]
        per_variant_3.append(statistics.median(vals3))
        per_variant_4.append(statistics.median(vals4))
    print(f"  three-corpus median across α/β/γ: {pct(statistics.median(per_variant_3))}")
    print(f"  four-corpus median across α/β/γ (headline): {pct(statistics.median(per_variant_4))}")


def swap_rate():
    section("§ (top of README) — headline swap rate, v18-alpha")
    d = load("v8", "results", "appendix_coverage_meaning.json")
    corpora = ["cc_news", "openwebtext", "pg19", "bookcorpus"]
    covs = [d["cells"][f"v18_a__{c}"]["all"]["total_cov_mean"] for c in corpora]
    print(f"  per-corpus total_cov_mean: {[round(100 * c, 2) for c in covs]}")
    # The headline rounds DOWN to one decimal (24.48 -> 24.4), matching the
    # white paper. Printed to 2dp here so the exact value is on the record.
    print(f"  four-corpus mean: {pct(sum(covs) / len(covs), 2)}  (headline: 24.4%)")


def filter_survival():
    section("§2.3 — FineWeb-Edu filter survival, v18-alpha, pooled")
    d = load("v8", "phase2_filters", "results", "gate_fineweb_edu.json")
    threshold = d["threshold"]
    corpora = ["cc_news", "openwebtext", "pg19"]
    passed = total = 0
    conditional_pass = clean_pass = 0
    for c in corpora:
        v = d["results"]["v18_a"][c]
        cl = d["results"]["clean"][c]
        passed += v["n_passed"]
        total += v["n_chunks"]
        print(f"  {c:<12} absolute {pct(v['n_passed'] / v['n_chunks'], 2)}  "
              f"(clean baseline {pct(cl['n_passed'] / cl['n_chunks'], 2)})")
        # True paired conditional retention: same chunk index, clean score vs
        # encoded score, both against the same threshold — not two independent
        # aggregate counts. This is the computation PROVENANCE.md flag F-G
        # says has never been scripted; this closes that gap.
        for clean_score, enc_score in zip(cl["scores"], v["scores"]):
            if clean_score >= threshold:
                clean_pass += 1
                if enc_score >= threshold:
                    conditional_pass += 1
    print(f"  pooled absolute pass rate: {pct(passed / total, 2)}")
    print(f"  pooled conditional retention (paired, of clean-passing chunks): "
          f"{conditional_pass} of {clean_pass} = {pct(conditional_pass / clean_pass, 2)}")


def concealment_vs_survival():
    section("§ Methods — concealment-vs-filter-survival correlation")
    mp = load("v7", "results", "mega_pareto.json")
    xs, ys = [], []
    for cell in mp["scores"].values():
        if cell.get("conceal_avg") is not None and cell.get("pass_27") is not None:
            xs.append(cell["conceal_avg"])
            ys.append(cell["pass_27"])
    print(f"  mixed-family pool (n={len(xs)}, mega_pareto.json): "
          f"Pearson r = {pearson(xs, ys):.3f}")

    cells = load("v7", "results", "v18_mega_512_eval.json")
    xs = [c["sem_div"] for c in cells]
    ys = [c["pass_27"] for c in cells]
    print(f"  within one recipe family (n={len(xs)}, v18_mega_512_eval.json): "
          f"Pearson r = {pearson(xs, ys):.3f}  <- headline, the conservative figure")


if __name__ == "__main__":
    nli_meaning_loss()
    wasted_tokens()
    swap_rate()
    filter_survival()
    concealment_vs_survival()
    print()
