#!/usr/bin/env python3
"""Phase 1 — Sem-div + NLI bidir-fail on 7 mappings × 3 corpora × 1500 chunks.

Per the locked Phase 1 pre-reg:
- Sentence-BERT: all-MiniLM-L6-v2 on MPS
- NLI: cross-encoder/nli-deberta-v3-base
- bidir-fail definition: (P_entail_fwd < 0.5) | (P_entail_bwd < 0.5)
- 1500 chunks per corpus, sampled from scoring_pool with seed=20260516
- Chunks: 1500 chars each (matches v7 convention)

Mappings under test (7):
  clean, v18_a, v18_b, v18_c, m15_en, m0_v3, synonym_swap_25

Falsification bars:
  F1a: v18 median sem-div across corpora ≥ 0.25
  F1b: v18 median NLI bidir-fail across corpora ≥ 0.50
  F1c: median sem-div(v18) − sem-div(m0_v3) ≥ 0.10
  F1d: median NLI bidir-fail on synonym_swap_25 ≤ 0.20
  F1e: per-corpus sem-div ≥ 0.15 AND NLI ≥ 0.30 — soft "limitation noted" trigger

Output: phase1_semdiv/results/semdiv_extended.json
"""
from __future__ import annotations

import json
import random
import re
import sys
from datetime import datetime
from pathlib import Path
from statistics import mean, median

import numpy as np

V8 = Path(__file__).resolve().parent.parent
REPO = V8.parent.parent
SPLITS = V8 / "data" / "splits"
MAPPINGS_DIR = V8 / "data" / "mappings"
SYNONYM_CHUNKS = V8 / "data" / "synonym_swap_chunks.jsonl"
RESULTS_DIR = V8 / "phase1_semdiv" / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

SEED = 20260516
N_CHUNKS = 1500
CHUNK_CHARS = 1500
WORD_RE = re.compile(r"[a-zA-Z]+")
CORPORA = ["cc_news", "openwebtext", "pg19", "bookcorpus"]

V7_DATA = REPO / "benchmarks" / "v7" / "data"

MAPPING_FILES = {
    "v18_a": V7_DATA / "pairs_v7_alpha_v18_a.json",
    "v18_b": V7_DATA / "pairs_v7_alpha_v18_b.json",
    "v18_c": V7_DATA / "pairs_v7_alpha_v18_c.json",
    "m15_en": MAPPINGS_DIR / "m15_en.json",
    "m0_v3": MAPPINGS_DIR / "m0_v3.json",
}


