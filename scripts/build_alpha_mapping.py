#!/usr/bin/env python3
"""build_alpha_mapping.py — flatten the v18 production benchmark mapping into the
flat {src: tgt} form that generate_font.py / the encoder consume.

α (alpha) = v15_0_1_0_0_0_0, seed 42, verbatim. Words come from `all_pairs`; the
digit permutation is added as single-char entries so the font/encoder handle digits
the same way the deployed M15-EN build does.

Usage:
  python3 scripts/build_alpha_mapping.py \
    benchmarks/v7/data/pairs_v7_alpha_v15_0_1_0_0_0_0.json \
    scripts/v18alpha_for_font.json
"""
import json
import sys
from pathlib import Path


def main() -> int:
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    d = json.loads(src.read_text())

    flat: dict[str, str] = {}
    collisions = 0
    for p in d["all_pairs"]:
        s, t = p["src"], p["tgt"]
        if s in flat and flat[s] != t:
            collisions += 1
        flat[s] = t

    digits = d.get("_digit_permutation", {})
    for s, t in digits.items():
        flat[s] = t

    out.write_text(json.dumps(flat, ensure_ascii=False, indent=0))

    # sanity report
    n_words = sum(1 for k in flat if k.isalpha())
    n_digits = sum(1 for k in flat if k.isdigit())
    involution = sum(1 for s, t in flat.items() if flat.get(t) == s)
    print(f"[alpha] source pairs      : {len(d['all_pairs'])}")
    print(f"[alpha] src collisions    : {collisions} (last-write-wins)")
    print(f"[alpha] flat entries      : {len(flat)}  (words={n_words}, digits={n_digits})")
    print(f"[alpha] involution        : {involution}/{len(flat)} "
          f"({100*involution/len(flat):.1f}%)")
    print(f"[alpha] digit permutation : {digits}")
    print(f"[alpha] wrote             : {out}  ({out.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
