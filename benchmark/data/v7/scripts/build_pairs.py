#!/usr/bin/env python3
"""ShieldFont v7 — Phase 1 pair-building pipeline.

5-stage end-to-end build:
  1A. source words from wordfreq.top_n_list(en, 10k) − v3 blacklists − non-content POS
  1B. subcategorize each survivor into a bucket (noun/verb/adj/adv subtype)
  1C. random pairing within each bucket (bijective derangement)
  1D. filter — Numberbatch cosine band + WordNet synonym/antonym/hypernym/derivation/inflection/POS rejects
  1E. write pairs_v7_alpha.json + sentences_v7_alpha.txt sample

NO LLM judgment in any step. All decisions come from data: wordfreq, WordNet,
Brysbaert concreteness, VerbNet, Numberbatch, spaCy en_core_web_sm.

Run with a checkout of the development repository's v3/v6/v7 benchmark
trees as siblings (not shipped in this lean release — see README.md §3):
  <dev-repo>/benchmarks/v3/.venv/bin/python \
      <dev-repo>/benchmarks/v7/scripts/build_pairs.py
"""
from __future__ import annotations

import json
import random
import re
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional

# ── Paths ────────────────────────────────────────────────────────────
# Assumes the original dev-repo layout: this script sits at
# <dev-repo>/benchmarks/v7/scripts/, with the v3 and v6 benchmark rounds
# as sibling directories under the same <dev-repo>/benchmarks/ root.
BENCHMARKS_ROOT = Path(__file__).resolve().parents[2]
V7_DIR = BENCHMARKS_ROOT / "v7"
V3_DIR = BENCHMARKS_ROOT / "v3"
V6_DIR = BENCHMARKS_ROOT / "v6"
DATA_OUT = V7_DIR / "data"
DATA_OUT.mkdir(exist_ok=True)

# Set at runtime by main() via --version flag
SUFFIX = ""

# ── Special pairs (digit / month / day / time / ordinal) ──────────────
# Bidirectional bijective derangements added unconditionally to the v7-alpha
# mapping (they bypass the cosine + WordNet filter; they're not cohyponyms).

MONTH_PAIRS = {  # shift by 6 months — bidirectional pairs
    "january": "july", "july": "january",
    "february": "august", "august": "february",
    "march": "september", "september": "march",
    "april": "october", "october": "april",
    "may": "november", "november": "may",
    "june": "december", "december": "june",
}
DAY_PAIRS = {  # 6 days, 3 bidirectional pairs (sunday dropped — odd count)
    "monday": "thursday", "thursday": "monday",
    "tuesday": "friday", "friday": "tuesday",
    "wednesday": "saturday", "saturday": "wednesday",
    # sunday: unmapped (no pair partner)
}
TIME_PAIRS = {  # 6-element bijective shuffle of common time words
    "yesterday": "tomorrow", "tomorrow": "yesterday",
    "today": "later", "later": "today",
    "soon": "eventually", "eventually": "soon",
}
ORDINAL_PAIRS = {  # shift by 6 — bidirectional
    "first": "seventh", "seventh": "first",
    "second": "eighth", "eighth": "second",
    "third": "ninth", "ninth": "third",
    "fourth": "tenth", "tenth": "fourth",
    "fifth": "eleventh", "eleventh": "fifth",
    "sixth": "twelfth", "twelfth": "sixth",
}
# Digit permutation — 5 bidirectional pairs (offset 5). Applied char-by-char
# in the encoder; not a word-level pair so won't go through the regex.
# Phase G3 (v10+): preserve year prefixes — keep 1 and 2 fixed (so 1990 / 2024
# stay as 1990 / 2024 in their first digit). Swap remaining 8 digits in 4 pairs.
DIGIT_PERM = {"0": "5", "5": "0",
              "3": "8", "8": "3",
              "4": "9", "9": "4",
              "6": "7", "7": "6"}

# Phase G4 (v10+): written number pairs — parallel to digit perm, plus magnitudes.
# Bidirectional. Bypasses cosine + WordNet filter (these are special).
NUMBER_WORD_PAIRS = {
    # parallel to digit perm (one and two unchanged)
    "zero": "five",      "five": "zero",
    "three": "eight",    "eight": "three",
    "four": "nine",      "nine": "four",
    "six": "seven",      "seven": "six",
    # tens
    "ten": "twenty",     "twenty": "ten",
    "thirty": "eighty",  "eighty": "thirty",
    "forty": "ninety",   "ninety": "forty",
    "fifty": "seventy",  "seventy": "fifty",
    # magnitudes
    "hundred": "thousand", "thousand": "hundred",
    "million": "billion",  "billion": "million",
}

# Phase D3 — function-word pairs (v8+). Swap within syntactic category so the
# substitution preserves grammatical role even though semantics change.
# Pairs are bidirectional. Bypass cosine + WordNet filter.
FUNCTION_PAIRS = {
    # coordinating conjunctions
    "and": "or",         "or": "and",
    "but": "nor",        "nor": "but",
    "so": "yet",         "yet": "so",
    # common subordinators
    "if": "while",       "while": "if",
    "because": "although", "although": "because",
    "though": "since",   "since": "though",
    # core prepositions (paired so syntactic frame stays valid)
    "in": "on",          "on": "in",
    "at": "by",          "by": "at",
    "with": "from",      "from": "with",
    "of": "to",          "to": "of",
    "for": "as",         "as": "for",
    "into": "onto",      "onto": "into",
    # spatial / relational prepositions
    "above": "below",    "below": "above",
    "before": "after",   "after": "before",
    "against": "besides", "besides": "against",
    "through": "across", "across": "through",
    # quantifiers / determiners (with mutual grammatical compatibility)
    "many": "few",       "few": "many",
    "all": "some",       "some": "all",
    "every": "any",      "any": "every",
    # discourse / focus
    "always": "never",   "never": "always",
    "often": "rarely",   "rarely": "often",
    "ever": "seldom",    "seldom": "ever",
}

# Reuse v3's vote_pos / vote_verb_inflection + blacklists + encode_text
sys.path.insert(0, str(V3_DIR))
sys.path.insert(0, str(V3_DIR / "mappings"))

import build_m11  # type: ignore
from build_m11 import (  # type: ignore
    STATIC_BLACKLIST,
    BRAND_ABBREV_BLACKLIST,
    PROPER_NOUN_BLACKLIST,
    PROFANITY,
    MEASUREMENT_UNITS,
    vote_pos,
    vote_verb_inflection,
)
from prepare_data import encode_text  # type: ignore

import numpy as np
import wordfreq

# ── Config ───────────────────────────────────────────────────────────
SEED = 42
TOP_N = 10_000
MIN_BUCKET_SIZE = 4

# Cosine: only an UPPER bound (rejects synonyms). Lower bound disabled per user
# direction — strangers (low cosine) preserve grammar + destroy semantics, which
# is the H1/H3 sweet spot. KenLM is the corpus-level naturalness check.
COSINE_LOW = -1.0  # effectively disabled (cosine is always > -1)
COSINE_HIGH = 0.80

# Phase A vetoes (v5+):
ZIPF_SHIFT_MAX = 99.0     # disabled v6+ per user; was 0.5 in v5 (overly aggressive on coverage)
NN_REJECT_K = 50          # reject if tgt in top-K cosine NN of src in pool

# Phase B vetoes (v6+):
POS_PURITY_MIN = 0.80     # reject word if its bucket-POS share in Brown < this

# Phase G6 (v10+): VerbNet frame intersection requires Jaccard ≥ this (was "≥1 shared")
FRAME_JACCARD_MIN = 0.4

# Phase C recovery (v7+):
RECOVERY_ITERS = 8        # additional shuffle/filter rounds for unmatched words
CROSS_BUCKET_ENABLED = False  # disabled v8 redo: cross-bucket grouping by WN POS
                              # ignored finer constraints (degree, supersense) and
                              # leaked higher↔collaborative, men↔hundreds. Acceptable
                              # cost: ~330 fewer pairs (online stays unmatched).

# Phase D3 (function pairs) toggle — disabled v8 redo per user request
FUNCTION_PAIRS_ENABLED = False

_EMPTY_SET: set[str] = set()

