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

## 🟡 Accessibility layer

*Nobody hears gibberish. `<Shield>` marks the encoded block
`aria-hidden="true"`, so assistive software skips it rather than
voicing a decoy, and the `a11y` prop puts a real alternative in the
accessibility tree beside it. Since the plain-text mode landed, the
author has to produce nothing at all for the text route:
`a11y={{ mode: "text" }}` on its own is a complete configuration. It
has been driven through a virtual screen reader in CI and by hand with
real VoiceOver on macOS. What is still open is **NVDA and JAWS**, the
focus indicator a sighted keyboard user loses to an invisible control,
and that the CDN and `@shieldfont/core` tiers ship none of this
machinery.*

**Shipping now: an alternative rendered outside the hidden region, in
two shapes.**

`<Shield>` keeps `aria-hidden="true"` on the encoded block, because
voicing a decoy is worse than voicing nothing: it is fluent, wrong,
and gives the listener no signal that anything is off. Alongside it,
the `a11y` prop renders a real alternative that assistive tech can
reach, as a sibling **outside** the hidden region and **before** it in
DOM order:

- `{ mode: "text" }` ships the block's real words **encrypted into the
  page** and gives the reader a button that grinds out the key in their
  own browser. Nothing to generate, nothing to host, no server. The
  control is **screen-reader-only by default**: nothing about it appears
  on screen, the unlocked words go to assistive technology clipped
  off-screen, and the encoded block stays visible and unchanged. Optional
  `seconds` (20, range 5..120), `reveal: "hidden" | "visible"`, `label`,
  `note` and `visualHidden` (default `true` here, `false` for audio).
  Full reference: [`docs/plain-text-mode.md`](docs/plain-text-mode.md).
- `{ mode: "audio", src }` renders a native `<audio controls>` plus a
  short prose note explaining why it is there. Generate the file **at
  build time** from your original text.
- `{ mode: "none" }` is an explicit, auditable opt-out. Omitting the
  prop entirely logs one dev-time warning.

**Why the text mode is not a link.** Two things shipped in `0.2.0` and
were both removed: a `{ mode: "text", href }` linking a plain-text copy
on its own URL, and an optional `transcript` link on the audio mode.
One reason for both. A URL cannot be handed to a screen reader without
being handed to everyone else, and the same crawl that reads the decoy
reads the link sitting beside it — one line of scraper code follows it
and gets the original. A block carrying either was strictly less
protected than an unwrapped one while still looking protected.

The mode that came back inverts that trade instead of repeating it. The
words are in the page but closed, and the key is not in the page
either: it is the answer to a **time-lock puzzle** (Rivest–Shamir–Wagner,
1996) that the reader's browser has to grind out. `n = p·q`, and the key
is `2^(2^T) mod n` — T sequential squarings, each needing the answer to
the one before, so the work **cannot be parallelised**. A crawler with a
thousand GPUs still pays T sequential steps per block; its only edge is
a faster single core. The builder holds the trapdoor (it knows `p` and
`q`, which collapses the tower to two modexps), so sealing costs **62 ms
per block** against a default budget of twenty seconds of the reader's
own CPU, and the primes are discarded and never returned. Fresh primes per block per build: solving
one block teaches nothing about the next, and every redeploy invalidates
every solution already computed — including your readers' caches, which
is the same property working in both directions.

**Difficulty is bounded above by OCR, not by paranoia.** A crawler that
wants the words can always render the page and read the pixels for
roughly three seconds of server CPU, whether or not this feature exists.
That is the floor on the whole package's protection and no cryptography
raises it. So the target was never "expensive", it is **not cheaper than
OCR** — enough that the accessible path stops being the *shortcut*, and
no further. Past that point extra difficulty buys nothing (the crawler
takes the cheaper door) and is paid for entirely by disabled readers
waiting longer. Default `seconds: 20`, accepted range 5..120. State the
ceiling wherever you state the default, or someone will "harden" a page
by raising it.

