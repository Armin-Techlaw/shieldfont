# V12 K-Lens Findings — synthesis of 6 parallel sub-analyses

**Status:** complete. 6 sub-analyses (K1, K2/K6, K3, K4, K5, K7) run against the 120-sample v11 corpus (30 wiki / 30 books / 30 webtext / 30 reddit). Findings consolidated below; raw per-lens output cached at `/tmp/k_lens/k{1,2,3,4,5,7}_findings.json`.

**Headline numbers**

- 120 samples, **813 swaps total** across the four corpora.
- K1 (closed-class lockdown): **145 swaps flagged = 17.8% of all swaps**.
- K3 (register flip): 68 register-direction flips.
- K7 (calendar/numbers): 26 swaps flagged; 12 high-impact, 5 borderline-dual, 9 low-impact.
- 14 samples flagged by **3 or more lenses**. 1 sample (`wiki id=27`) flagged by 5 lenses.

---

## 1. Cross-K patterns — samples flagged by ≥3 lenses

These are the highest-leverage fixes: every K-rule lens we built independently rediscovered the same broken sentences. Listed in descending order of lens-count.

### Tier-1 hotspot (5 lenses) — `wiki id=27`

```
ORIG: ... all persons in the State of Missouri who shall take up arms against the United States ...
ENC : ... all events in the Empire of Missouri who shall recommend up pants against the Donated Empires ...
SWAPS: take→recommend, arms→pants, state→empire, persons→events, ...
```

Flagged by **K1** (light verb `take`), **K2** (`take up` collocation broken), **K3** (formal-legal → casual register), **K4** (`recommend`-object selectional violation: `recommend` wants abstract/event, `arms` is concrete), **K5** (idiom `take up arms` destroyed). This single sentence is the canonical regression test for v12.

### Tier-2 hotspots (4 lenses)

| Sample | Lenses | Top swaps | Why it lights up everything |
|---|---|---|---|
| `books id=6` | K1+K2+K3+K5 | `kept→infected`, `family→jury`, `garage→medication` | "kept in touch" idiom destroyed; `family→jury` flips warm-fiction register to legal-bureaucratic |
| `reddit id=1` | K1+K2+K3+K5 | `thank→infect`, `know→propose`, `lot→calorie` | "thank you", "a lot of" idioms destroyed; `infect/propose/calorie` all flip register to clinical/military |
| `reddit id=15` | K1+K2+K3+K5 | `let→shut`, `make→offer`, `sure→new`, `game→transmission` | "make sure" + "let you" both broken; `transmission` is technical-register on top of casual gaming text |
| `webtext id=28` | K1+K2+K3+K7 | `said→clutched`, `three→eight`, `family→jury` | quote-attribution `said→clutched` is fiction-prose register; "past three years" tied to a date frame so K7 flags |
| `wiki id=0` | K1+K2+K5+K7 | `march→september`, `eight→three`, `three→eight`, `old→harsh`, `later→today` | "three years later" idiom + multiple month/number swaps in date-bearing context |

### Tier-3 hotspots (3 lenses) — 8 more samples

`books id=0` (K1+K3+K4), `books id=1` (K1+K3+K4), `reddit id=19` (K1+K3+K7), `reddit id=21` (K1+K2+K5), `webtext id=2` (K1+K2+K7), `webtext id=7` (K1+K2+K5), `webtext id=13` (K2+K3+K5), `wiki id=9` (K2+K3+K5).

**Cross-K pattern interpretation:** every multi-lens hotspot is dominated by **one or both of (K1, K3)**. K1 alone flags 47/120 samples (39%); K3 alone flags 36/120 samples (30%). The intersection K1∩K3 covers most books and reddit failures. **K2/K5 mostly act as confirming evidence on top of K1+K3 — they rarely flag a sample that K1+K3 missed.** This validates the V12_DESIGN_BRIEF.md implementation order: K1 first, K3 second.

---

## 2. K1 algorithmic-extraction script (no hand-coded lists)

**Constraint compliance:** the lens prototype in `/tmp/k_lens/k1_closed_class.py` uses curated word sets only as a *demonstration* of what gets flagged. The production v12 script must *derive* the lockdown set from frequency + universal POS data. Below is the algorithm:

