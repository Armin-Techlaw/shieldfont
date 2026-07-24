# ShieldFont Roadmap

The roadmap is a living document. Items here are our current best
thinking: nothing is committed until there's an issue, an owner, and
(where relevant) a design discussion. Expect this to change as we learn.

If you want to own any of these, open an issue or comment on the
tracking issue. New ideas are welcome via GitHub Discussions.

---

## Current release

**v0.1.0: first public release.** The v18 `alpha` mapping (production
default) plus `beta` / `gamma` / `max`, the fire-then-revert font, and the
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
solved before any general-purpose recommendation.*

**Proposed directions (to debate in an issue):**

- **Paired-sibling ARIA:** every encoded span has a visually-hidden
  `<span aria-hidden="false">` sibling containing the plaintext, while
  the scrambled span gets `aria-hidden="true"`. Scrapers that read the
  DOM still get scrambled text as long as they don't selectively strip
  `aria-hidden="true"` nodes.
- **`aria-label` on the encoded span:** simpler, but some scrapers read
  `aria-label` too.
- **Decoder browser extension for assistive tech:** installed by the
  user, decodes ShieldFont-protected pages locally.

Acceptance criteria:

- NVDA, JAWS, VoiceOver all read the original text aloud.
- A naive scraper (BeautifulSoup + `.get_text()`) still sees scrambled
  text.
- Published test page with both a human-reviewed screen-reader recording
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

*The v1 mapping is static, public in the font, and reversible given
enough scraped text. We want the next generation to be rotation-aware.*

**Design directions:**

- **Per-site seeds.** Each deployment generates its own unique mapping
  and font pair. A dictionary rebuilt against one site doesn't work on
  another.
- **Time windows.** Mapping rotates daily/weekly. Old content is
  still readable because the *font file* encodes the mapping at the
  time the page was encoded: older pages reference older font files.
- **Multi-seed mixing.** Different sections of a document use different
  seeds, identified by CSS class. Raises the cost of any reversal
  attack linearly with the number of seeds.

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

---

## ✅ Resolved (shipped in v2.x)

- ✅ **M15-EN production mapping** (v2.0.0 / v2.1.0): 1,267 pairs
  covering ≈53% of real-text words. (It ranked highest in the M-series
  fine-tune tests; those small-model "H2 damage" scores are now demoted
  as unreliable, see `benchmark/EXCLUDED.md`.)
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