# Brysbaert concreteness tier thresholds (1-5 scale; spec says ≥4 / ≥3 / else)
CONC_HIGH = 4.0
CONC_MID = 3.0

CONTENT_POS = {"NOUN", "VERB", "ADJ", "ADV"}

# Words spaCy may tag as content but are pronouns/articles/modals etc.
DO_NOT_SWAP = {
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "its", "our", "their", "mine", "yours", "hers", "ours", "theirs",
    "the", "a", "an",
    "this", "that", "these", "those",
    "and", "or", "but", "nor", "so", "yet", "for",
    "of", "in", "on", "at", "to", "by", "with", "from", "as", "into", "onto",
    "what", "which", "who", "whom", "whose", "where", "when", "why", "how",
    "if", "while", "because", "although", "though",
    "be", "is", "are", "was", "were", "been", "being", "am",
    "have", "has", "had", "having",
    "do", "does", "did", "doing", "done",
    "will", "would", "shall", "should",
    "can", "could", "may", "might", "must", "ought",
    "not", "no",
    "very", "much", "many", "more", "most", "less", "least",
    "all", "any", "some", "few", "every", "each", "none",
    "always", "never", "ever", "sometimes", "often", "rarely", "seldom", "usually",
}

# ──────────────────────────────────────────────────────────────────────
# 1A — Source words
# ──────────────────────────────────────────────────────────────────────

def is_filtered(w: str) -> bool:
    if len(w) < 2:
        return True
    if not w.isalpha():
        return True
    if w in STATIC_BLACKLIST:
        return True
    if w in BRAND_ABBREV_BLACKLIST:
        return True
    if w in PROPER_NOUN_BLACKLIST:
        return True
    if w in PROFANITY:
        return True
    if w in MEASUREMENT_UNITS:
        return True  # spec says drop measurement units (own bucket in v3; v7 omits)
    if w in DO_NOT_SWAP:
        return True
    return False


def load_source_words(top_n: int = TOP_N) -> list[str]:
    raw = wordfreq.top_n_list("en", top_n)
    keep = [w for w in raw if not is_filtered(w)]
    print(f"[1A] wordfreq top-{top_n} → {len(keep)} after blacklist filter", flush=True)
    return keep


def expand_paradigms(words: list[str], nlp) -> list[str]:
    """Phase H7 (v11): expand each word into its full paradigm.

    For each word, derive its lemma + paradigm forms (NN/NNS, JJ/JJR/JJS,
    VB/VBP/VBZ/VBD/VBN/VBG) via pyinflect. Add forms not already present.
    Forms still pass through all subsequent filters (POS purity, proper-noun,
    no-WN-synset, etc.) so junk doesn't survive.

    Decorrelation comes from re-running pair_within_buckets on the expanded
    pool: each surface form gets a random bucket-mate. No consistent
    lemma→lemma map traceable across paradigm forms.
    """
    import pyinflect  # noqa: F401  (registers spaCy extension)
    PARADIGMS = (
        ("NN", "NNS"),
        ("JJ", "JJR", "JJS"),
        ("VB", "VBP", "VBZ", "VBD", "VBN", "VBG"),
    )
    seen = set(words)
    extras: list[str] = []
    for w in list(words):
        try:
            doc = nlp(w)
        except Exception:
            continue
        if not doc:
            continue
        tok = doc[0]
        for paradigm in PARADIGMS:
            for tag in paradigm:
                try:
                    form = tok._.inflect(tag)
                except Exception:
                    form = None
                if form and form.lower() not in seen and form.isalpha() and len(form) > 1:
                    seen.add(form.lower())
                    extras.append(form.lower())
    print(f"[1A+] paradigm expansion: +{len(extras)} new surface forms "
          f"({len(words)} → {len(words) + len(extras)} total)", flush=True)
    return words + extras


# ──────────────────────────────────────────────────────────────────────
# 1B — Subcategorize
# ──────────────────────────────────────────────────────────────────────

def load_brysbaert() -> dict[str, float]:
    path = V6_DIR / "data" / "brysbaert_concreteness.tsv"
    if not path.exists():
        sys.exit(f"FATAL: Brysbaert not found at {path}")
    out: dict[str, float] = {}
    with path.open() as f:
        header = f.readline()
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            try:
                out[parts[0].lower()] = float(parts[2])
            except ValueError:
                continue
    print(f"[data] loaded Brysbaert: {len(out):,} concreteness ratings", flush=True)
    return out


def concreteness_tier(word: str, conc: dict[str, float]) -> str:
    c = conc.get(word)
    if c is None:
        return "unknown"
    if c >= CONC_HIGH:
        return "concrete"
    if c >= CONC_MID:
        return "mid"
    return "abstract"


def noun_supersense(wn, word: str) -> Optional[str]:
    syns = wn.synsets(word, pos="n")
    if not syns:
        return None
    return syns[0].lexname()  # e.g., "noun.person", "noun.artifact"


def adverb_supersense(wn, word: str) -> Optional[str]:
    syns = wn.synsets(word, pos="r")
    if not syns:
        return None
    return syns[0].lexname()


def verbnet_transitivity(verbnet, word: str) -> str:
    """Look up word in VerbNet; classify as transitive/intransitive/ditransitive."""
    classids = verbnet.classids(word)
    if not classids:
        return "unknown"
    counts = Counter()
    for cid in classids:
        try:
            frames = verbnet.frames(cid)
        except Exception:
            continue
        for f in frames:
            syntax = f.get("syntax", [])
            # NP V NP NP / NP V NP PP NP -> ditransitive
            # NP V NP -> transitive
            # NP V (no NP after V) -> intransitive
            v_idx = None
            for i, s in enumerate(syntax):
                if s.get("pos_tag") == "VERB":
                    v_idx = i
                    break
            if v_idx is None:
                continue
            after = syntax[v_idx + 1:]
            np_after = sum(1 for s in after if s.get("pos_tag") == "NP")
            if np_after >= 2:
                counts["ditransitive"] += 1
            elif np_after == 1:
                counts["transitive"] += 1
            else:
                counts["intransitive"] += 1
    if not counts:
        return "unknown"
    return counts.most_common(1)[0][0]


def spacy_transitivity_fallback(nlp, word: str) -> str:
    """If VerbNet has nothing: try `I <verb> the X` and check for direct object."""
    sentence = f"I {word} the box."
    try:
        doc = nlp(sentence)
    except Exception:
        return "unknown"
    for tok in doc:
        if tok.text.lower() == word.lower() and tok.pos_ == "VERB":
            for child in tok.children:
                if child.dep_ in ("dobj", "obj"):
                    return "transitive"
            return "intransitive"
    return "unknown"


def adjective_gradability(word: str) -> str:
    """Gradable if the comparative ('-er') or 'very <adj>' has reasonable wordfreq."""
    # Check 'very <w>' as a bigram is awkward; use a simple heuristic:
    # comparative form (<word>er) + superlative (<word>est) frequency.
    er = word + "er" if not word.endswith("e") else word + "r"
    est = word + "est" if not word.endswith("e") else word + "st"
    z_er = wordfreq.zipf_frequency(er, "en")
    z_est = wordfreq.zipf_frequency(est, "en")
    if z_er >= 2.5 or z_est >= 2.5:
        return "gradable"
    return "non_gradable"


def adj_degree(nlp, word: str) -> str:
    """Return 'pos' / 'cmp' / 'sup' for adjective.

    Uses spaCy Penn tag in template; falls back to surface heuristic.
    """
    sent = f"It is {word}."
    try:
        doc = nlp(sent)
        for tok in doc:
            if tok.text.lower() == word.lower():
                if tok.tag_ == "JJR":
                    return "cmp"
                if tok.tag_ == "JJS":
                    return "sup"
                if tok.tag_ == "JJ":
                    return "pos"
                break
    except Exception:
        pass
    # Surface fallback (catches words spaCy doesn't recognize)
    if word.endswith("est") and len(word) >= 5:
        return "sup"
    if word.endswith("er") and len(word) >= 4:
        # rough heuristic — confirm with WordNet that base form exists as adj
        from nltk.corpus import wordnet as _wn
        base = word[:-2]
        if base.endswith("i"):
            base = base[:-1] + "y"
        if any(s.pos() in ("a", "s") for s in _wn.synsets(base)):
            return "cmp"
    return "pos"


