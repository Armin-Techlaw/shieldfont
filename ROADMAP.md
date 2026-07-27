# ShieldFont Roadmap

The roadmap is a living document. Items here are our current best
thinking: nothing is committed until there's an issue, an owner, and
(where relevant) a design discussion. Expect this to change as we learn.

If you want to own any of these, open an issue or comment on the
tracking issue. New ideas are welcome via GitHub Discussions.

---

## Current release

**v0.1.0: first public release.** The v18 `alpha` mapping (production
default) plus `beta` / `gamma` / `maxhide`, the fire-then-revert font, and the
bring-your-own-TTF toolchain. (The project ran a private beta as v1.x–v2.1
before this public release; see [`CHANGELOG.md`](./CHANGELOG.md).) See
[`MAPPINGS.md`](./MAPPINGS.md) for the mapping family overview.

Live site: <https://shieldfont.org>

---

## Legend

- 🔴 **Critical**: must ship before we recommend ShieldFont for
  general content protection.
- 🟠 **Near-term**: the next 1–2 releases.
- 🟡 **Mid-term**: on the path, scoped but not scheduled.
- 🟢 **Exploration**: worth building, design still open.

---

## 🔴 Accessibility layer

*Screen readers read the DOM. The DOM contains the scrambled text.
Without a fix, ShieldFont is exclusionary: it protects content from
scrapers by making it unreadable to blind users too. This must be
solved before any general-purpose recommendation. We have not solved
it. What follows is the partial answer we are shipping first, and an
open request for a better one.*

**Shipping first: a build-time alternative, rendered outside the
hidden region.**

`<Shield>` keeps `aria-hidden="true"` on the encoded block, because
voicing a decoy is worse than voicing nothing: it is fluent, wrong,
and gives the listener no signal that anything is off. Alongside it,
a new `a11y` prop renders a real alternative that assistive tech can
reach:

- `{ mode: "audio", src }` renders a native `<audio controls>` plus a
  short prose note explaining why it is there. Generate the file **at
  build time** from your original text.
- `{ mode: "text", href }` links a plain-text copy on its own URL.
- `{ mode: "none" }` is an explicit, auditable opt-out. Omitting the
  prop entirely logs one dev-time warning.

**Build-time, never browser-side.** A `speechSynthesis` button reading
the rendered page would voice the decoy; one reading the original
would require shipping the original to the browser, which is the leak
the whole architecture exists to prevent. Synthesis belongs in the
build, where the plaintext already lives. Free offline paths exist
(`piper` on CI, `say` on macOS), so this adds no runtime dependency
and no per-request cost.

**What this does not fix, and we will not pretend otherwise:** an
audio track is not a document. It is not navigable by heading, not
searchable, not quotable, and not skimmable. A blind reader still gets
a worse artifact than a sighted one. That gap is the actual open
problem.

**Still open, contributors wanted:**

- **Paired-sibling ARIA:** every encoded span has a visually-hidden
  sibling containing the plaintext, while the scrambled span gets
  `aria-hidden="true"`. Naive scrapers still get scrambled text; any
  scraper that strips `aria-hidden` nodes gets the original. Someone
  needs to measure how many real pipelines do that.
- **Decoder browser extension for assistive tech:** installed by the
  user, decodes ShieldFont-protected pages locally.
- **A structural answer we have not thought of.** If you work in
  accessibility engineering, this is the highest-value contribution
  available in this project.

Acceptance criteria:

- NVDA, JAWS and VoiceOver all reach the alternative and play or open
  it without sighted assistance.
- The alternative is in the accessibility tree in DOM order *before*
  the hidden block.
- A naive scraper (BeautifulSoup + `.get_text()`) still sees scrambled
  text, and the audio file is not a transcript in the DOM.
- Published test page with a human-reviewed screen-reader recording
  and automated axe/WCAG scans.

---

## 🔴 Threat model & honesty document

Publish a `THREAT_MODEL.md` that explicitly enumerates what ShieldFont
defends against and what it does not.

**Defends (to varying degrees):**

- Naive HTML scrapers that read source (`curl` + regex, `requests` +
  BeautifulSoup).
