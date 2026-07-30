#!/usr/bin/env python3
"""Phase 3 — Aggregate Phase 1 + Phase 2 outputs into the wasted-tokens headline.

For each (variant × corpus × gate):
  wasted_per_passing_page = content_coverage_on_passing × meaning_loss_on_passing
  wasted_per_adopter_page = content_coverage × gate_pass_rate × meaning_loss
  excess_waste = wasted_per_passing_page − clean_wasted_baseline

Primary meaning_loss_factor = NLI bidir-fail on passing subset.

Falsification bars (per locked pre-reg):
  F3a: v18 wasted_per_passing_page ≥ 15% on corpus median
  F3b: v18 excess_waste ≥ 10pp above clean baseline
  F3c: M15-EN wasted_per_adopter_page ≥ 25%

Inputs:
  phase1_semdiv/results/semdiv_extended.json (NLI + sem-div + content_coverage)
  phase2_filters/results/gate_*.json (pass rates, per-chunk scores)
  phase2_filters/results/multigate_survival.json (consolidated)

Output: phase3_wasted/results/wasted_tokens.json

NOTE: this version uses POOLED meaning_loss as the primary headline because
computing meaning_loss_on_passing requires the indices of passing chunks per
gate × variant cell. A later refinement (Phase 3.1) stratifies by passing
subset properly using the per-chunk scores stored in each gate JSON.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from phase2_common import CORPORA, VARIANTS, V8

PHASE1_RESULTS = V8 / "phase1_semdiv" / "results" / "semdiv_extended.json"
PHASE2_RESULTS = V8 / "phase2_filters" / "results"
OUT_PATH = V8 / "phase3_wasted" / "results" / "wasted_tokens.json"


def load_phase1():
    if not PHASE1_RESULTS.exists():
        return None
    return json.loads(PHASE1_RESULTS.read_text())


def load_gate(name: str):
    p = PHASE2_RESULTS / f"gate_{name}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text())


def main():
    print("[phase3] aggregating wasted-tokens metric\n")
    phase1 = load_phase1()
    if phase1 is None:
        print(f"  ERROR: missing {PHASE1_RESULTS}")
        sys.exit(1)

    gates = {}
    for g in ("per_corpus_kenlm", "fineweb_edu", "pythia_160m", "wiki_kenlm", "dclm_fasttext"):
        d = load_gate(g)
        if d is not None:
            gates[g] = d

    if not gates:
        print("  ERROR: no Phase 2 gates found")
        sys.exit(1)
    print(f"  gates loaded: {list(gates.keys())}")

    # Build wasted matrix: wasted[variant][corpus][gate] = {...}
    wasted = {}
    for variant in VARIANTS:
        wasted[variant] = {}
        for corpus in CORPORA:
            wasted[variant][corpus] = {}
            cov_cell = phase1["results"].get(variant, {}).get(corpus, {})
            content_coverage = cov_cell.get("content_coverage", 0.0)
            meaning_loss_pooled = cov_cell.get("nli_bidir_fail", 0.0)  # primary = NLI bidir-fail
            for gate_name, gate in gates.items():
                gcell = gate["results"].get(variant, {}).get(corpus, {})
                pass_rate = gcell.get("pass_rate", 0.0)

                wasted_per_passing_page = content_coverage * meaning_loss_pooled
                wasted_per_adopter_page = content_coverage * pass_rate * meaning_loss_pooled

                # Clean baseline on same metric (clean has near-zero content_coverage)
                clean_cov = phase1["results"].get("clean", {}).get(corpus, {}).get("content_coverage", 0.0)
                clean_nli = phase1["results"].get("clean", {}).get(corpus, {}).get("nli_bidir_fail", 0.0)
                clean_wasted_baseline = clean_cov * clean_nli

                excess_waste = wasted_per_passing_page - clean_wasted_baseline

                wasted[variant][corpus][gate_name] = {
                    "content_coverage": round(content_coverage, 4),
                    "gate_pass_rate": round(pass_rate, 4),
                    "meaning_loss_pooled_nli": round(meaning_loss_pooled, 4),
                    "wasted_per_passing_page": round(wasted_per_passing_page, 4),
                    "wasted_per_adopter_page": round(wasted_per_adopter_page, 4),
                    "clean_wasted_baseline": round(clean_wasted_baseline, 4),
                    "excess_waste": round(excess_waste, 4),
                }

    # Falsification bars (using FineWeb-Edu as primary gate for headlines)
    bars = {}
    primary_gate = "fineweb_edu" if "fineweb_edu" in gates else next(iter(gates))

    def median_per_variant(variants, key):
        vals = []
        for v in variants:
            corpus_vals = [wasted[v][c][primary_gate][key] for c in CORPORA if c in wasted.get(v, {})]
            if corpus_vals:
                vals.append(float(np.median(corpus_vals)))
        return float(np.median(vals)) if vals else 0.0

    f3a = median_per_variant(["v18_a", "v18_b", "v18_c"], "wasted_per_passing_page")
    f3b = median_per_variant(["v18_a", "v18_b", "v18_c"], "excess_waste")
    f3c = wasted.get("m15_en", {}).get("__median_adopter__")
    # Compute m15 wasted_per_adopter median
    m15_adopter_meds = [wasted["m15_en"][c][primary_gate]["wasted_per_adopter_page"] for c in CORPORA if c in wasted.get("m15_en", {})]
    f3c_val = float(np.median(m15_adopter_meds)) if m15_adopter_meds else 0.0

    bars["F3a"] = {"name": f"v18 wasted_per_passing_page ≥ 15% median (gate={primary_gate})",
                   "actual": round(f3a, 4), "bar": 0.15, "pass": f3a >= 0.15}
    bars["F3b"] = {"name": f"v18 excess_waste ≥ 10pp above clean baseline median (gate={primary_gate})",
                   "actual": round(f3b, 4), "bar": 0.10, "pass": f3b >= 0.10}
    bars["F3c"] = {"name": f"M15-EN wasted_per_adopter_page ≥ 25% median (gate={primary_gate})",
                   "actual": round(f3c_val, 4), "bar": 0.25, "pass": f3c_val >= 0.25}

    out = {
        "schema_version": 1,
        "primary_gate": primary_gate,
        "primary_meaning_loss_factor": "nli_bidir_fail (pooled)",
        "note": "Pooled NLI used as primary; conditional-on-passing stratification deferred to Phase 3.1 (requires per-chunk score indexing)",
        "wasted": wasted,
        "falsification_bars": bars,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"\n[phase3] wrote {OUT_PATH}")

    print(f"\nWASTED PER PASSING PAGE (primary gate={primary_gate})")
    for variant in VARIANTS:
        row = f"{variant:<10}"
        for corpus in CORPORA:
            cell = wasted[variant][corpus][primary_gate]
            row += f"  {corpus[:8]:>8}={cell['wasted_per_passing_page']*100:5.1f}%"
        print(row)

    print(f"\nFALSIFICATION BARS:")
    for k, v in bars.items():
        status = "PASS" if v["pass"] else "FAIL"
        print(f"  {k}: {status}  {v['name']} → actual={v['actual']:.4f} bar={v['bar']}")


if __name__ == "__main__":
    main()