def vote_verb_inflection_set(nlp, word: str) -> frozenset[str]:
    """Return frozenset of plausible Penn tags for the surface verb form.

    Uses pyinflect (spaCy extension) to enumerate the verb's full paradigm and
    return every Penn tag whose canonical form == word. This is the lexical
    answer (what tags can this surface form bear?), not the contextual answer
    (what tag does spaCy assign in template X?).

    nominated → {VBD, VBN} (regular -ed: same form for both)
    came      → {VBD}      (past participle of 'come' is 'come', not 'came')
    walked    → {VBD, VBN} (regular)
    taken     → {VBN}      (past tense of 'take' is 'took')
    """
    import pyinflect  # noqa: F401  — registers spaCy extension
    try:
        doc = nlp(word)
    except Exception:
        return frozenset({"VB"})
    if not doc:
        return frozenset({"VB"})
    tok = doc[0]
    tags = ("VB", "VBP", "VBZ", "VBD", "VBN", "VBG")
    matches: set[str] = set()
    for tag in tags:
        try:
            form = tok._.inflect(tag)
        except Exception:
            form = None
        if form and form.lower() == word.lower():
            matches.add(tag)
    if not matches:
        # pyinflect couldn't resolve — fall back to single-tag guess from spaCy
        try:
            doc2 = nlp(f"They {word} together.")
            for t in doc2:
                if t.text.lower() == word.lower() and t.tag_.startswith("VB"):
                    return frozenset({t.tag_})
        except Exception:
            pass
        return frozenset({"VB"})
    return frozenset(matches)


def is_count_noun(word: str) -> str:
    """Heuristic: if `<word>s` has zipf ≥ 2.0, treat as count; else mass."""
    plural = word + "s" if not word.endswith("s") else word + "es"
    z = wordfreq.zipf_frequency(plural, "en")
    if z >= 2.0:
        return "count"
    return "mass"


_proper_noun_cache: Optional[set[str]] = None


def get_proper_noun_set() -> set[str]:
    """Combined NLTK names corpus (male+female) + gazetteers (countries, US states/cities)."""
    global _proper_noun_cache
    if _proper_noun_cache is None:
        from nltk.corpus import names, gazetteers
        s = set(n.lower() for n in names.words("male.txt") + names.words("female.txt"))
        try:
            for f in gazetteers.fileids():
                s.update(g.lower() for g in gazetteers.words(f))
        except Exception:
            pass
        _proper_noun_cache = s
    return _proper_noun_cache


def is_proper_noun(word: str) -> bool:
    """Word is in NLTK names or gazetteers corpus (proper-noun homograph filter).

    Catches names/places (caroline, chad, emily, paris, china) regardless of
    whether spaCy/WordNet mis-classifies them. Curated NLTK data, not handcrafted.
    """
    return word.lower() in get_proper_noun_set()


# ── Phase B1 — POS purity (Brown corpus + WordNet multi-POS) ────────

def load_brown_pos_distribution():
    """Load Brown corpus universal POS tag distribution: word -> {POS: count}."""
    from nltk.corpus import brown
    dist: dict[str, dict[str, int]] = {}
    for w, t in brown.tagged_words(tagset="universal"):
        wl = w.lower()
        if wl not in dist:
            dist[wl] = {}
        dist[wl][t] = dist[wl].get(t, 0) + 1
    return dist


def brown_pos_share(brown_dist, word: str, bucket_pos: str) -> Optional[float]:
    """Share of word's Brown corpus uses tagged as bucket_pos. None if not in Brown."""
    d = brown_dist.get(word.lower())
    if not d:
        return None
    total = sum(d.values())
    if total == 0:
        return None
    return d.get(bucket_pos, 0) / total


def wn_multi_pos_problem(wn, word: str, bucket_pos_wn: str, min_synsets: int = 4) -> bool:
    """True if word has ≥ min_synsets synsets in 2+ different POS in WordNet.

    Catches words like 'form' (16 noun + 7 verb) that are dictionary-attested
    in multiple POS regardless of corpus distribution. Treats satellite-adj
    ('s') as same POS as 'a'.
    """
    pos_counts: Counter = Counter()
    for s in wn.synsets(word):
        p = s.pos()
        if p == "s":
            p = "a"
        pos_counts[p] += 1
    if len(pos_counts) < 2:
        return False
    significant = [p for p, n in pos_counts.items() if n >= min_synsets]
    return len(significant) >= 2


# Map from our bucket POS labels to (Brown universal POS, WN POS char)
_BUCKET_TO_BROWN = {"NOUN": "NOUN", "VERB": "VERB", "ADJ": "ADJ", "ADV": "ADV"}
_BUCKET_TO_WN = {"NOUN": "n", "VERB": "v", "ADJ": "a", "ADV": "r"}


def check_pos_purity(brown_dist, wn, word: str, bucket_pos: str,
                      min_synsets: int = 4) -> Optional[dict]:
    """Run all POS-purity gates against word; return reject reason dict, or None.

    Shared between subcategorize (build_pairs) and cluster_inflections (post-process).
    """
    # Phase G7: no WordNet entry at all → likely abbreviation / slang / non-word
    syns = wn.synsets(word)
    if not syns:
        return {"reason": "no_wordnet_entry"}
    # Brown share gate (if available)
    if brown_dist is not None:
        share = brown_pos_share(brown_dist, word, _BUCKET_TO_BROWN.get(bucket_pos, bucket_pos))
        if share is not None and share < POS_PURITY_MIN:
            return {"reason": "brown_share_low", "share": round(share, 3)}
    # WordNet multi-POS gate
    if wn_multi_pos_problem(wn, word, _BUCKET_TO_WN.get(bucket_pos, "n"),
                            min_synsets=min_synsets):
        return {"reason": "wn_multi_pos"}
    return None


# ── Phase B2 — VerbNet frame signatures ──────────────────────────────

def verb_frame_signatures(verbnet, nlp, word: str,
                          lemma_cache: Optional[dict[str, str]] = None) -> set[str]:
    """Return set of frame signatures (e.g. 'NP_VERB_NP', 'NP_VERB_NP_PREP_NP') for verb.

    Looks up word directly; falls back to spaCy lemma if direct lookup empty.
    """
    sigs: set[str] = set()
    seen_classes: set[str] = set()
    keys = [word]
    if lemma_cache is not None:
        if word not in lemma_cache:
            try:
                lemma_cache[word] = nlp(word)[0].lemma_.lower()
            except Exception:
                lemma_cache[word] = word
        if lemma_cache[word] != word:
            keys.append(lemma_cache[word])
    else:
        try:
            lem = nlp(word)[0].lemma_.lower()
            if lem != word:
                keys.append(lem)
        except Exception:
            pass
    for key in keys:
        for cid in verbnet.classids(key):
            if cid in seen_classes:
                continue
            seen_classes.add(cid)
            try:
                frames = verbnet.frames(cid)
            except Exception:
                continue
            for f in frames:
                syn = f.get("syntax", [])
                sig = "_".join(s.get("pos_tag", "?") for s in syn)
                if sig:
                    sigs.add(sig)
    return sigs


# Standard linguistic data — irregular plurals (used as fallback when spaCy
# morph features are inconclusive on a single-token input).
IRREG_PLURALS = {
    "people", "men", "women", "children", "feet", "teeth",
    "mice", "geese", "criteria", "phenomena", "indices", "data",
    "media", "alumni", "fungi", "cacti", "oxen", "knives",
    "lives", "wives", "wolves", "leaves", "loaves", "halves",
    "selves", "shelves", "thieves", "calves", "elves",
}
IRREG_SINGULARS = {
    "person", "man", "woman", "child", "foot", "tooth",
    "mouse", "goose", "criterion", "phenomenon", "index", "datum",
    "medium", "alumnus", "fungus", "cactus", "ox", "knife",
    "life", "wife", "wolf", "leaf", "loaf", "half",
    "self", "shelf", "thief", "calf", "elf",
}