Measured: 2048-bit modulus, 5,000,000 sequential squarings at the
default, and **7.6 s to open it in Chrome on a desktop**. The rate used
for labelling — 250,000 squarings/second — is deliberately conservative,
roughly a mid-range phone, so `seconds` is a budget denominated on a slow
device rather than a promise about any particular one.

**What the invisible control costs.** `visualHidden` clips with
`clip-path` rather than `display:none`, so the control stays in the
accessibility tree; removing it from the tree is the exact bug the prop
exists to fix. For `mode: "text"` it now defaults to **`true`** — the
whole control is screen-reader-only, because a sighted reader can already
read the block and would otherwise get an unexplained widget attached to
text that looks fine. The price is real: a sighted person navigating by
keyboard **without** a screen reader Tabs into a control they cannot see
and loses their focus indicator, which fails **WCAG 2.2 SC 2.4.7**. The
skip-link remedy (clipped until focused, visible while focused) was
deliberately not taken, because the control was asked to be invisible.
`visualHidden: false` restores an on-screen control. The audio mode keeps
its player on screen by default: a player nobody can see is a player
nobody can press.

**React only.** If you use the paste-in CDN stylesheet or
`@shieldfont/core` directly, none of the above happens for you: you set
`aria-hidden` on the encoded region yourself, and you supply the
alternative yourself. Closing that gap for the non-React tiers is part
of what remains.

**Audio is synthesised at build time, never in the browser.** A
`speechSynthesis` button reading the rendered page would voice the
decoy; one reading the original would require shipping the original to
the browser in the clear, which is the leak the whole architecture
exists to prevent. Synthesis belongs in the build, where the plaintext
already lives. Free offline paths exist (`piper` on CI, `say` on
macOS), so this adds no runtime dependency and no per-request cost.
(The text mode *does* work in the browser, and does not contradict
this: what it ships is ciphertext, and the reader's CPU is the price of
opening it.)

**What this does not fix, and we will not pretend otherwise:**

- **OCR is still cheaper.** The text mode stops the accessible path
  being a shortcut. It does not stop scraping and it is not a wall.
- **A reader who needs it waits.** Everyone else has the words
  instantly. That is unequal access however carefully it is engineered:
  a compromise, not a solution.
- **It needs JavaScript**, plus `BigInt` and `crypto.subtle`. The rest
  of ShieldFont works with JS off — the font does that work — so this is
  the one part that does not. `crypto.subtle` is also absent on insecure
  origins, so plain `http://` breaks it.
- **A sighted keyboard user loses their focus indicator.** The text
  mode's control is invisible by default, so someone Tabbing through the
  page without a screen reader lands on something they cannot see —
  **WCAG 2.2 SC 2.4.7**. Deliberate, not an oversight, and
  `visualHidden: false` opts out of it. It is an open problem, not a
  settled one.
- **Once revealed, the plaintext is in the DOM.** A crawler that runs a
  real browser, presses the button and waits gets the words, having paid
  the cost. That is the deal, not a leak.
- **Audio still fails WCAG 2.2 SC 1.2.1 (Level A).** Audio-only content
  with no text alternative fails that criterion, the audio mode's
  `transcript` link was this layer's only answer to it, and the text mode
  does **not** rescue it — they are separate alternatives an author picks
  between, so a block using `{ mode: "audio" }` alone still has no way to
  satisfy 1.2.1. Do not let the good news blur that.
- An audio track is also still not a document: not navigable by heading,
  not searchable, not quotable, not skimmable.

**Still open, contributors wanted:**

- **NVDA and JAWS.** The text mode is verified under
  `@guidepup/virtual-screen-reader` in Playwright and by hand with real
  **VoiceOver on macOS** — which is where the group chatter, the
  announcements that cut each other off and the text that could not be
  re-read were all found. Windows is untouched: **NVDA and JAWS remain
  unverified**, and every fix VoiceOver forced is a reason to expect
  they will find their own.