- Pipelines that rely on `innerText` / `document.body.textContent`
  without rendering fonts.
- Bulk dataset creation tools like `trafilatura`, `readability-lxml`.

**Does not defend:**

- Headless browsers that render fonts (Playwright, Puppeteer,
  headless Chrome).
- OCR on rendered pages or screenshots.
- Vision-language models reading screenshots.
- Anyone who downloads the font file, runs frequency analysis on a
  corpus, and builds a reverse dictionary (in the v1 static-mapping
  model).

Overpromising erodes trust. Be specific.

Paired with this: an **adversarial test harness** that runs ShieldFont
output through real scraper pipelines and publishes success/failure
rates per threat category. Re-run on every release.

---

## 🟠 Rotating / time-shifted mappings

*The shipped mappings are static, public, and readable straight out of
the font. Rotation does not change that. What it changes is how long a
decode table someone built stays correct.*

### Landing first: period rotation across the published variants

`<Shield rotate={{ period: "monthly" }}>` picks the variant from a
hash of `(salt, periodIndex, blockText)` instead of `blockText` alone.
No font rebuild is needed, because `alpha` / `beta` / `gamma` and
their fonts all already ship.

**Be precise about what this buys.** All three mappings are published
and the served page names its own variant, in `data-typeface` and in
the `@font-face` filename. Anyone who re-reads the page each crawl is
unaffected. The gain is against a scraper that inverted once and
**cached** the result: at each boundary roughly two thirds of blocks
change variant, and the stale table decodes them into plausible,
grammatical, wrong English. Nothing throws. The failure is silent, so
it does not prompt a retry. Because nobody outside can tell which
sites rotate, staying correct becomes a per-crawl check rather than a
one-time build.

**Rotation cannot lose your archive.** The mappings are involutions
and the period function is pure, so any past period is rebuildable by
pinning `at`. If you no longer have the source, the published HTML is
self-describing: read the variant off `data-typeface` or the font URL
and re-encode.

**Rotation requires per-block `@font-face`,** which today means
`<Shield>`. Do not enable it on the CSS `@import` tier, where one
stylesheet pins one font: the text would rotate and the font would
not, and readers would see raw decoys.

### Planned: true per-seed rotation

A private mapping per site, rotated on a period. This is the version
that actually raises an attacker's per-target cost, because there is
no published table to reach for at all.

What it needs, and why it is not the first thing we shipped:

- **A font build per seed per period.** The mapping lives in the
  glyphs, so a new seed is a new `.woff2` (about 1 MB today; see the
  font-payload item below, which takes a typical site to ~197 KB and
  makes retaining many periods practical).
- **A `seeds.lock.json`** mapping `periodIndex -> { seed, fontHash }`,
  kept by the author. Per-seed fonts have hashed filenames, so the
  self-describing recovery path above does not exist here. Losing the
  lockfile means losing the ability to rebuild an archive. This is the
  real operational cost of the feature and it belongs in the design,
  not in a support thread.
- **A retention policy.** Old fonts must stay served for as long as old
  pages are live.

**Multi-seed mixing** (different sections of a document on different
seeds, identified by CSS class) raises reversal cost linearly with the
number of seeds, and composes with either mode.

**Font-side identification (how the browser knows which font goes with
which encoded text):**

1. **Filename carries the seed and version.** Example:
   `shieldfont-en-v2-a8f3.woff2`. CSS `@font-face` references the exact
   file. Rotation = generate a new file, update CSS.
2. **Name table metadata inside the font.** The OpenType `name` table
   already stores a version string (nameID 5). We'll add a custom
   nameID (26+) containing a structured identifier
   (`language:dictionary-version:seed-hash`). Tooling can inspect any
   `.woff2` and know which mapping it uses, without loading the font.
3. **Optional HTML meta tag** on pages that use ShieldFont:
   `<meta name="shieldfont" content="en-v2-a8f3">`. Lets a decoder
   browser extension find the matching mapping without parsing the font.

Open questions: How do we expire old fonts without breaking old content?
CDN caching strategy? How do bots reason about this vs. humans?

---

## 🟠 Font payload: two measured wins