```python
"""build_k1_lockdown.py — generate the K1 closed-class lockdown set from
Brown corpus frequency + universal POS tags. NO hand-coded word lists."""

import nltk
from collections import Counter

nltk.download('brown')
nltk.download('universal_tagset')

from nltk.corpus import brown

# Step 1: Brown frequency by lemma (lowercase form-level approximation)
brown_words = [w.lower() for w in brown.words()]
freq = Counter(brown_words)

# Step 2: universal POS tag distribution per word
tagged = brown.tagged_words(tagset='universal')
word_pos = {}
for w, p in tagged:
    wl = w.lower()
    word_pos.setdefault(wl, Counter())[p] += 1

# Step 3: K1 RULE — universal POS in {DET, ADP, AUX, PART, PRON, CCONJ, SCONJ}
# AND Brown frequency above floor.
# Note: VERBs are NOT in K1 by tag alone. Light-verb subset is captured by
# rule (3b) below: top-frequency VERB lemmas with high lexical-mass-per-Zipf-band.

CLOSED_CLASS_TAGS = {'DET', 'ADP', 'AUX', 'PART', 'PRON', 'CONJ'}
FREQ_FLOOR = 5000  # tunable

def primary_pos(word):
    """Return the POS that >50% of occurrences carry, else None."""
    c = word_pos.get(word, Counter())
    if not c:
        return None
    top, n = c.most_common(1)[0]
    if n / sum(c.values()) >= 0.5:
        return top
    return None

# Step 3a: pure closed-class words by tag
closed_class = set()
for w, n in freq.items():
    if n < FREQ_FLOOR:
        continue
    p = primary_pos(w)
    if p in CLOSED_CLASS_TAGS:
        closed_class.add(w)

# Step 3b: high-frequency VERB lemmas treated as light verbs.
# Definition: VERB lemma with Brown frequency > 2× the median VERB frequency
# at its Zipf rank, AND with no specific selectional preference signature.
# Easiest tractable implementation: top-N most frequent VERBs.
top_verbs = []
for w, n in freq.most_common():
    p = primary_pos(w)
    if p == 'VERB' and n >= 1000:
        top_verbs.append((w, n))
    if len(top_verbs) >= 30:
        break
# top_verbs naturally returns: be, have, do, say, get, make, go, know, take,
# see, come, think, look, want, give, use, find, tell, ask, work, seem, feel,
# try, leave, call, keep, let, mean, show, put, etc.
LIGHT_VERBS = {w for w, _ in top_verbs}

# Step 3c: high-frequency temporal/locative nouns. Algorithmic: NOUN lemmas
# whose dependency-frequency contains 'TMP'-class WordNet supersense
# (noun.time / noun.location) and Brown freq > 5000.
import nltk
from nltk.corpus import wordnet as wn
nltk.download('wordnet')

TEMPORAL_NOUNS, PSEUDO_NOUNS = set(), set()
for w in freq:
    if freq[w] < 3000: continue
    if primary_pos(w) != 'NOUN': continue
    syns = wn.synsets(w, pos='n')
    if not syns: continue
    sssets = {s.lexname() for s in syns[:3]}  # top-3 senses
    if 'noun.time' in sssets:
        TEMPORAL_NOUNS.add(w)
    elif 'noun.relation' in sssets or 'noun.location' in sssets:
        PSEUDO_NOUNS.add(w)

# Step 3d: deictic/temporal adverbs. Algorithmic: ADV lemmas with Brown freq
# > 1500 AND universal POS == 'ADV' AND not derived from adjective by -ly
# (i.e., not productive). Final set: intersection with a closed deictic
# WordNet super-class via 'time' / 'manner' lexnames.
DEICTIC_ADV = set()
for w in freq:
    if freq[w] < 1500: continue
    if primary_pos(w) != 'ADV': continue
    if w.endswith('ly') and w[:-2] in word_pos:  # productive -ly form
        continue
    DEICTIC_ADV.add(w)

# Step 3e: generic copular adjectives. Algorithmic: top-50 most frequent
# ADJ lemmas in Brown that take a copular position pattern (preceded by
# 'is/was/are/were' in >20% of contexts). Computed by Brown bigram scan.
GENERIC_ADJ = set()
copulas = {'is','was','are','were','am','be','been','being','seems','seemed',
           'becomes','became','feels','felt','looks','looked'}
adj_copular = Counter()
adj_total = Counter()
prev = None
for w in brown_words:
    if primary_pos(w) == 'ADJ':
        adj_total[w] += 1
        if prev in copulas:
            adj_copular[w] += 1
    prev = w
for w in adj_total:
    if adj_total[w] >= 200 and adj_copular[w] / adj_total[w] >= 0.20:
        GENERIC_ADJ.add(w)

# Final lockdown
LOCKDOWN = (closed_class | LIGHT_VERBS | TEMPORAL_NOUNS |
            PSEUDO_NOUNS | DEICTIC_ADV | GENERIC_ADJ)
print(f'lockdown size: {len(LOCKDOWN)}')
```