- **A focus indicator for sighted keyboard users.** The invisible
  control fails WCAG 2.2 SC 2.4.7 for anyone Tabbing without a screen
  reader (above). `visualHidden: false` is an escape hatch, not an
  answer; a design that keeps the control out of a sighted reader's way
  *and* out of their tab order — or visible once focused without looking
  like an error — would close this.
- **Parity for the non-React tiers:** the CDN paste-in and
  `@shieldfont/core` leave `aria-hidden` and the alternative entirely
  to the author. Whatever the answer is, it has to work without a
  React render. The puzzle primitive itself is already framework-free
  (`@shieldfont/core/puzzle`); the control around it is not.
- **Paired-sibling ARIA:** every encoded span has a visually-hidden
  sibling containing the plaintext, while the scrambled span gets
  `aria-hidden="true"`. Naive scrapers still get scrambled text; any
  scraper that strips `aria-hidden` nodes gets the original. Someone
  needs to measure how many real pipelines do that — and note that this
  is the *inline* version of what `mode: "text"` did with a URL, so it
  has to clear the same bar: if the plaintext is retrievable for one
  extra line of scraper code, it is not shippable here either. The
  time-lock mode clears it by making retrieval cost sequential compute
  rather than a fetch; a visually-hidden sibling has no such story yet.
- **Decoder browser extension for assistive tech:** installed by the
  user, decodes ShieldFont-protected pages locally.
- **A structural answer we have not thought of.** If you work in
  accessibility engineering, this is the highest-value contribution
  available in this project.

Acceptance criteria, and where we stand against them:

- The alternative is in the accessibility tree in DOM order *before*
  the hidden block. **Met** in `<Shield>`, with unit tests over the
  rendered output.
- A naive scraper (BeautifulSoup + `.get_text()`) still sees scrambled
  text, and the alternative is not plaintext in the DOM. **Met**, and
  more cleanly than before: the alternative is either an audio file or a
  ciphertext, and there is no longer any link to follow either. This
  criterion is what killed the old `{ mode: "text", href }` and the
  audio mode's `transcript` link, and it is the criterion the new text
  mode was designed against — retrieval costs sequential compute rather
  than a fetch, so `.get_text()` gets the decoy and a real crawler pays
  more than it would pay for OCR.
- NVDA, JAWS and VoiceOver all reach the alternative and play or open
  it without sighted assistance. **VoiceOver: partially met**, by hand
  on macOS, alongside an automated pass under
  `@guidepup/virtual-screen-reader` in Playwright. The manual session is
  what found the group chatter, the truncated announcements and the
  revealed text that could not be re-read, all now fixed. **NVDA and
  JAWS: not done.** Neither has been run against it.
- Published test page with a human-reviewed screen-reader recording
  and automated axe/WCAG scans. **Not done.** No axe scan has been run
  and no test page is published.
- A sighted keyboard user keeps a visible focus indicator throughout
  (WCAG 2.2 SC 2.4.7). **Not met**, deliberately, at the default
  `visualHidden: true` for `mode: "text"`. `visualHidden: false` meets
  it at the cost of an on-screen control.
- The same guarantees available outside React. **Not started.**

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

## 🟡 Benchmark reproducibility: extend the script behind the headline number

*One gap closed, one still open.*

**1. ~~Nothing computes the conditional retention rate~~ — partially fixed.**
The number the benchmark leads with is *conditional*: of the chunks whose
clean version already passed the quality gate, what share still passes once
encoded. `gate_fineweb_edu.py` emits only the raw per-chunk pass/fail and the
absolute rate; every conditional figure used to be recomputed by hand from the
stored per-chunk scores, which reproduced exactly when we did it and not at
all when a stranger did.

`benchmark/data/verify.py` now does this for the FineWeb-Edu gate: it reads the
stored per-chunk scores directly and reproduces 9.70% (13/134) as one command.
**Still open:** extend it to the other three instrumented gates (per-corpus
KenLM, Pythia-160M, Wiki-KenLM), and emit a Wilson 95% interval per gate and
per variant — the interval matters, since at the FineWeb-Edu gate the
denominator is 134 chunks, small enough that the interval is the story.

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
