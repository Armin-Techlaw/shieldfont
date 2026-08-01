#!/usr/bin/env python3
"""smoke_test.py — prove every script in scripts/ still starts and can find the
files it points at. Not a correctness test: a "does smoke come out" test.

WHY THIS EXISTS
  reseed_mapping.py shipped for two days pointing at `benchmarks/v7/data/`, a
  folder that had been reorganised to `benchmark/data/v7/`. Every JS test, the
  font check and the build stayed green the whole time, because nothing in CI
  ever ran a script in this directory. The bug surfaced when an outside
  contributor hit the traceback and opened a PR to fix it (#3).

  A hardcoded path is a *string*. No compiler, linter or type checker looks
  inside it, so a rename breaks it silently and it stays broken until a human
  runs that exact line.

WHAT IT CHECKS
  1. Every script loads — catches syntax errors, bad imports, and failures in
     module-level code (stamp_mapping_meta.py reads MANIFEST.json on import).
  2. Every module-level Path constant aimed inside the repo still resolves.
     Constants naming something a script *writes* (HTML_OUT, OUTPUT_DIR) or a
     cache it fills on demand (FONT_CACHE_DIR) are legitimately absent in a
     fresh clone, so for those only the parent folder must exist — see LENIENT.
  3. Four self-contained scripts actually run, into a temp dir. The other five:
     fix_composite_lsb.py is already exercised by the neighbouring CI step;
     generate_font.py downloads a base font over the network; audit_font.py and
     subset_font.py need a full HarfBuzz/content setup; stamp_mapping_meta.py
     rewrites tracked files, which a test should not do as a side effect.

  It does NOT check that any output is correct — that a mapping conceals well,
  or that a font renders. Crashes and missing files only.

Usage:
  python3 scripts/smoke_test.py
"""
import json
import runpy
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = sorted(p for p in (ROOT / "scripts").glob("*.py")
                 if p.name != Path(__file__).name)

# Constants whose target is produced rather than consumed: require the parent
# folder, not the thing itself. Kept deliberately narrow — anything not matching
# here must exist, so a renamed *file* fails too, not just a renamed folder.
LENIENT = ("_OUT", "OUT_", "OUTPUT", "CACHE", "TMP", "TEMP")

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)
    print(f"  FAIL {msg}")


def load(script: Path) -> dict | None:
    """Execute a script's module-level code and hand back its globals.

    run_name is deliberately not "__main__", so the `if __name__ == "__main__"`
    guard at the foot of each script does not fire and we only run the top.
    sys.argv is neutralised because stamp_mapping_meta.py parses it on import.
    """
    saved_argv, saved_path = sys.argv[:], sys.path[:]
    sys.argv = [str(script)]
    try:
        return runpy.run_path(str(script), run_name="shieldfont_smoke_test")
    except Exception as e:
        fail(f"{script.name} does not load: {type(e).__name__}: {e}")
        return None
    finally:
        sys.argv, sys.path = saved_argv, saved_path


def check_paths(script: Path, ns: dict) -> None:
    for name, value in sorted(ns.items()):
        if name.startswith("_") or not isinstance(value, Path):
            continue
        if not value.is_absolute():
            continue
        try:  # only constants aimed inside the repo; /tmp scratch is not ours
            rel = value.relative_to(ROOT)
        except ValueError:
            continue
        if any(m in name.upper() for m in LENIENT):
            if not value.parent.is_dir():
                fail(f"{script.name}: {name} writes into a folder that does "
                     f"not exist — {rel}")
        elif not value.exists():
            fail(f"{script.name}: {name} points at something that does not "
                 f"exist — {rel}")


def run(label: str, argv: list[str]) -> bool:
    proc = subprocess.run([sys.executable, *argv], capture_output=True,
                          text=True, cwd=ROOT)
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout).strip().splitlines()[-3:]
        fail(f"{label} exited {proc.returncode}: {' / '.join(tail)}")
        return False
    return True


def end_to_end(tmp: Path) -> None:
    pairs = ROOT / "benchmark/data/v7/pairs_v7_alpha_v15_0_1_0_0_0_0.json"
    mapping = tmp / "mapping.json"

    if run("reseed_mapping.py", ["scripts/reseed_mapping.py", "--seed",
                                 "12345", "--out", str(mapping)]):
        m = json.loads(mapping.read_text())
        # every pair must map both ways, or the encoder cannot round-trip
        broken = [s for s, t in m.items() if m.get(t) != s]
        if broken:
            fail(f"reseed_mapping.py: {len(broken)} entries do not map back "
                 f"(e.g. {broken[0]!r})")
        elif len(m) < 1000:
            fail(f"reseed_mapping.py: only {len(m)} entries, expected ~12k")

    if run("build_alpha_mapping.py", ["scripts/build_alpha_mapping.py",
                                      str(pairs), str(mapping)]):
        if len(json.loads(mapping.read_text())) < 1000:
            fail("build_alpha_mapping.py: implausibly small mapping")

    # The font pair runs against a copy of a shipped font. --no-shape skips the
    # HarfBuzz render check; we are asking whether the script runs, not whether
    # the glyphs are right — audit_font.py owns that question.
    src = ROOT / "public/fonts/optik-regular.ttf"
    if not src.is_file():
        fail(f"shipped font missing — {src.relative_to(ROOT)}")
        return
    font = tmp / "font.ttf"
    shutil.copy(src, font)

    run("drop_glyph_names.py", ["scripts/drop_glyph_names.py", str(font),
                                "--out", str(tmp / "dropped.ttf"), "--no-shape"])
    run("stamp_font_version.py", ["scripts/stamp_font_version.py", str(font),
                                  "alpha", "--out", str(tmp / "stamped.ttf"),
                                  "--no-shape"])


def main() -> int:
    print(f"[smoke] {len(SCRIPTS)} scripts in scripts/")

    print("[smoke] loading each script and checking its paths")
    for script in SCRIPTS:
        ns = load(script)
        if ns is not None:
            check_paths(script, ns)

    print("[smoke] running the self-contained scripts for real")
    with tempfile.TemporaryDirectory() as tmp:
        end_to_end(Path(tmp))

    if failures:
        print(f"\n[smoke] FAILED — {len(failures)} problem(s) above")
        return 1
    print("\n[smoke] OK — every script loads, every path resolves")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