def noun_number(nlp, word: str) -> str:
    """Return 'sing', 'plur', or 'unk' for noun word.

    Layered: irregular list → spaCy morph in template → regular -s heuristic.
    Pure data; no per-failure exceptions.
    """
    w = word.lower()
    if w in IRREG_PLURALS:
        return "plur"
    if w in IRREG_SINGULARS:
        return "sing"
    # spaCy morph in determiner templates
    sing_doc = nlp(f"the {w} is here")
    plur_doc = nlp(f"the {w} are here")
    sing_num = None
    plur_num = None
    for tok in sing_doc:
        if tok.text.lower() == w:
            n = tok.morph.get("Number")
            sing_num = n[0] if n else None
            break
    for tok in plur_doc:
        if tok.text.lower() == w:
            n = tok.morph.get("Number")
            plur_num = n[0] if n else None
            break
    if sing_num == "Sing" and plur_num != "Plur":
        return "sing"
    if plur_num == "Plur" and sing_num != "Sing":
        return "plur"
    # Regular -s plural heuristic with wordfreq sanity check
    if w.endswith("ies") and len(w) > 3:
        sing_form = w[:-3] + "y"
        if wordfreq.zipf_frequency(sing_form, "en") >= 2.0:
            return "plur"
    if w.endswith("es") and len(w) > 2:
        sing_form = w[:-2]
        if wordfreq.zipf_frequency(sing_form, "en") >= 2.0:
            return "plur"
    if w.endswith("s") and not w.endswith("ss") and len(w) > 1:
        sing_form = w[:-1]
        if wordfreq.zipf_frequency(sing_form, "en") >= 2.0:
            return "plur"
    return "sing"  # default to singular when ambiguous (mass/uncountable nouns)


def subcategorize(words: list[str], nlp, wn, verbnet, conc: dict[str, float],
                  brown_dist: Optional[dict] = None):
    """Return (buckets dict, per_word dict, verb_sigs dict, purity_rejects).

    buckets: name -> [word]; per_word: word -> meta; verb_sigs: verb -> set[frame-sig].
    purity_rejects: list of dicts for words filtered out by Phase B1.
    """
    buckets: dict[str, list[str]] = defaultdict(list)
    per_word: dict[str, dict] = {}
    verb_sigs: dict[str, set[str]] = {}
    purity_rejects: list[dict] = []
    pos_counts = Counter()
    n = len(words)
    t0 = time.time()
    lemma_cache: dict[str, str] = {}
    for i, w in enumerate(words):
        pos = vote_pos(nlp, w)
        pos_counts[pos] += 1
        if pos not in CONTENT_POS:
            continue

        # Proper-noun filter (catches names/places that WN/spaCy mis-classify)
        if is_proper_noun(w):
            purity_rejects.append({
                "word": w, "bucket_pos": pos, "reason": "proper_noun",
            })
            continue

        # Phase B1 + G7: unified POS purity (Brown share + WN multi-POS + no-synset)
        purity_problem = check_pos_purity(brown_dist, wn, w, pos)
        if purity_problem is not None:
            purity_rejects.append({"word": w, "bucket_pos": pos, **purity_problem})
            continue
        z = wordfreq.zipf_frequency(w, "en")
        meta = {"word": w, "pos": pos, "zipf": round(z, 3)}

        bucket: str
        if pos == "NOUN":
            wn_syns = wn.synsets(w, pos="n")
            v_syns = wn.synsets(w, pos="v")
            # GERUND BUCKET special-case for nouns (only -ing words bucketed as NOUN by spaCy)
            if w.endswith("ing") and wn_syns and v_syns:
                bucket = "verb.gerund_ambiguous"
            else:
                supersense = noun_supersense(wn, w)
                tier = concreteness_tier(w, conc)
                number = noun_number(nlp, w)
                if supersense is None:
                    bucket = f"noun.misc.{tier}.{number}"
                else:
                    bucket = f"{supersense}.{tier}.{number}"
                meta["supersense"] = supersense
                meta["concreteness"] = tier
                meta["countability"] = is_count_noun(w)
                meta["number"] = number
        elif pos == "VERB":
            wn_syns = wn.synsets(w, pos="v")
            n_syns = wn.synsets(w, pos="n")
            if w.endswith("ing") and wn_syns and n_syns:
                bucket = "verb.gerund_ambiguous"
            else:
                # Phase D2: tag-set instead of single tag
                tag_set = vote_verb_inflection_set(nlp, w)
                tag_label = "_".join(sorted(tag_set))  # e.g. "VBD" or "VBD_VBN"
                trans = verbnet_transitivity(verbnet, w)
                if trans == "unknown":
                    trans = spacy_transitivity_fallback(nlp, w)
                bucket = f"verb.{trans}.{tag_label}"
                meta["tag_set"] = sorted(tag_set)
                meta["transitivity"] = trans
            # Phase B2: collect VerbNet frame signatures for downstream filter
            sigs = verb_frame_signatures(verbnet, nlp, w, lemma_cache=lemma_cache)
            if sigs:
                verb_sigs[w] = sigs
                meta["frame_sigs"] = sorted(sigs)
        elif pos == "ADJ":
            grad = adjective_gradability(w)
            # Phase D1: adj degree split (Pos/Cmp/Sup)
            degree = adj_degree(nlp, w)
            bucket = f"adj.{grad}.{degree}"
            meta["gradability"] = grad
            meta["degree"] = degree
        elif pos == "ADV":
            ss = adverb_supersense(wn, w)
            bucket = f"adv.{ss}" if ss else "adv.misc"
            meta["supersense"] = ss
        else:  # pragma: no cover (filtered above)
            continue

        meta["bucket"] = bucket
        buckets[bucket].append(w)
        per_word[w] = meta

        if (i + 1) % 1000 == 0:
            elapsed = time.time() - t0
            print(f"  ...{i+1}/{n} POS-tagged ({elapsed:.0f}s)", flush=True)

    print(f"[1B] POS distribution: {dict(pos_counts.most_common())}", flush=True)
    print(f"[1B] {len(buckets)} buckets; total content words = {sum(len(v) for v in buckets.values())}", flush=True)
    if purity_rejects:
        by_reason = Counter(r["reason"] for r in purity_rejects)
        print(f"[1B] POS purity rejects: {len(purity_rejects)} ({dict(by_reason)})", flush=True)
    if verb_sigs:
        print(f"[1B] {len(verb_sigs)} verbs with VerbNet frame signatures", flush=True)
    return buckets, per_word, verb_sigs, purity_rejects


# ──────────────────────────────────────────────────────────────────────
# 1C — Random pairing within bucket
# ──────────────────────────────────────────────────────────────────────

def pair_within_buckets(buckets: dict[str, list[str]], seed: int = SEED,
                        pairwise: bool = True, min_size: int = MIN_BUCKET_SIZE):
    """For each bucket: random pairwise matching (each word maps to exactly one
    other, and that other maps back). Odd-sized buckets drop one word.

    pairwise=True (default): emits BOTH directions per pair → mapping is bidirectional.
    pairwise=False: legacy random-cycle behavior (one direction per word).

    Returns list of (src, tgt, bucket) candidate tuples.
    """
    rng = random.Random(seed)
    candidates: list[tuple[str, str, str]] = []
    skipped = 0
    n_dropped_odd = 0
    for bucket, words in buckets.items():
        if len(words) < min_size:
            skipped += 1
            continue
        shuffled = list(words)
        rng.shuffle(shuffled)
        if pairwise:
            n = len(shuffled)
            if n % 2 == 1:
                n -= 1
                n_dropped_odd += 1
            for i in range(0, n, 2):
                a, b = shuffled[i], shuffled[i + 1]
                if a == b:
                    continue
                candidates.append((a, b, bucket))
                candidates.append((b, a, bucket))
        else:
            original = list(words)
            for i, (s, t) in enumerate(zip(original, shuffled)):
                if s == t:
                    j = (i + 1) % len(shuffled)
                    shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
            for s, t in zip(original, shuffled):
                if s == t:
                    continue
                candidates.append((s, t, bucket))
    mode = "pairwise (bidirectional)" if pairwise else "cycle"
    print(f"[1C] {len(candidates)} candidate pairs across {len(buckets) - skipped} buckets "
          f"(skipped {skipped} buckets w/ <{min_size} words; "
          f"mode={mode}; dropped {n_dropped_odd} odd-bucket leftovers)", flush=True)
    return candidates


