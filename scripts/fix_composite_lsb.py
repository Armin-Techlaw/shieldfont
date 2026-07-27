#!/usr/bin/env python3
"""
Repair the left side bearing on word-ligature composites in an already-built
ShieldFont file.

WHY
    Every word ligature is a composite glyph: the letters of the original word
    placed side by side. `create_composite_glyph()` used to write the glyph's
    hmtx entry as `(advance, 0)` — advance correct, left side bearing hardcoded
    to zero — while the real xMin is the first letter's own side bearing (73
    units for 'h' and 'm', 68 for 'l', 81 for the capitalised cuts).

    lsb is not decorative. Rasterizers size the glyph's raster from
    `(lsb, lsb + xMax - xMin)`. An lsb of 0 on a glyph whose ink starts at 73
    makes that raster 73 units too narrow, and the shortfall comes off the
    RIGHT edge: the last letter of the word loses its final stem. In Chrome
    "human", "makes", "hands" and "learns" all render with the tail of the last
    letter shaved. HarfBuzz and FreeType draw straight from the outline and
    never show it, so shaping-level audits pass on a font that renders wrong.

    Words whose first letter has a small side bearing ('w' at 7, 't' at 19)
    lose almost nothing, which is why the damage looks arbitrary until you sort
    the words by first letter.

    generate_font.py now writes the correct lsb, so freshly built fonts do not
    need this. It exists to repair the fonts already in packages/ without
    paying for a full rebuild of every variant × weight.

USAGE
    python3 scripts/fix_composite_lsb.py IN.ttf OUT.ttf       # ttf or woff2
    python3 scripts/fix_composite_lsb.py --in-place FONT...   # patch in place
    python3 scripts/fix_composite_lsb.py --check FONT...      # report only

Requires: fontTools (plus brotli for woff2).
"""
import sys
from multiprocessing import Pool, cpu_count
from pathlib import Path

from fontTools.ttLib import TTFont


def scan(font):
    """Composites whose lsb disagrees with xMin -> {name: (lsb, xMin)}."""
    glyf, hmtx = font["glyf"], font["hmtx"]
    out = {}
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        if glyph.isComposite() and hmtx[name][1] != glyph.xMin:
            out[name] = (hmtx[name][1], glyph.xMin)
    return out


def _scan_one(path):
    """(path, count, worst) for one file — the unit of work for the pool.

    Reading a font costs ~30s here and there is no shortcut: WOFF2 stores `glyf`
    in transformed form, so getting at any glyph's xMin forces a full
    reconstruction of all ~36k composites no matter how lazily we ask.
    Parallelising across files is the only real lever.
    """
    broken = scan(TTFont(str(path), lazy=True))
    return path, len(broken), max((x - l for l, x in broken.values()), default=0)


def repair(src, dst=None):
    """Set lsb = xMin on every composite. Returns the number changed."""
    # recalcBBoxes=False: the bounding boxes in the file are already correct and
    # recomputing 36k composites is slow. recalcTimestamp=False keeps the head
    # table byte-stable so a no-op repair produces no diff.
    font = TTFont(str(src), lazy=False, recalcBBoxes=False, recalcTimestamp=False)
    broken = scan(font)
    if not broken:
        return 0
    hmtx = font["hmtx"]
    for name, (_lsb, xmin) in broken.items():
        hmtx[name] = (hmtx[name][0], xmin)
    # hhea's minLeftSideBearing / minRightSideBearing / xMaxExtent are derived
    # from hmtx, and fontTools only refreshes them on compile when recalcBBoxes
    # is on — which it deliberately is not here. Recalculate explicitly, or the
    # file ships summary metrics describing the metrics we just replaced.
    font["hhea"].recalc(font)
    font.flavor = "woff2" if str(dst or src).endswith(".woff2") else None
    font.save(str(dst or src))
    return len(broken)


def main(argv):
    args = list(argv)
    check_only = "--check" in args
    in_place = "--in-place" in args
    paths = [Path(a) for a in args if not a.startswith("--")]

    if not paths or (not check_only and not in_place and len(paths) != 2):
        print(__doc__.strip().split("USAGE")[1].strip(), file=sys.stderr)
        return 2

    if check_only or in_place:
        # Gate on whether ANY file had a disagreeing composite, not on the size
        # of the worst one: an lsb ABOVE xMin is also wrong (it shifts the ink
        # right of where the metrics claim) and would net a negative "shaved".
        damaged = 0
        with Pool(min(cpu_count(), len(paths))) as pool:
            # imap keeps input order, so output is deterministic across runs.
            for p, count, worst in pool.imap(_scan_one, paths):
                damaged += bool(count)
                if not count:
                    print(f"[ok]   {p}: composite metrics clean", flush=True)
                elif check_only:
                    print(f"[BAD]  {p}: {count} composites, up to {worst} units shaved",
                          flush=True)
                else:
                    n = repair(p)
                    print(f"[fix]  {p}: {n} composites, up to {worst} units recovered",
                          flush=True)
        return 1 if (check_only and damaged) else 0

    src, dst = paths
    n = repair(src, dst)
    print(f"[fix]  {src} -> {dst}: {n} composites corrected")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