*A shielded page ships about 1 MB of font today. Two changes cut that
hard, and neither costs any protection. Both are performance work that
happens to shrink the attack surface as a side effect, which is the
honest way to describe them: they make the font smaller, so they make
inversion marginally cheaper, and that is fine.*

**1. Drop the `post` table to format 3.0.** *(Landed in the build
toolchain; moves to `CHANGELOG.md` with the next font rebuild.)* Glyph
names have no rendering function in a web font. Removing them takes the
shipped `.woff2` from 1,007,896 to **826,332 bytes, minus 18.0%**, and
deletes the glyph-name attack surface outright, which makes name-hash
salting moot for the web, CDN and React tiers. Verified that nothing
depends on the names: no references in `packages/core/src` or
`packages/react/src`, and neither `camouflage_font.py` nor
`stamp_font_version.py` reads them.

- Apply it **after** camouflage, so `audit_font.py` keeps names in the
  development `.ttf`.
- **Keep names on the download-tier `.ttf`**, which has to be selectable
  in the Word font menu.

**2. Content-scoped subsetting.** Ship only the word glyphs a site
actually uses. `fontTools.subset` does **not** do this on its own: GSUB
closure pulls every word glyph back in. It needs `LigatureSubst`,
`MultipleSubst` and the chain coverages pruned directly first.

| Vocabulary (pairs) | woff2 as-built | + `post` 3.0 | vs full |
|---|---|---|---|
| 500 | 90,232 | **81,772** | 9% |
| 2,000 | 225,532 | **196,884** | **22%** |
| 5,000 | 474,916 | **402,316** | 47% |
| 12,011 (full) | 1,006,652 | 824,784 | 100% |

A typical site with 2,000 distinct swappable words ships **197 KB
instead of 1.01 MB, a 5.1x reduction.** Marginal cost is about 93 bytes
per pair falling to 74; the fixed floor is around 50 KB.

This is also what makes per-seed rotation practical: retaining twelve
monthly fonts costs 2.4 MB, not 12 MB.