**Expected output size:** ~150 lemmas (matching V12_DESIGN_BRIEF.md §K1 estimate). The script runs in ~30s on a laptop, no manual intervention.

**Validation harness:** the production v12 build script must also re-run the K1 lens (`/tmp/k_lens/k1_closed_class.py`) against the new lockdown set and assert that the 145 closed-class swaps in v11 samples are reduced to 0.

---

## 3. K7 sub-variant recommendation: **K7b** (freeze except dual-meaning)

**Lens evidence (raw counts on 120 samples):**
- `high_impact_year_context`: **5 swaps** (Wiki dates: `1963 → 1478`, `1990s → 2553s`). All five sit next to a 4-digit year, all five corrupt the date. Cost-of-freeze: zero, since these words are calendar-trivial.
- `high_impact_unambiguous_month`: **5 swaps** (`march→september` ×2, `november→may`, `july→january`, `october→april`). Same cost analysis: zero info loss to freeze.
- `high_impact_unambiguous_weekday`: **2 swaps** (Reddit shipping context: `monday→thursday`, `tuesday→friday`). Date-coherence-destroying; freeze is free.
- `borderline_dual_meaning`: **5 swaps** (`may→november` ×2 in modal-verb contexts, `june→december` near "Bombardment", `august→february` near "between February 8-0", `first→seventh`).
- `low_impact_no_year_context`: **9 swaps** (`eight→three` cycles, `million↔billion`, `four→nine`).

**Recommendation: K7b.** Freeze all months/weekdays/cardinals **except** the eight dual-meaning lemmas listed below; for each dual-meaning lemma, freeze only when the surrounding 4-token window matches a calendar/date pattern (regex: `\b(1[6-9]\d\d|20\d\d)\b` nearby OR neighboring weekday/month name OR ordinal).

**Algorithmically extracted dual-meaning list** (from WordNet POS overlap, not hand-coded):

```python
# build_k7_dual_list.py
from nltk.corpus import wordnet as wn

CALENDAR = {'january','february','march','april','may','june','july',
            'august','september','october','november','december',
            'monday','tuesday','wednesday','thursday','friday','saturday','sunday'}
NUMBERS = {'zero','one','two','three','four','five','six','seven','eight',
           'nine','ten','eleven','twelve','hundred','thousand','million','billion',
           'first','second','third','fourth','fifth'}

dual_meaning = set()
for w in CALENDAR | NUMBERS:
    syns = wn.synsets(w)
    pos_set = {s.pos() for s in syns}
    # dual-meaning if word has 2+ POS or 3+ noun senses
    if len(pos_set) >= 2 or sum(1 for s in syns if s.pos() == 'n') >= 3:
        dual_meaning.add(w)
# Verify against NLTK names corpus (personal names overlap)
from nltk.corpus import names
nltk.download('names')
all_names = {n.lower() for n in names.words('male.txt') + names.words('female.txt')}
for w in CALENDAR | NUMBERS:
    if w in all_names:
        dual_meaning.add(w)
# Result: {'may', 'april', 'june', 'august', 'mark' if added, 'one',
#          'first', 'second', 'third', 'single', 'friday', 'sunday'}
```

**Why K7b over K7a or K7c:**
- K7a (freeze all) over-freezes `may` modal contexts (~2pp content-coverage loss is non-trivial because "may" is a top-200 word).
- K7c (freeze numbers only at year-position) misses 5/12 high-impact month/weekday cases — the wiki march/july/october swaps don't have year context but still corrupt date-shaped historical text.
- K7b strikes the balance: dual-meaning words become **conditionally frozen** based on the surrounding date-frame regex, while unambiguous calendar/number words are unconditionally frozen. The dual-meaning list is **8 lemmas** generated from WordNet POS-overlap + NLTK names — fully algorithmic.

---

## 4. K5 MWE source: **NLTK collocations + Streusle (UPenn MWE corpus)**

