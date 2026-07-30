#!/usr/bin/env python3
"""NLI-based meaning-damage metric for v18-a/b/c.

For each (original, encoded) pair across 4 corpora:
  1. Run NLI in both directions: P(entail | orig → enc) and P(entail | enc → orig)
  2. Track bidirectional-entailment-failure rate (= 1 - min(P_entail_fwd, P_entail_bwd))
  3. Track 3-class probabilities for sanity

Reports:
  - per-corpus mean meaning-loss (1 - mean entailment over both directions)
  - bidirectional entailment failure rate (% chunks where either direction P_entail < 0.5)
  - 5 worst-divergence example pairs per variant for the white paper
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np

V7 = Path(__file__).parent.parent
DATA = V7 / "data"
RES = V7 / "results"
sys.path.insert(0, str(V7 / "scripts"))

WORD_RE = re.compile(r"[a-zA-Z]+")
CORPORA = ["wiki", "books", "webtext", "reddit"]


def load_chunks(corpus, n=60):
    p = DATA / "corpora" / f"{corpus}.jsonl"
    out = []
    with p.open() as f:
        for i, line in enumerate(f):
            if i >= n: break
            try:
                t = json.loads(line)["text"][:1200]
                if len(t.strip()) > 200:
                    out.append(t)
            except Exception:
                pass
    return out


def encode_simple(text, mapping):
    def rep(m):
        w = m.group(0)
        sub = mapping.get(w.lower())
        if sub is None: return w
        return sub.capitalize() if w[0].isupper() else sub
    return WORD_RE.sub(rep, text)


def main():
    print("[nli] loading cross-encoder/nli-deberta-v3-base…", flush=True)
    from sentence_transformers import CrossEncoder
    model = CrossEncoder("cross-encoder/nli-deberta-v3-base")
    # Output labels are (CONTRADICTION, ENTAILMENT, NEUTRAL) per the model card.
    LABELS = ["contradiction", "entailment", "neutral"]

    cells = ["v18_a", "v18_b", "v18_c"]
    maps = {}
    for cell in cells:
        d = json.loads((DATA / f"pairs_v7_alpha_{cell}.json").read_text())
        maps[cell] = {p["src"].lower(): p["tgt"] for p in d["all_pairs"]}

    chunks_by_corpus = {c: load_chunks(c, 60) for c in CORPORA}
    print(f"[nli] {sum(len(v) for v in chunks_by_corpus.values())} chunks total per variant")

    results = {}
    examples_by_variant = {cell: [] for cell in cells}

    for cell in cells:
        mapping = maps[cell]
        per_corpus = {}
        for corpus, chunks in chunks_by_corpus.items():
            encoded = [encode_simple(ch, mapping) for ch in chunks]

            # NLI forward (orig → enc): is enc entailed by orig?
            fwd_pairs = list(zip(chunks, encoded))
            # NLI backward (enc → orig)
            bwd_pairs = list(zip(encoded, chunks))

            print(f"  {cell} on {corpus} ({len(chunks)} chunks)…", flush=True)
            fwd_scores = model.predict(fwd_pairs, batch_size=8, show_progress_bar=False, apply_softmax=True)
            bwd_scores = model.predict(bwd_pairs, batch_size=8, show_progress_bar=False, apply_softmax=True)

            # fwd_scores[i] = (P_contra, P_entail, P_neutral)
            P_entail_fwd = fwd_scores[:, 1]
            P_entail_bwd = bwd_scores[:, 1]
            P_contra_fwd = fwd_scores[:, 0]
            P_contra_bwd = bwd_scores[:, 0]

            mean_entail = float(np.mean((P_entail_fwd + P_entail_bwd) / 2))
            mean_loss = 1.0 - mean_entail  # canonical meaning-loss score in [0, 1]

            bidir_failure_rate = float(
                np.mean((P_entail_fwd < 0.5) | (P_entail_bwd < 0.5))
            )
            strong_contradiction_rate = float(
                np.mean((P_contra_fwd > 0.5) | (P_contra_bwd > 0.5))
            )

            # Save per-chunk for example mining
            for i, (orig, enc) in enumerate(fwd_pairs):
                loss = 1.0 - 0.5 * (float(P_entail_fwd[i]) + float(P_entail_bwd[i]))
                examples_by_variant[cell].append({
                    "corpus": corpus,
                    "loss": loss,
                    "P_entail_fwd": float(P_entail_fwd[i]),
                    "P_entail_bwd": float(P_entail_bwd[i]),
                    "P_contra_fwd": float(P_contra_fwd[i]),
                    "P_contra_bwd": float(P_contra_bwd[i]),
                    "orig": orig,
                    "encoded": enc,
                })

            per_corpus[corpus] = {
                "n": len(chunks),
                "mean_entail": mean_entail,
                "mean_meaning_loss": mean_loss,
                "bidir_failure_rate": bidir_failure_rate,
                "strong_contradiction_rate": strong_contradiction_rate,
            }
            print(f"    mean_loss={mean_loss:.3f}  bidir_failure={bidir_failure_rate:.1%}  "
                  f"strong_contradict={strong_contradiction_rate:.1%}", flush=True)

        results[cell] = per_corpus
        # average across corpora
        results[cell]["__avg__"] = {
            "mean_meaning_loss": float(np.mean([per_corpus[c]["mean_meaning_loss"] for c in CORPORA])),
            "bidir_failure_rate": float(np.mean([per_corpus[c]["bidir_failure_rate"] for c in CORPORA])),
            "strong_contradiction_rate": float(np.mean([per_corpus[c]["strong_contradiction_rate"] for c in CORPORA])),
        }

    (RES / "v18_variants_nli.json").write_text(json.dumps(results, indent=2))
    print(f"\n[nli] wrote {RES / 'v18_variants_nli.json'}")

    # Print summary
    print("\n" + "=" * 92)
    print(f"{'cell':<8} " + " ".join(f"{c:>11}" for c in CORPORA) + f"  {'avg loss':>10}  {'bidir fail%':>12}  {'contradict%':>13}")
    print("-" * 110)
    for cell in cells:
        avg = results[cell]["__avg__"]
        per_corpus_loss = "  ".join(f"{results[cell][c]['mean_meaning_loss']:>9.3f}" for c in CORPORA)
        print(f"{cell:<8} {per_corpus_loss}    {avg['mean_meaning_loss']:>8.3f}    {avg['bidir_failure_rate']:>10.1%}    {avg['strong_contradiction_rate']:>11.1%}")

    # ── Extract worst-divergence examples per variant ──
    print("\n\n" + "=" * 92)
    print("EXAMPLE PAIRS (most semantically divergent — sorted by meaning-loss score)")
    print("=" * 92)
    examples_summary = {}
    for cell in cells:
        pool = sorted(examples_by_variant[cell], key=lambda r: -r["loss"])
        # Take 3 from top (highest meaning loss) and 2 from bottom (lowest meaning loss)
        top = pool[:3]
        bot = pool[-2:]
        examples_summary[cell] = {"high_loss": top, "low_loss": bot}
        print(f"\n— {cell.replace('_','-')} — top 3 high-loss pairs:")
        for ex in top:
            print(f"\n  [corpus={ex['corpus']}  loss={ex['loss']:.3f}  "
                  f"P_entail_fwd={ex['P_entail_fwd']:.2f}  P_entail_bwd={ex['P_entail_bwd']:.2f}]")
            print(f"  ORIG: {ex['orig'][:300]}{'…' if len(ex['orig']) > 300 else ''}")
            print(f"  ENC:  {ex['encoded'][:300]}{'…' if len(ex['encoded']) > 300 else ''}")
        print(f"\n— {cell.replace('_','-')} — bottom 2 (low loss = meaning preserved):")
        for ex in bot:
            print(f"\n  [corpus={ex['corpus']}  loss={ex['loss']:.3f}  "
                  f"P_entail_fwd={ex['P_entail_fwd']:.2f}  P_entail_bwd={ex['P_entail_bwd']:.2f}]")
            print(f"  ORIG: {ex['orig'][:300]}{'…' if len(ex['orig']) > 300 else ''}")
            print(f"  ENC:  {ex['encoded'][:300]}{'…' if len(ex['encoded']) > 300 else ''}")

    (RES / "v18_variants_nli_examples.json").write_text(json.dumps(examples_summary, indent=2))


if __name__ == "__main__":
    main()