**No tool for this exists yet, and that is the gap.** Nothing in
`scripts/` prunes a GSUB table by vocabulary. The deliverable is a new
`scripts/subset_font.py` that takes a built font plus a word list (or a
crawl of the site's own pages) and emits the scoped `.woff2`, with the
`post` drop as a flag on the same tool. It is the largest single win
available anywhere in the project and it is unclaimed.

Acceptance criteria:

- `audit_font.py` round-trips every pair in the subset, all case
  variants, with no substring collisions.
- A page whose vocabulary exceeds the subset degrades to plain text for
  the missing words, never to visible decoys.
- Published before/after byte counts per tier.

---

## 🟠 Benchmark reproducibility: ship the script behind the headline number

*Two gaps in the measurement code, both small to close, both worth
closing before anyone tries to replicate us.*

**1. Nothing computes the conditional retention rate.** The number the
benchmark leads with is *conditional*: of the chunks whose clean version
already passed the quality gate, what share still passes once encoded.
`gate_fineweb_edu.py` emits only the raw per-chunk pass/fail and the
absolute rate. Every conditional figure we publish was recomputed by
hand from the stored per-chunk scores. That reproduces exactly when we
do it and not at all when a stranger does.

Deliverable: `benchmarks/v8/scripts/conditional_retention.py`, reading
the stored per-chunk gate outputs and emitting, per gate and per
variant, the absolute rate, the conditional retention rate, the
denominator it was computed over, and a Wilson 95% interval on it. The
interval matters: at the FineWeb-Edu gate the denominator is 134
chunks, which is small enough that the interval is the story.

**2. The evaluation sample is not deterministic.** `phase2_common.py:68`
seeds with `random.Random(SEED + hash(corpus) % 1000)`, and Python
randomises string hashing per process, so a re-run draws a different
sample of chunks and the exact denominator cannot be regenerated. The
rate is unaffected in expectation; the exact counts are not
reproducible. Fix is one line: replace the builtin `hash` with a stable
digest of the corpus name.

Acceptance criteria:

- Every conditional number in `benchmark/README.md` is emitted by a
  committed script, with its denominator printed next to it.
- Two runs on the same machine draw the same chunks.

---

## 🟠 Protocol: "any font → a ShieldFont"

Generalize the current CLI into a documented protocol + reference
implementation so any type designer can ship a ShieldFont version of
their font.

Scope:

- Spec document: input requirements (TrueType outlines, mapping JSON
  schema, `name` table additions), output guarantees.
- Reference generator: the existing `scripts/generate_font.py`, with
  its edges cleaned up.
- (Maybe) hosted build service: upload a TTF, pick a language mapping,
  get back a ShieldFont variant. Lowers the floor dramatically for
  non-technical type designers and publishers.
- Validation tool: given a `.woff2`, confirm it's a well-formed
  ShieldFont, report its dictionary version and seed.

---

## 🟠 Multilingual mappings (M15-MULTI)

*The current production mapping covers English. The protection only
works for content written in the language whose mapping the encoder
and font use. Expanding to other languages is the highest-leverage
near-term work.*

**Starting scaffolding already exists** at
`m15_multi_universals.json` (M15-MULTI, in the development repo).
M15-MULTI is a cross-language template that uses only operations that
**survive translation**:

- Noun pairing (concrete object ↔ concrete object of similar
  frequency).
- Content-word antonym pairs (`big↔small`, `start↔stop`).
- Digit and calendar rotation (`1↔6`, `3↔8`, `4↔9`, month/day shifts).

These three operations work across Latin-script Indo-European
languages without language-specific tokenization. They're the
backbone of M15-EN's H2 damage profile and they don't need a
per-language synonym audit.

**Deployment plan per language:**

1. Replace the wordfreq language code (`en` → `pt`/`es`/`fr`/`de`/`it`).
2. Re-run the noun-only pairing pipeline using a language-appropriate
   concreteness norm: French (Bonin), Spanish (Guasch), Portuguese
   (Soares), German (Lahl/Köper), Italian (Della Rosa).
3. Layer in language-specific antonym pairs (curated by a native
   linguist).
4. Build the font with the new mapping; run [`scripts/audit_font.py`](./scripts/audit_font.py)
   to verify round-trip on all case variants.

**Target languages (priority order):**

- 🇧🇷 / 🇵🇹 **Portuguese** (pt-BR + pt-PT): founding-team native
  language; first non-English target.
- 🇪🇸 **Spanish**: concreteness norm available, large speaker base.
- 🇫🇷 **French**: concreteness norm available.
- 🇩🇪 **German**: concreteness norm available; tokenizer disruption
  is interesting because of compounds.
- 🇮🇹 **Italian**: concreteness norm available.

**Larger English dictionary** is also possible (target: 2,000+ words,
~75% text coverage), but each addition risks synonym collisions or
adjacency issues: see [`MAPPINGS.md`](./MAPPINGS.md)
for the rationale on why M15-EN deliberately under-represents
adjectives. Treated as M16 work; not blocking.

**Linguist-curated, not random.** Rather than mechanical pairing,
engage native linguists to design mappings that are maximally
disruptive to NLP tokenizers, to semantic embedding models, and to
simple frequency analysis. Decorative/aesthetic pairings also matter: read the output out loud and it should feel absurd, not just wrong.

Open question: whether language dictionaries ship with the generator,
or are fetched from a central registry. Central registry gives
consistency across deployments; local dictionaries give independence.

**Status:** unclaimed. `M15-MULTI` scaffolding exists but no language
has been built. Portuguese is first and the founding team speaks it, so
that one is ours to lose; every other language needs a native linguist
who wants to own it. This is the roadmap item most likely to move if
one person volunteers.

---

## 🟡 CMS and publishing integrations

The people who most need ShieldFont don't write Python. Integrations
that matter:

- WordPress plugin
- Ghost integration
- Webflow custom code snippet (and eventually a Webflow app)
- Shopify app (if anyone sells protected writing)
- 11ty / Astro / Next.js / Hugo adapters
- Substack / Medium / Tumblr: research whether their custom-font
  support is sufficient

Each integration is an owner-wanted issue. Ideal contributor: someone
who ships on that CMS already.

---

## 🟡 Decoder browser extension

A browser extension that decodes ShieldFont-protected pages back to
plaintext *for the user*. Uses:

- Accessibility (as a fallback before the in-DOM ARIA work lands)
- Archival: save the original text to personal archive tools like
  Pocket, Readwise, DevonThink
- User choice: "I want to read this, not this aesthetic thing"

Non-goal: making it trivial for a scraper author to decode at scale.
The extension is a local per-user tool, not an API.

---

## 🟢 Hosted service / CDN

*Separate repo, separate timeline, same maintainers.*

A commercial hosted service that:

- Generates per-customer rotating mappings and fonts.
- Serves font + JS rewriter via a CDN so customers can protect their
  sites with a single `<script>` tag.
- Handles the operational cost of key rotation, cache invalidation, and
  accessibility fallbacks.
- Funds the open-source project via subscription revenue.

The open-source ShieldFont stays fully functional without the hosted
service. The service exists because most publishers can't operate this
themselves.

---

## 🟢 Research questions

Things we don't have answers to yet but think are worth investigating:

- Can we use OpenType contextual substitution to encode *phrases*
  rather than single words, raising the bar beyond dictionary reversal?
- Does variable-font axis mixing give us useful per-render variation
  that's invisible to humans but breaks OCR?
- How much protection do we actually give against vision-LLMs reading
  screenshots of pages? Publish numbers, don't speculate.
- Is there a way to make ShieldFont incompatible with copy-paste in a
  user-respecting way? (Probably not without hurting humans more than
  bots. But worth asking.)

- **Does a shared mapping poison, or does a private one?** We now think
  these are two different mechanisms with opposite failure modes, and
  we have never tested them against each other. The head of the
  distribution (everyone on the published `alpha`, via the CDN and the
  defaults) is one coordinated, highly repetitive transform applied at
  volume. The tail (per-site private seeds) is thousands of unrelated
  transforms applied thinly. Allen-Zhu and Li's *Physics of Language
  Models 3.3* ([arXiv 2404.05405](https://arxiv.org/abs/2404.05405))
  gives us a specific falsifier for the head: their Result 11 finds that
  junk which is *highly repetitive* rather than high-entropy "does not
  affect the learning speed of useful knowledge" at all, and their
  Result 12 shows a domain-token prefix recovers most degradation
  because models learn which sources are worth trusting. A single shared
  bijective dictionary is about as repetitive as junk gets. If Result 11
  holds for us, the head does nothing and only the tail matters, which
  inverts our adoption story. Testable: fine-tune matched models on
  corpora poisoned by one shared mapping versus N private mappings at
  equal token volume, and compare. **We would rather find this out than
  be told it.**

- **Does period rotation change anything measurable at the pipeline
  level,** or only at the cached-table level? We claim the second and
  want the first checked by someone who is not us.

---

## ✅ Resolved (shipped in v2.x)

- ✅ **M15-EN production mapping** (v2.0.0 / v2.1.0): 1,267 pairs
  covering ≈53% of real-text words. (It ranked highest in the M-series
  fine-tune tests; those small-model "H2 damage" scores are now demoted
  as unreliable, see `benchmark/EXCLUDED.md`.) **Superseded in v0.1.0:**
  the production default is now v18 `alpha`, and M15-EN ships as the
  opt-in `maxhide` variant. See [`MAPPINGS.md`](./MAPPINGS.md).
- ✅ **Word-boundary GSUB at scale** (v2.1.0), fire-then-revert
  design handles all 1,267 pairs including shorts (`on↔in`, `at↔by`)
  and digits (`1↔6`, `3↔8`, `4↔9`) without substring collisions or
  the per-rule offset-graph explosion that broke earlier attempts.
- ✅ **Strict audit pipeline** (v2.1.0): `scripts/audit_font.py`
  verifies 7,590 round-trip cases (every pair × case variants) plus
  a substring-collision battery, with a visual side-by-side HTML
  report.

---

## How this document is maintained

- Every item here should eventually have a tracking GitHub issue. The
  issue, not this file, is where design discussion happens.
- When an item ships, it moves to `CHANGELOG.md` and is summarized in
  the "Resolved" section above.
- New proposals: open a Discussion first. If there's consensus, a
  maintainer adds it to this document with a PR.