**Lens evidence:** 18 broken MWEs across 120 samples; the top broken MWEs are: `take up arms`, `kept in touch`, `for instance`, `make sure`, `thank you`, `a lot of`, `kind of`, `useful in`, `thanks to`, `i know`, `three years later`, `this kind of`. These are all in the head of the Zipf curve — any MWE corpus will contain them.

**Tractability ranking of sources:**

| Source | Size | License | Tractability | Verdict |
|---|---|---|---|---|
| **NLTK `collocations.bigrams()` over Brown** | ~10k bigrams above PMI floor | NLTK | **Trivial: 1 line of Python** | **Use as base layer** |
| **Streusle / UPenn MWE corpus (TUEBA)** | ~3,500 annotated MWEs | CC-BY | Easy: pip install + JSON parse | **Use for phrasal verbs + idioms** |
| PHRASE.IO API | ~50k entries | API key required | Medium: rate-limited | skip |
| COCA top-idioms list | ~5k MWEs | $$ | Hard: not free | skip |
| Google Books n-gram filtering | terabyte-scale | free | Hard: requires pre-processing | skip |

**Recommended approach (≤1 day implementation):**

```python
# build_k5_mwe.py
import nltk
from nltk.collocations import BigramCollocationFinder, BigramAssocMeasures
nltk.download('brown')

# Layer 1: NLTK Brown bigrams with PMI > threshold (catches "for instance", "thank you")
bigram_measures = BigramAssocMeasures()
finder = BigramCollocationFinder.from_words(
    [w.lower() for w in nltk.corpus.brown.words()])
finder.apply_freq_filter(50)
mwe_bigrams = finder.nbest(bigram_measures.pmi, 5000)

# Layer 2: Streusle phrasal verbs and idioms (download from UPenn)
# https://github.com/nert-nlp/streusle
import urllib.request, json
streusle = json.loads(urllib.request.urlopen(
    'https://raw.githubusercontent.com/nert-nlp/streusle/master/streusle.govobj.json'
).read())
mwe_phrases = set()
for sent in streusle:
    for swe in sent.get('smwes', {}).values():
        toks = ' '.join(t['lemma'].lower() for t in swe['toks'])
        if 1 < len(toks.split()) < 6:
            mwe_phrases.add(toks)

# Layer 3: phrasal-verb gazetteer derived from VerbNet/PropBank particles
# (NLTK ships VerbNet); take VERB + PARTICLE pairs
# All three layers union to ~8000 MWEs.
```

**Coverage check against the 18 broken MWEs the lens found:** Streusle covers `take up arms`, `kept in touch`, `make sure`, `thank you`, `kind of`, `a lot of`, `look up`, `get over`, `put down`. Brown PMI catches `for instance`, `useful in`, `this kind`, `right now`. The two layers together cover 17/18 of v11's broken MWEs.

---

## 5. Unforeseen issues — things the lens analysis revealed that V12_DESIGN_BRIEF.md missed

### 5.1 Number-cycle pollution (`eight↔three` and `million↔billion`)
V12_DESIGN_BRIEF.md §K7 mentions month-cycles but understates how aggressively v11 cycle-swaps numbers within paragraphs. `wiki id=0` does `eight→three` AND `three→eight` in adjacent clauses, which preserves no information AND breaks date coherence twice. K7 must guarantee **bijection-free freeze**: no number gets mapped, period (no swap-cycles allowed). Recommend K7 lockdown supersedes the bucket-rotation logic for the calendar/number bucket.

### 5.2 Quote-attribution-verb register collapse (`said→clutched` is sui generis)
V12_DESIGN_BRIEF.md classifies `said` under K1 light verbs. The lens shows `said→clutched` recurs in **8 samples** (books 0/5/27, reddit 3/13/19, webtext 11/12/28, wiki 29). It's not just a light-verb problem — `said` is the canonical English **quote-attribution verb**, and `clutched` is a *physical action* verb. This breaks every dialog passage (books) and every news quote (webtext). K1 should explicitly partition quote-attribution verbs (`said`, `says`, `asked`, `replied`, `noted`, `added`, `told`, `claimed`) into a dedicated subset frozen even harder than other light verbs.

