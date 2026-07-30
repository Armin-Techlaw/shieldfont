#!/usr/bin/env python3
"""Phase 2c — FineWeb-Edu classifier pass-2.7 gate.

For each (variant × corpus), score every chunk with the HuggingFaceFW
FineWeb-Edu classifier (HuggingFaceFW/fineweb-edu-classifier). Threshold ≥ 2.7
is the primary cutoff (matches v7); ≥ 3.0 is the sensitivity check.

Output: phase2_filters/results/gate_fineweb_edu.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from phase2_common import (
    CORPORA, VARIANTS, V8,
    emit_gate_result, load_all_scoring_chunks, build_encoded_matrix,
)

RESULTS = V8 / "phase2_filters" / "results"
PRIMARY_THRESHOLD = 2.7
SENSITIVITY_THRESHOLD = 3.0
MODEL_NAME = "HuggingFaceFW/fineweb-edu-classifier"


def main():
    print(f"[phase2c] gate scoring with {MODEL_NAME}\n")
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    import torch

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"  device: {device}")
    tok = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME).to(device).eval()

    def score_batch(texts: list[str], batch_size: int = 32) -> list[float]:
        scores = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            inputs = tok(batch, return_tensors="pt", padding="longest", truncation=True, max_length=512).to(device)
            with torch.no_grad():
                out = model(**inputs)
            # FineWeb-Edu classifier is a regression head (single output), interpret as edu score 0-5
            preds = out.logits.squeeze(-1).cpu().float().tolist()
            if isinstance(preds, float):
                preds = [preds]
            scores.extend(preds)
        return scores

    scoring_chunks = load_all_scoring_chunks()
    encoded_matrix = build_encoded_matrix(scoring_chunks)

    raw_scores = {}
    for variant in VARIANTS:
        raw_scores[variant] = {}
        for corpus in CORPORA:
            chunks = encoded_matrix[variant][corpus]
            print(f"  scoring {variant} on {corpus} (n={len(chunks)})…", flush=True)
            raw_scores[variant][corpus] = score_batch(chunks)

    # Two-threshold table
    results = {}
    for variant in VARIANTS:
        results[variant] = {}
        for corpus in CORPORA:
            scores = raw_scores[variant][corpus]
            n = len(scores)
            n_pass_primary = sum(1 for s in scores if s >= PRIMARY_THRESHOLD)
            n_pass_sens = sum(1 for s in scores if s >= SENSITIVITY_THRESHOLD)
            results[variant][corpus] = {
                "n_chunks": n,
                "n_passed": n_pass_primary,
                "pass_rate": round(n_pass_primary / n, 4) if n else 0.0,
                "pass_rate_sensitivity_30": round(n_pass_sens / n, 4) if n else 0.0,
                "score_median": round(float(np.median(scores)), 3),
                "score_p25": round(float(np.percentile(scores, 25)), 3),
                "score_p75": round(float(np.percentile(scores, 75)), 3),
                "scores": [round(s, 3) for s in scores],  # for Kendall τ
            }

    out_path = RESULTS / "gate_fineweb_edu.json"
    emit_gate_result(out_path, "fineweb_edu", PRIMARY_THRESHOLD, "absolute", results,
                     extra={"sensitivity_threshold": SENSITIVITY_THRESHOLD, "model": MODEL_NAME})
    print(f"\n[phase2c] wrote {out_path}")

    print(f"\n{'variant':<10} " + "  ".join(f"{c:<16}" for c in CORPORA))
    print("-" * 65)
    for variant in VARIANTS:
        cells = [f"{results[variant][c]['pass_rate']*100:5.1f}% med={results[variant][c]['score_median']:.2f}"
                 for c in CORPORA]
        print(f"{variant:<10} " + "  ".join(cells))


if __name__ == "__main__":
    main()