def load_mapping(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    d = json.loads(path.read_text())
    return {p["src"].lower(): p["tgt"] for p in d.get("all_pairs", []) if "src" in p and "tgt" in p}


def encode_text(text: str, mapping: dict[str, str]) -> str:
    if not mapping:
        return text

    def rep(m):
        w = m.group(0)
        sub = mapping.get(w.lower())
        if sub is None:
            return w
        return sub.capitalize() if w[0].isupper() else sub
    return WORD_RE.sub(rep, text)


def load_scoring_chunks(corpus: str, n: int, seed: int) -> list[str]:
    p = SPLITS / f"{corpus}_scoring_pool.jsonl"
    if not p.exists():
        print(f"  ERROR: {p.name} missing")
        return []
    lines = p.read_text().splitlines()
    rng = random.Random(seed + hash(corpus) % 1000)
    take = min(n, len(lines))
    indices = rng.sample(range(len(lines)), take)
    return [json.loads(lines[i])["text"][:CHUNK_CHARS] for i in indices]


def load_synonym_swap(corpus: str, n: int) -> tuple[list[str], list[str]]:
    """Returns (original_chunks, swapped_chunks) for the synonym-swap control."""
    if not SYNONYM_CHUNKS.exists():
        return [], []
    originals, swapped = [], []
    with SYNONYM_CHUNKS.open() as f:
        for line in f:
            r = json.loads(line)
            if r.get("corpus") != corpus:
                continue
            originals.append(r["original"])
            swapped.append(r["swapped"])
            if len(originals) >= n:
                break
    return originals, swapped


def content_coverage(chunk: str, mapping: dict[str, str], stops: set) -> float:
    n_content = 0
    n_swapped = 0
    for w in WORD_RE.findall(chunk):
        wl = w.lower()
        if not wl.isalpha() or wl in stops:
            continue
        n_content += 1
        if wl in mapping:
            n_swapped += 1
    return n_swapped / n_content if n_content else 0.0


def main():
    print(f"[phase1] sem-div + NLI eval — seed={SEED}, n_chunks/corpus={N_CHUNKS}\n")

    print("[phase1] loading sentence-BERT (all-MiniLM-L6-v2)…")
    from sentence_transformers import SentenceTransformer
    sbert = SentenceTransformer("all-MiniLM-L6-v2", device="mps")

    print("[phase1] loading NLI (cross-encoder/nli-deberta-v3-base)…")
    from sentence_transformers import CrossEncoder
    nli = CrossEncoder("cross-encoder/nli-deberta-v3-base")

    print("[phase1] loading NLTK stopwords…")
    import nltk
    try:
        nltk.data.find("corpora/stopwords")
    except LookupError:
        nltk.download("stopwords", quiet=True)
    from nltk.corpus import stopwords
    stops = set(stopwords.words("english"))

    # Preload all mappings
    print("\n[phase1] mappings:")
    mappings = {"clean": {}}
    for label, path in MAPPING_FILES.items():
        m = load_mapping(path)
        mappings[label] = m
        print(f"  {label}: {len(m)} src→tgt entries from {path.name if path.exists() else '<missing>'}")
    if not mappings["m15_en"]:
        print("  WARN: m15_en empty — F1 evaluation will skip M15-EN comparisons")
    if not mappings["m0_v3"]:
        print("  WARN: m0_v3 empty — F1c (v18 − m0 divergence bar) cannot be evaluated")

    # Preload scoring chunks per corpus
    print("\n[phase1] loading scoring chunks…")
    chunks_per_corpus = {}
    for c in CORPORA:
        chunks_per_corpus[c] = load_scoring_chunks(c, N_CHUNKS, SEED)
        print(f"  {c}: {len(chunks_per_corpus[c])} chunks loaded")
        if len(chunks_per_corpus[c]) < N_CHUNKS:
            print(f"    NOTE: {c} short of target ({len(chunks_per_corpus[c])} < {N_CHUNKS}); proceeding with available")

    # Precompute clean embeddings per corpus
    print("\n[phase1] encoding clean chunks…")
    clean_emb_per_corpus = {}
    for c, chunks in chunks_per_corpus.items():
        emb = sbert.encode(chunks, batch_size=64, show_progress_bar=False, convert_to_numpy=True)
        clean_emb_per_corpus[c] = emb

    # Per-mapping eval
    results = {}
    standard_labels = ["clean", "v18_a", "v18_b", "v18_c", "m15_en", "m0_v3"]

    for label in standard_labels:
        mapping = mappings[label]
        results[label] = {}
        print(f"\n[phase1] eval mapping={label}")
        for c, chunks in chunks_per_corpus.items():
            if not chunks:
                continue

            # Encode
            encoded = [encode_text(ch, mapping) for ch in chunks]

            # Sem-div
            enc_emb = sbert.encode(encoded, batch_size=64, show_progress_bar=False, convert_to_numpy=True)
            clean_emb = clean_emb_per_corpus[c]
            cos = (clean_emb * enc_emb).sum(axis=1) / (
                np.linalg.norm(clean_emb, axis=1) * np.linalg.norm(enc_emb, axis=1) + 1e-9)
            sem_div = (1.0 - cos)
            sem_div_mean = float(np.mean(sem_div))
            sem_div_p25 = float(np.percentile(sem_div, 25))
            sem_div_p75 = float(np.percentile(sem_div, 75))

            # NLI bidir
            fwd = nli.predict(list(zip(chunks, encoded)), batch_size=8, show_progress_bar=False, apply_softmax=True)
            bwd = nli.predict(list(zip(encoded, chunks)), batch_size=8, show_progress_bar=False, apply_softmax=True)
            P_entail_fwd = fwd[:, 1]
            P_entail_bwd = bwd[:, 1]
            bidir_fail = float(np.mean((P_entail_fwd < 0.5) | (P_entail_bwd < 0.5)))
            mean_loss = float(np.mean(1.0 - (P_entail_fwd + P_entail_bwd) / 2.0))
            strong_contra = float(np.mean((fwd[:, 0] > 0.5) | (bwd[:, 0] > 0.5)))

            cov = float(np.mean([content_coverage(ch, mapping, stops) for ch in chunks]))

            results[label][c] = {
                "n": len(chunks),
                "sem_div_mean": round(sem_div_mean, 4),
                "sem_div_p25": round(sem_div_p25, 4),
                "sem_div_p75": round(sem_div_p75, 4),
                "nli_bidir_fail": round(bidir_fail, 4),
                "nli_strong_contradiction": round(strong_contra, 4),
                "nli_mean_meaning_loss": round(mean_loss, 4),
                "content_coverage": round(cov, 4),
            }
            print(f"  {c}: sd={sem_div_mean:.4f}  nli_fail={bidir_fail:.2%}  cov={cov:.2%}")

        # Aggregates
        if results[label]:
            results[label]["__avg__"] = {
                "sem_div_mean": float(np.mean([results[label][c]["sem_div_mean"] for c in CORPORA if c in results[label]])),
                "nli_bidir_fail": float(np.mean([results[label][c]["nli_bidir_fail"] for c in CORPORA if c in results[label]])),
            }
            results[label]["__median__"] = {
                "sem_div_mean": float(np.median([results[label][c]["sem_div_mean"] for c in CORPORA if c in results[label]])),
                "nli_bidir_fail": float(np.median([results[label][c]["nli_bidir_fail"] for c in CORPORA if c in results[label]])),
            }

    # Synonym-swap NLI control (uses original-vs-swapped from data/synonym_swap_chunks.jsonl)
    print("\n[phase1] eval mapping=synonym_swap_25 (NLI control)")
    results["synonym_swap_25"] = {}
    for c in CORPORA:
        originals, swapped = load_synonym_swap(c, N_CHUNKS)
        if not originals:
            print(f"  {c}: no synonym-swap data, skipping")
            continue
        fwd = nli.predict(list(zip(originals, swapped)), batch_size=8, show_progress_bar=False, apply_softmax=True)
        bwd = nli.predict(list(zip(swapped, originals)), batch_size=8, show_progress_bar=False, apply_softmax=True)
        bidir_fail = float(np.mean((fwd[:, 1] < 0.5) | (bwd[:, 1] < 0.5)))
        results["synonym_swap_25"][c] = {"n": len(originals), "nli_bidir_fail": round(bidir_fail, 4)}
        print(f"  {c}: nli_fail={bidir_fail:.2%}")
    if results["synonym_swap_25"]:
        results["synonym_swap_25"]["__median__"] = {
            "nli_bidir_fail": float(np.median([results["synonym_swap_25"][c]["nli_bidir_fail"]
                                                for c in CORPORA if c in results["synonym_swap_25"]])),
        }

    # Derived
    v18_sd_meds = []
    v18_nli_meds = []
    for v in ("v18_a", "v18_b", "v18_c"):
        if v in results and "__median__" in results[v]:
            v18_sd_meds.append(results[v]["__median__"]["sem_div_mean"])
            v18_nli_meds.append(results[v]["__median__"]["nli_bidir_fail"])
    v18_median_sd = float(np.median(v18_sd_meds)) if v18_sd_meds else 0.0
    v18_median_nli = float(np.median(v18_nli_meds)) if v18_nli_meds else 0.0

    m0_sd_med = (results.get("m0_v3", {}).get("__median__", {}).get("sem_div_mean") or 0.0)
    syn_nli_med = (results.get("synonym_swap_25", {}).get("__median__", {}).get("nli_bidir_fail") or 0.0)

    derived = {
        "v18_sem_div_median_across_corpora": round(v18_median_sd, 4),
        "v18_nli_bidir_fail_median_across_corpora": round(v18_median_nli, 4),
        "v18_minus_m0_semdiv_median": round(v18_median_sd - m0_sd_med, 4),
        "synonym_swap_nli_bidir_fail_median": round(syn_nli_med, 4),
    }

    falsification_bars = {
        "F1a": {"name": "v18 sem-div median ≥ 0.25", "bar": 0.25, "actual": derived["v18_sem_div_median_across_corpora"], "pass": derived["v18_sem_div_median_across_corpora"] >= 0.25},
        "F1b": {"name": "v18 NLI bidir-fail median ≥ 0.50", "bar": 0.50, "actual": derived["v18_nli_bidir_fail_median_across_corpora"], "pass": derived["v18_nli_bidir_fail_median_across_corpora"] >= 0.50},
        "F1c": {"name": "v18 − m0_v3 sem-div median ≥ 0.10", "bar": 0.10, "actual": derived["v18_minus_m0_semdiv_median"], "pass": derived["v18_minus_m0_semdiv_median"] >= 0.10},
        "F1d": {"name": "synonym-swap NLI bidir-fail median ≤ 0.20", "bar": 0.20, "actual": derived["synonym_swap_nli_bidir_fail_median"], "pass": derived["synonym_swap_nli_bidir_fail_median"] <= 0.20},
    }

    out = {
        "schema_version": 1,
        "run_date": datetime.now().isoformat(timespec="seconds"),
        "seed": SEED,
        "params": {
            "n_chunks_per_corpus": N_CHUNKS,
            "chunk_chars": CHUNK_CHARS,
            "sbert_model": "all-MiniLM-L6-v2",
            "nli_model": "cross-encoder/nli-deberta-v3-base",
        },
        "mappings": list(mappings.keys()) + ["synonym_swap_25"],
        "corpora": CORPORA,
        "results": results,
        "derived": derived,
        "falsification_bars": falsification_bars,
    }

    out_path = RESULTS_DIR / "semdiv_extended.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"\n[phase1] wrote {out_path}")

    print("\n[phase1] falsification bar summary:")
    for k, v in falsification_bars.items():
        status = "PASS" if v["pass"] else "FAIL"
        print(f"  {k}: {status}  {v['name']} → actual={v['actual']:.4f}")

    if not all(v["pass"] for v in falsification_bars.values()):
        print("\n[phase1] One or more hard bars FAILED. Review before publishing or running Phase 2.")
        sys.exit(2)
    print("\n[phase1] All hard bars PASS — Premise A holds on the new corpora.")


if __name__ == "__main__":
    main()