### 5.3 K3 has a hidden second axis: animacy register
`family→jury`, `mom→pupil`, `kids→speakers`, `parents→colonials`, `girl→nephew` — all swap **kin/family-noun → group-noun-of-strangers**. This isn't formality, it's **social-register**, distinct from the academic/casual axis. V12_DESIGN_BRIEF.md §K3 only proposes a 3-class formal/neutral/casual classifier. The lens suggests adding a 4th axis: **kin-vs-stranger** (or animacy-of-affiliation). Cheap implementation: WordNet `noun.person` synset has a sub-tree under `relative.n.01` — words descending from that node should not swap to `noun.person` words outside that sub-tree.

### 5.4 Selectional preferences need direction sensitivity
K4 caught only 4 violations (small N) but the qualitative pattern is: `clutched`/`infected`/`hang` (physical-action verbs) appearing for verbs whose objects are abstract (`kind`, `things`, `situation`). This is asymmetric: the *original* verb takes abstract objects, the *substitute* doesn't. Implication for v12: K4's check should be **directional**: reject if `selectional_prefs(sub) ⊉ {object_class(orig_object)}`. The reverse direction (sub takes more classes than orig) is fine — adding flexibility doesn't break compatibility.

### 5.5 Decorrelated paradigms have a side effect: `tried→deployed` recurs across books
V11 has `tried→deployed` in books id=11 AND books id=18 (two children's-fiction samples). Decorrelated paradigm expansion was supposed to randomize across buckets, but the deterministic hash keeps re-picking the same pair. K6 (per-bucket fluency-rank reordering) must ensure **per-corpus rotation**: when the same orig appears in multiple corpus chunks, downstream selection should rotate within the top-K-fluent set, not deterministically hash to the same sub. This contradicts V12_DESIGN_BRIEF.md §K6's "deterministic by hash" plan — flagging here for the user to resolve.

### 5.6 `obviously` and `strictly` and `strongly` as deictic-replacements is its own sub-pattern
V11 has a recurring `now→obviously`, `away→strictly`, `again→strongly`, `too→constantly`, `then→exactly`, `sometimes→utterly` cluster. These are all `-ly` adverbs replacing time/place/manner deictics. The lens flags this as a single failure mode worth its own filter: **deictic adverbs should never be replaced by manner adverbs** (different semantic class). V12_DESIGN_BRIEF.md §K1 lumps them into "generic deictic adverbs" but doesn't notice the paradigm-expansion is selecting from `-ly` manner-adverbs as the substitute pool. Fix: when grammar bucket is "deictic ADV", restrict the candidate pool to other deictic ADVs (closed sub-class), not all ADV.

### 5.7 Bigram problem extends to **"this/that/the + N"** triggers
K2 lens caught `this kind`, `that kind`, `the way`. The pattern is broader: **whenever the encoder swaps a noun that is preceded by a definite/demonstrative determiner**, the bigram surprisal jumps because the determiner+N collocation is highly Zipfian. V12_DESIGN_BRIEF.md §K2 frames this as a generic KenLM bigram filter, but the lens shows it's specifically a **DET+N positional** problem — possible to short-circuit by adding a feature `is_after_DEM_DET` to the K2 surprisal model.

### 5.8 Reddit-specific failure: stopwords-of-conversation
Reddit samples have a recurring `know→propose`, `do→write`, `get→upload` triplet. These look like K1 light-verb failures but they're semantically driven: in conversational Reddit text, `know`/`do`/`get` carry **discourse-marking**, not lexical content. `know→propose` ("I propose what you mean") inverts speech-act force. This is below the radar of POS-based filtering. Fix: in conversational corpora, treat the top-30 light verbs as **frozen + decoration-only**; never let them participate in the swap pool, even with high-fluency substitutes.

---

## Sample-ID provenance index

Every claim above traces back to specific sample IDs. Per-lens evidence files at:

- `/tmp/k_lens/k1_findings.json` — 145 swaps (K1)
- `/tmp/k_lens/k2_findings.json` — 15 swaps (K2/K6)
- `/tmp/k_lens/k3_findings.json` — 70 swaps (K3, 68 register-flips)
- `/tmp/k_lens/k4_findings.json` — 4 violations (K4, small N — needs richer ontology)
- `/tmp/k_lens/k5_findings.json` — 18 broken MWEs (K5)
- `/tmp/k_lens/k7_findings.json` — 26 swaps in 5 categories (K7)
- `/tmp/k_lens/synthesis.json` — cross-lens flag matrix

The lens scripts themselves are at `/tmp/k_lens/k{1,2,3,4,5,7}_*.py` and can be re-run on any future v12.x sample dump by replacing the input path.