# ──────────────────────────────────────────────────────────────────────
# 1D — Filter (cosine band + WordNet/inflection rejects)
# ──────────────────────────────────────────────────────────────────────

class NumberbatchEmbedder:
    """Loads numberbatch_en.tsv into a normalized matrix; provides cosine(a,b)."""

    def __init__(self, path: Path):
        if not path.exists():
            sys.exit(f"FATAL: Numberbatch not found at {path}")
        print(f"[data] loading Numberbatch from {path} ...", flush=True)
        words: list[str] = []
        rows: list[list[float]] = []
        with path.open() as f:
            first = f.readline().split()
            if len(first) == 2:
                pass  # header
            elif first and first[0].isalpha():
                words.append(first[0])
                rows.append([float(x) for x in first[1:]])
            for line in f:
                parts = line.split()
                if len(parts) < 2 or not parts[0].isalpha():
                    continue
                words.append(parts[0])
                rows.append([float(x) for x in parts[1:]])
        self.matrix = np.asarray(rows, dtype=np.float32)
        norms = np.linalg.norm(self.matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1e-8
        self.normalized = self.matrix / norms
        self.idx = {w: i for i, w in enumerate(words)}
        print(f"  loaded {len(words):,} vectors ({self.matrix.shape})", flush=True)

    def cosine(self, a: str, b: str) -> Optional[float]:
        ia = self.idx.get(a)
        ib = self.idx.get(b)
        if ia is None or ib is None:
            return None
        return float(np.dot(self.normalized[ia], self.normalized[ib]))

    def pool_top_k_neighbors(self, words: list[str], k: int = NN_REJECT_K) -> dict[str, set[str]]:
        """For each word in `words` that we have a vector for, compute the top-k
        nearest cosine neighbors (within `words` itself).

        Used as a veto filter: if tgt is in top-k NN of src in the pool's own
        semantic neighborhood, the swap risks being a near-cohyponym.
        """
        in_pool = [w for w in words if w in self.idx]
        if not in_pool:
            return {}
        pool_idx = np.array([self.idx[w] for w in in_pool], dtype=np.int64)
        vecs = self.normalized[pool_idx]  # (P, dim)
        cos = vecs @ vecs.T  # (P, P) — symmetric, diag = 1
        np.fill_diagonal(cos, -1.0)
        kk = min(k, len(in_pool) - 1)
        if kk <= 0:
            return {w: set() for w in in_pool}
        top_idx = np.argpartition(-cos, kk - 1, axis=1)[:, :kk]
        out: dict[str, set[str]] = {}
        for i, w in enumerate(in_pool):
            out[w] = {in_pool[j] for j in top_idx[i]}
        return out


def load_safe_antonyms() -> set[tuple[str, str]]:
    path = V3_DIR / "mappings" / "antonyms_safe.json"
    if not path.exists():
        return set()
    out: set[tuple[str, str]] = set()
    try:
        m = json.loads(path.read_text())
        if isinstance(m, dict):
            for k, v in m.items():
                out.add((k.lower(), v.lower()))
                out.add((v.lower(), k.lower()))
    except Exception:
        pass
    return out


def wn_lemmas(wn, w: str) -> set[str]:
    out = set()
    for s in wn.synsets(w):
        for l in s.lemmas():
            name = l.name().replace("_", " ").lower()
            if " " not in name and name.isalpha():
                out.add(name)
    return out


def wn_antonyms(wn, w: str) -> set[str]:
    out = set()
    for s in wn.synsets(w):
        for l in s.lemmas():
            for a in l.antonyms():
                name = a.name().replace("_", " ").lower()
                if " " not in name and name.isalpha():
                    out.add(name)
    return out


def wn_closure(wn, w: str, direction: str) -> set[str]:
    """direction: 'hypernyms' or 'hyponyms'."""
    out = set()
    for s in wn.synsets(w):
        try:
            for h in s.closure(lambda x: getattr(x, direction)()):
                for l in h.lemmas():
                    name = l.name().replace("_", " ").lower()
                    if " " not in name and name.isalpha():
                        out.add(name)
        except Exception:
            pass
    return out


def wn_dominant_pos(wn, w: str) -> Optional[str]:
    syns = wn.synsets(w)
    if not syns:
        return None
    return Counter(s.pos() for s in syns).most_common(1)[0][0]


def filter_pairs(candidates, embedder, wn, nlp, stemmer, antonyms_safe,
                 nn_map: Optional[dict[str, set[str]]] = None,
                 verb_sigs: Optional[dict[str, set[str]]] = None,
                 capture_rejects: bool = True, max_per_reason: int = 2000):
    """Apply all 6 filter checks; return (accepted_pairs, reject_reasons Counter, rejects_by_reason).

    rejects_by_reason is a dict[reason -> list[dict]] capped at `max_per_reason` per
    reason (we still increment the Counter past the cap so totals match).
    """
    accepted: list[dict] = []
    reasons = Counter()
    rejects_by_reason: dict[str, list[dict]] = defaultdict(list)

    def _record(reason: str, src: str, tgt: str, bucket: str, **extra):
        reasons[reason] += 1
        if not capture_rejects:
            return
        bucket_list = rejects_by_reason[reason]
        if len(bucket_list) < max_per_reason:
            row = {"src": src, "tgt": tgt, "bucket": bucket}
            row.update(extra)
            bucket_list.append(row)
    n = len(candidates)
    t0 = time.time()
    # Cache lemma + stem to avoid repeated spaCy hits
    lemma_cache: dict[str, str] = {}
    stem_cache: dict[str, str] = {}
    syn_cache: dict[str, set[str]] = {}
    ant_cache: dict[str, set[str]] = {}
    hyper_cache: dict[str, set[str]] = {}
    hypo_cache: dict[str, set[str]] = {}
    pos_cache: dict[str, Optional[str]] = {}

    def get_lemma(w):
        if w not in lemma_cache:
            try:
                lemma_cache[w] = nlp(w)[0].lemma_.lower()
            except Exception:
                lemma_cache[w] = w
        return lemma_cache[w]

    def get_stem(w):
        if w not in stem_cache:
            try:
                stem_cache[w] = stemmer.stem(w)
            except Exception:
                stem_cache[w] = w
        return stem_cache[w]

    def get_syn(w):
        if w not in syn_cache:
            syn_cache[w] = wn_lemmas(wn, w)
        return syn_cache[w]

    def get_ant(w):
        if w not in ant_cache:
            ant_cache[w] = wn_antonyms(wn, w)
        return ant_cache[w]

    def get_hyper(w):
        if w not in hyper_cache:
            hyper_cache[w] = wn_closure(wn, w, "hypernyms")
        return hyper_cache[w]

    def get_hypo(w):
        if w not in hypo_cache:
            hypo_cache[w] = wn_closure(wn, w, "hyponyms")
        return hypo_cache[w]

    def get_dom_pos(w):
        if w not in pos_cache:
            pos_cache[w] = wn_dominant_pos(wn, w)
        return pos_cache[w]

    for i, (src, tgt, bucket) in enumerate(candidates):
        if (i + 1) % 500 == 0:
            elapsed = time.time() - t0
            print(f"  ...{i+1}/{n} pairs filtered ({elapsed:.0f}s, {len(accepted)} accepted)",
                  flush=True)

        if src == tgt:
            _record("self_equal", src, tgt, bucket)
            continue

        # Phase A2: zipf-shift gate — reject if src/tgt frequencies differ too much
        z_src = wordfreq.zipf_frequency(src, "en")
        z_tgt = wordfreq.zipf_frequency(tgt, "en")
        shift = z_src - z_tgt
        if abs(shift) > ZIPF_SHIFT_MAX:
            _record("zipf_shift_too_large", src, tgt, bucket,
                    src_zipf=round(z_src, 3), tgt_zipf=round(z_tgt, 3),
                    shift=round(shift, 3))
            continue

        # 1. Cosine band
        cos = embedder.cosine(src, tgt)
        if cos is None:
            _record("cosine_missing", src, tgt, bucket)
            continue
        if cos < COSINE_LOW:
            _record("cosine_too_low", src, tgt, bucket, cosine=round(cos, 4))
            continue
        if cos > COSINE_HIGH:
            _record("cosine_too_high", src, tgt, bucket, cosine=round(cos, 4))
            continue

        # Phase A3: top-K NN reject (semantic veto, tighter than COSINE_HIGH)
        if nn_map is not None:
            if tgt in nn_map.get(src, _EMPTY_SET) or src in nn_map.get(tgt, _EMPTY_SET):
                _record("in_top_k_nn", src, tgt, bucket, cosine=round(cos, 4))
                continue

        # 2. Synonym hard-reject (symmetric)
        if tgt in get_syn(src) or src in get_syn(tgt):
            _record("wn_synonym", src, tgt, bucket, cosine=round(cos, 4))
            continue

        # 3. Antonym hard-reject (WordNet + safe-list)
        if tgt in get_ant(src) or src in get_ant(tgt):
            _record("wn_antonym", src, tgt, bucket, cosine=round(cos, 4))
            continue
        if (src, tgt) in antonyms_safe:
            _record("safe_antonym", src, tgt, bucket, cosine=round(cos, 4))
            continue

        # 4. Hypernym/hyponym chain reject
        if tgt in get_hyper(src) or src in get_hyper(tgt):
            _record("wn_hypernym", src, tgt, bucket, cosine=round(cos, 4))
            continue
        if tgt in get_hypo(src) or src in get_hypo(tgt):
            _record("wn_hyponym", src, tgt, bucket, cosine=round(cos, 4))
            continue

        # 5. Inflection reject (spaCy lemma + Snowball stem equality)
        if get_lemma(src) == get_lemma(tgt):
            _record("same_lemma", src, tgt, bucket, cosine=round(cos, 4))
            continue
        if get_stem(src) == get_stem(tgt):
            _record("same_stem", src, tgt, bucket, cosine=round(cos, 4))
            continue

        # 6. Dominant-POS reject (different WN-dominant POS)
        ps, pt = get_dom_pos(src), get_dom_pos(tgt)
        if ps and pt and ps != pt:
            _record("dominant_pos_mismatch", src, tgt, bucket,
                    cosine=round(cos, 4), src_pos=ps, tgt_pos=pt)
            continue

        # Phase B2 + G6: VerbNet frame signature must intersect significantly
        # for verb pairs. v6+ used "≥1 shared frame" (too lax); v10 uses Jaccard ≥ 0.4.
        if verb_sigs is not None and bucket.startswith("verb.") and not bucket.endswith("gerund_ambiguous"):
            ssig = verb_sigs.get(src)
            tsig = verb_sigs.get(tgt)
            if ssig and tsig:
                inter = ssig & tsig
                union = ssig | tsig
                jaccard = len(inter) / len(union) if union else 0.0
                if jaccard < FRAME_JACCARD_MIN:
                    _record("verbnet_frame_jaccard_low", src, tgt, bucket,
                            cosine=round(cos, 4),
                            jaccard=round(jaccard, 3),
                            src_frames=sorted(ssig), tgt_frames=sorted(tsig))
                    continue

        # Accept (z_src, z_tgt, shift already computed above for the gate)
        accepted.append({
            "src": src,
            "tgt": tgt,
            "bucket": bucket,
            "src_zipf": round(z_src, 3),
            "tgt_zipf": round(z_tgt, 3),
            "shift": round(shift, 3),
            "cosine": round(cos, 4),
        })

    return accepted, reasons, dict(rejects_by_reason)


# ──────────────────────────────────────────────────────────────────────
# 1E — Output and sample sentences
# ──────────────────────────────────────────────────────────────────────

def make_sample_sentences(accepted: list[dict], n_sentences: int = 10, n_pairs_show: int = 30):
    eval_path = V6_DIR / "data" / "eval_wiki_holdout.jsonl"
    if not eval_path.exists():
        return None
    sentences: list[str] = []
    with eval_path.open() as f:
        for line in f:
            try:
                row = json.loads(line)
            except Exception:
                continue
            text = row.get("text", "")
            # Split to short-ish sentences for readability
            for raw in re.split(r"(?<=[.!?])\s+", text):
                s = raw.strip()
                if 60 < len(s) < 250:
                    sentences.append(s)
                    if len(sentences) >= n_sentences:
                        break
            if len(sentences) >= n_sentences:
                break

    # Build symmetric mapping from accepted pairs (src->tgt only — not symmetric so
    # we don't double-encode words on second swap).
    rng = random.Random(SEED)
    mapping: dict[str, str] = {}
    for p in accepted:
        s, t = p["src"], p["tgt"]
        if s not in mapping and t not in mapping.values():
            mapping[s] = t

    encoded = [encode_text(s, mapping) for s in sentences]

    # 30 random sample pairs
    sample_pairs = rng.sample(accepted, min(n_pairs_show, len(accepted)))

    suf = f"_{SUFFIX}" if SUFFIX else ""
    out_path = DATA_OUT / f"sentences_v7_alpha{suf}.txt"
    lines: list[str] = []
    lines.append("# v7 alpha — sample encoded sentences and pairs")
    lines.append(f"# n_pairs total: {len(accepted)}; mapping size used: {len(mapping)}")
    lines.append("")
    lines.append("=" * 80)
    lines.append("SECTION 1 — 10 wiki sentences, original vs encoded")
    lines.append("=" * 80)
    for i, (orig, enc) in enumerate(zip(sentences, encoded), 1):
        lines.append(f"\n[{i}] ORIG: {orig}")
        lines.append(f"    ENC : {enc}")

    lines.append("")
    lines.append("=" * 80)
    lines.append(f"SECTION 2 — {len(sample_pairs)} random sample pairs")
    lines.append("=" * 80)
    for p in sample_pairs:
        lines.append(
            f"  {p['src']:>15s} → {p['tgt']:<15s}  "
            f"[{p['bucket']:<35s}] zipf {p['src_zipf']:.2f}→{p['tgt_zipf']:.2f} "
            f"(shift {p['shift']:+.2f})  cos={p['cosine']:.3f}"
        )

    out_path.write_text("\n".join(lines))
    print(f"[1E] wrote sample to {out_path}", flush=True)
    return sample_pairs


def write_outputs(accepted, candidates, buckets, per_word, reasons):
    bucket_pairs: dict[str, list[dict]] = defaultdict(list)
    for p in accepted:
        bucket_pairs[p["bucket"]].append({
            "src": p["src"],
            "tgt": p["tgt"],
            "src_zipf": p["src_zipf"],
            "tgt_zipf": p["tgt_zipf"],
            "shift": p["shift"],
            "cosine": p["cosine"],
        })

    shifts = [p["shift"] for p in accepted]
    if shifts:
        shift_stats = {
            "mean": round(statistics.fmean(shifts), 3),
            "std": round(statistics.pstdev(shifts), 3) if len(shifts) > 1 else 0.0,
            "median": round(statistics.median(shifts), 3),
            "asymmetric_pct": round(100 * sum(1 for s in shifts if s > 0) / len(shifts), 2),
        }
    else:
        shift_stats = {"mean": 0, "std": 0, "median": 0, "asymmetric_pct": 0}

    out = {
        "_schema_version": 1,
        "_seed": SEED,
        "_n_source_words": sum(len(v) for v in buckets.values()),
        "_n_buckets": len(buckets),
        "_n_buckets_used": len(bucket_pairs),
        "_n_candidate_pairs": len(candidates),
        "_n_accepted_pairs": len(accepted),
        "_acceptance_rate": (
            round(len(accepted) / len(candidates), 4) if candidates else 0
        ),
        "_zipf_shift_stats": shift_stats,
        "_reject_reasons": dict(reasons.most_common()),
        "buckets": dict(bucket_pairs),
        "all_pairs": accepted,
    }
    suf = f"_{SUFFIX}" if SUFFIX else ""
    out_path = DATA_OUT / f"pairs_v7_alpha{suf}.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"[1E] wrote {out_path}", flush=True)

    # Also persist intermediate pool
    pool_out = {
        "pool_size": sum(len(v) for v in buckets.values()),
        "n_buckets": len(buckets),
        "buckets": {k: sorted(v) for k, v in sorted(buckets.items())},
    }
    pool_path = DATA_OUT / f"v7_word_pool{suf}.json"
    pool_path.write_text(json.dumps(pool_out, indent=2))
    print(f"[1B] wrote {pool_path}", flush=True)
    return out


# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────

def add_special_pairs(accepted: list[dict]) -> list[dict]:
    """Phase 1F — append digit/month/day/time/ordinal swaps to the pair list.

    These bypass the cosine + WordNet filter (they're not cohyponyms — they're
    a separate mechanism the user explicitly asked for). Each is bidirectional
    and bijective within its bucket.
    """
    from wordfreq import zipf_frequency

    def _add(src: str, tgt: str, bucket: str, out: list[dict]):
        try:
            sz = zipf_frequency(src, "en") or 0.0
            tz = zipf_frequency(tgt, "en") or 0.0
        except Exception:
            sz, tz = 0.0, 0.0
        out.append({
            "src": src, "tgt": tgt, "bucket": bucket,
            "src_zipf": round(sz, 2), "tgt_zipf": round(tz, 2),
            "shift": round(sz - tz, 2),
            "cosine": None,  # not measured; this is a special category
            "special": True,
        })

    extras: list[dict] = []
    for s, t in MONTH_PAIRS.items():
        _add(s, t, "special.month", extras)
    for s, t in DAY_PAIRS.items():
        _add(s, t, "special.day", extras)
    for s, t in TIME_PAIRS.items():
        _add(s, t, "special.time", extras)
    for s, t in ORDINAL_PAIRS.items():
        _add(s, t, "special.ordinal", extras)
    # Phase D3 — function words (conjunctions, prepositions, quantifiers, etc.)
    if FUNCTION_PAIRS_ENABLED:
        for s, t in FUNCTION_PAIRS.items():
            _add(s, t, "special.function", extras)
    # Phase G4 — written number pairs (one/two preserved like digit perm)
    for s, t in NUMBER_WORD_PAIRS.items():
        _add(s, t, "special.number_word", extras)
    # Digit pairs — represented as 1-character entries
    for s, t in DIGIT_PERM.items():
        extras.append({
            "src": s, "tgt": t, "bucket": "special.digit",
            "src_zipf": 0.0, "tgt_zipf": 0.0, "shift": 0.0,
            "cosine": None, "special": True,
        })
    n_fn = len(FUNCTION_PAIRS) if FUNCTION_PAIRS_ENABLED else 0
    print(f"[1F] adding {len(extras)} special pairs "
          f"({len(MONTH_PAIRS)} month, {len(DAY_PAIRS)} day, "
          f"{len(TIME_PAIRS)} time, {len(ORDINAL_PAIRS)} ordinal, "
          f"{n_fn} function, {len(NUMBER_WORD_PAIRS)} number_word, "
          f"{len(DIGIT_PERM)} digit)", flush=True)
    return accepted + extras


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default="",
                    help="Suffix for outputs (e.g. 'v3' → pairs_v7_alpha_v3.json)")
    ap.add_argument("--expand-paradigms", action="store_true",
                    help="Phase H7 (v11+): expand source pool with paradigm forms before "
                         "subcategorize. Each surface form is then paired independently in "
                         "its bucket — no consistent lemma→lemma trace.")
    ap.add_argument("--seed", type=int, default=None,
                    help="Override the module-level SEED (default 42). Used to produce "
                         "alternative dictionaries in the same v15 family.")
    args = ap.parse_args()

    global SUFFIX, SEED
    SUFFIX = args.version
    if args.seed is not None:
        SEED = args.seed
        print(f"[seed] overriding SEED → {SEED}", flush=True)

    t_start = time.time()
    print("=" * 70, flush=True)
    print(f"v7 Phase 1 — pair-building pipeline (version: {SUFFIX or 'default'})", flush=True)
    if args.expand_paradigms:
        print("  (Phase H7: paradigm expansion enabled)", flush=True)
    print("=" * 70, flush=True)

    # 1A
    words = load_source_words()

    # Load slow resources once
    print("[deps] loading spaCy en_core_web_sm ...", flush=True)
    import spacy
    nlp = spacy.load("en_core_web_sm")

    # Phase H7: expand source pool with paradigm forms before bucketing
    if args.expand_paradigms:
        words = expand_paradigms(words, nlp)

    print("[deps] loading WordNet / VerbNet / Snowball stemmer ...", flush=True)
    from nltk.corpus import wordnet as wn
    from nltk.corpus import verbnet
    from nltk.stem.snowball import SnowballStemmer
    # Force corpora init
    _ = wn.synsets("dog")
    _ = verbnet.classids("give")
    stemmer = SnowballStemmer("english")

    print("[deps] loading Brown corpus POS distribution (Phase B1) ...", flush=True)
    brown_dist = load_brown_pos_distribution()
    print(f"  {len(brown_dist):,} unique words in Brown", flush=True)

    conc = load_brysbaert()
    embedder = NumberbatchEmbedder(V6_DIR / "data" / "numberbatch_en.tsv")
    antonyms_safe = load_safe_antonyms()
    print(f"[data] loaded {len(antonyms_safe)} safe-antonym pairs", flush=True)

    # 1B
    buckets, per_word, verb_sigs, purity_rejects = subcategorize(
        words, nlp, wn, verbnet, conc, brown_dist=brown_dist
    )

    # FALLBACK: if any bucket got <4 entries, drop it; if total content words too few,
    # the spec said to coarsen — but we proceed and check at the end.
    bucket_sizes = sorted(((len(v), k) for k, v in buckets.items()), reverse=True)
    print(f"[1B] top 8 buckets: " + ", ".join(f"{k}={n}" for n, k in bucket_sizes[:8]), flush=True)
    print(f"[1B] tail (smallest 8 ≥ {MIN_BUCKET_SIZE}): " +
          ", ".join(f"{k}={n}" for n, k in bucket_sizes if n >= MIN_BUCKET_SIZE)[-200:],
          flush=True)

    # 1C
    candidates = pair_within_buckets(buckets, seed=SEED)

    # Phase A3: compute pool-internal top-K nearest neighbors (used as veto in 1D)
    print(f"[1C+] computing top-{NN_REJECT_K} NN within pool ({sum(len(v) for v in buckets.values())} words) ...",
          flush=True)
    t_nn = time.time()
    pool_words = sorted({w for v in buckets.values() for w in v})
    nn_map = embedder.pool_top_k_neighbors(pool_words, k=NN_REJECT_K)
    print(f"[1C+] NN map ready: {len(nn_map)} words in vocab ({time.time() - t_nn:.1f}s)",
          flush=True)

    # 1D
    print(f"[1D] filtering {len(candidates)} candidate pairs ...", flush=True)
    accepted, reasons, rejects_by_reason = filter_pairs(
        candidates, embedder, wn, nlp, stemmer, antonyms_safe,
        nn_map=nn_map, verb_sigs=verb_sigs,
    )

    # Phase C: recovery — iteratively re-shuffle unmatched words within their buckets
    # and try to find valid partners. Each round adds words that found a partner to
    # the "used" set; the next round only operates on remaining unmatched words.
    if RECOVERY_ITERS > 0:
        used: set[str] = set()
        for p in accepted:
            used.add(p["src"])
            used.add(p["tgt"])
        all_reasons = Counter(reasons)
        all_rejects: dict[str, list[dict]] = defaultdict(list)
        for r, rows in rejects_by_reason.items():
            all_rejects[r].extend(rows)
        recovery_added = 0
        for it in range(1, RECOVERY_ITERS + 1):
            unmatched_buckets = {
                b: [w for w in words if w not in used]
                for b, words in buckets.items()
                if len([w for w in words if w not in used]) >= 2
            }
            if not unmatched_buckets:
                break
            new_candidates = pair_within_buckets(unmatched_buckets, seed=SEED + it,
                                                 min_size=2)  # recovery is permissive
            if not new_candidates:
                break
            new_accepted, new_reasons, new_rej = filter_pairs(
                new_candidates, embedder, wn, nlp, stemmer, antonyms_safe,
                nn_map=nn_map, verb_sigs=verb_sigs,
                capture_rejects=True, max_per_reason=2000,
            )
            if not new_accepted:
                # No more progress possible
                break
            print(f"[1D-recovery iter {it}] {len(new_candidates)} candidates "
                  f"({sum(len(v) for v in unmatched_buckets.values())} unmatched words across "
                  f"{len(unmatched_buckets)} buckets) → +{len(new_accepted)} accepted",
                  flush=True)
            accepted.extend(new_accepted)
            for p in new_accepted:
                used.add(p["src"])
                used.add(p["tgt"])
            for r, n in new_reasons.items():
                all_reasons[r] += n
            for r, rows in new_rej.items():
                all_rejects[r].extend(rows)
            recovery_added += len(new_accepted)
        if recovery_added:
            print(f"[1D-recovery] total recovery: +{recovery_added} pairs across {RECOVERY_ITERS} max iters",
                  flush=True)

        # Final cross-bucket recovery pass: group unmatched by WN dominant POS,
        # attempt pairing across original bucket boundaries (still constrained by all
        # filters — synonyms, antonyms, NN, frame, etc. — just relaxed bucket grouping).
        unmatched_words = [w for v in buckets.values() for w in v if w not in used]
        if unmatched_words and CROSS_BUCKET_ENABLED:
            print(f"[1D-recovery cross-bucket] {len(unmatched_words)} still unmatched; "
                  f"grouping by WN dominant POS ...", flush=True)
            cross_groups: dict[str, list[str]] = defaultdict(list)
            for w in unmatched_words:
                p = wn_dominant_pos(wn, w)
                if not p:
                    continue
                # For nouns, also split by number so plural/singular don't collide
                # (vote_pos can mis-bucket words like 'chad' as verbs; cross-bucket
                # recovery via WN POS pulled them back into noun pool — number check
                # prevents 'chad' (sing) from pairing with 'circumstances' (plur)).
                if p == "n":
                    key = f"n.{noun_number(nlp, w)}"
                else:
                    key = p
                cross_groups[key].append(w)
            cross_rng = random.Random(SEED + 999)
            cross_candidates = []
            for pos_label, words in cross_groups.items():
                if len(words) < 2:
                    continue
                cross_rng.shuffle(words)
                n = len(words) - len(words) % 2
                for i in range(0, n, 2):
                    a, b = words[i], words[i + 1]
                    bk = f"cross.{pos_label}"
                    cross_candidates.append((a, b, bk))
                    cross_candidates.append((b, a, bk))
            if cross_candidates:
                cross_acc, cross_reasons, cross_rej = filter_pairs(
                    cross_candidates, embedder, wn, nlp, stemmer, antonyms_safe,
                    nn_map=nn_map, verb_sigs=verb_sigs,
                    capture_rejects=True, max_per_reason=2000,
                )
                accepted.extend(cross_acc)
                for p in cross_acc:
                    used.add(p["src"])
                    used.add(p["tgt"])
                for r, n in cross_reasons.items():
                    all_reasons[r] += n
                for r, rows in cross_rej.items():
                    all_rejects[r].extend(rows)
                print(f"[1D-recovery cross-bucket] {len(cross_candidates)} candidates → "
                      f"+{len(cross_acc)} accepted across "
                      f"{len(cross_groups)} POS groups", flush=True)

        reasons = all_reasons
        rejects_by_reason = dict(all_rejects)
    print(f"[1D] accepted {len(accepted)} / {len(candidates)} "
          f"({100*len(accepted)/max(1,len(candidates)):.1f}%)", flush=True)
    print(f"[1D] reject reasons:", flush=True)
    for r, n in reasons.most_common():
        print(f"        {r:30s} {n:>5d}", flush=True)

    # Persist rejects (capped per-reason; counts in `by_reason_counts` reflect totals)
    rejects_out = {
        "n_rejects": int(sum(reasons.values())),
        "by_reason_counts": dict(reasons.most_common()),
        "max_per_reason": 2000,
        "by_reason": rejects_by_reason,
    }
    suf = f"_{SUFFIX}" if SUFFIX else ""
    rejects_path = DATA_OUT / f"rejects_v7_alpha{suf}.json"
    rejects_path.write_text(json.dumps(rejects_out, indent=2))
    print(f"[1D] wrote rejects to {rejects_path} "
          f"({rejects_out['n_rejects']} total, "
          f"{sum(len(v) for v in rejects_by_reason.values())} stored)", flush=True)

    # Phase B1: persist POS purity rejects (separate from filter rejects)
    purity_path = DATA_OUT / f"pos_purity_rejects{suf}.json"
    purity_path.write_text(json.dumps({
        "n_rejected": len(purity_rejects),
        "rejects": purity_rejects[:5000],
    }, indent=2))
    print(f"[1B+] wrote {len(purity_rejects)} POS-purity rejects to {purity_path}",
          flush=True)

    # 1F — append special pairs (digits, months, days, ordinals, time words)
    # These bypass the cosine + WordNet filter entirely (separate mechanism).
    accepted = add_special_pairs(accepted)
    # Add special-pair entries to the relevant buckets
    for p in accepted:
        if p.get("special"):
            buckets.setdefault(p["bucket"], []).append(p["src"])

    # 1E
    out = write_outputs(accepted, candidates, buckets, per_word, reasons)
    out["_digit_permutation"] = DIGIT_PERM
    # rewrite with digit permutation included
    suf = f"_{SUFFIX}" if SUFFIX else ""
    out_path = DATA_OUT / f"pairs_v7_alpha{suf}.json"
    out_path.write_text(json.dumps(out, indent=2))
    try:
        sample_pairs = make_sample_sentences(accepted)
    except (TypeError, KeyError, ValueError) as e:
        print(f"[1E] WARN make_sample_sentences failed (non-fatal): {e}", flush=True)
        sample_pairs = []

    # Summary table
    print()
    print("=" * 70, flush=True)
    print("SUMMARY", flush=True)
    print("=" * 70, flush=True)
    print(f"  source words (content POS):  {out['_n_source_words']}", flush=True)
    print(f"  buckets total / used:        {out['_n_buckets']} / {out['_n_buckets_used']}", flush=True)
    print(f"  candidate pairs:             {out['_n_candidate_pairs']}", flush=True)
    print(f"  accepted pairs:              {out['_n_accepted_pairs']}", flush=True)
    print(f"  acceptance rate:             {out['_acceptance_rate']*100:.2f}%", flush=True)
    print(f"  zipf-shift mean / median:    {out['_zipf_shift_stats']['mean']:+.3f} / "
          f"{out['_zipf_shift_stats']['median']:+.3f}", flush=True)
    print(f"  zipf-shift std:              {out['_zipf_shift_stats']['std']:.3f}", flush=True)
    print(f"  asymmetric pct (src>tgt):    {out['_zipf_shift_stats']['asymmetric_pct']:.1f}%", flush=True)

    # Bucket-level breakdown (top 12)
    print()
    print("  Top buckets by accepted-pair count:", flush=True)
    bp = sorted(out["buckets"].items(), key=lambda kv: -len(kv[1]))
    for name, pairs in bp[:12]:
        print(f"    {name:<48s} {len(pairs):>5d}", flush=True)

    # Zipf-shift histogram
    print()
    print("  Zipf-shift histogram (negative = src is rarer than tgt):", flush=True)
    shifts = [p["shift"] for p in out["all_pairs"]]
    bins = [(-5.0, -2.0), (-2.0, -1.0), (-1.0, -0.5), (-0.5, 0.0),
            (0.0, 0.5), (0.5, 1.0), (1.0, 2.0), (2.0, 5.0)]
    for lo, hi in bins:
        n = sum(1 for s in shifts if lo <= s < hi)
        bar = "█" * int(n / max(1, len(shifts)) * 50)
        print(f"    [{lo:+5.1f}, {hi:+5.1f})  {n:>4d}  {bar}", flush=True)

    # Range check
    print()
    if 1500 <= len(accepted) <= 2500:
        print(f"  status: OK ({len(accepted)} pairs in target 1500-2500 range)", flush=True)
    elif len(accepted) < 1500:
        print(f"  status: LOW — only {len(accepted)} pairs (target 1500-2500)", flush=True)
        if len(accepted) < 1000:
            print(f"  WARN: <1000 — buckets may be too granular; consider coarser bucketing.", flush=True)
    else:
        print(f"  status: HIGH — {len(accepted)} pairs (target 1500-2500); filter may be too loose", flush=True)

    elapsed = time.time() - t_start
    print(f"\n  total runtime: {elapsed:.1f}s ({elapsed/60:.2f}min)", flush=True)


if __name__ == "__main__":
    main()
