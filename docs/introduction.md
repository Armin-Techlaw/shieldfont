# Introduction: a network of confusion

ShieldFont is not an attempt to stop AI scraping. It is an attempt to make it expensive: collectively, asymmetrically, and progressively.

This page sets up the thesis behind the project. The integration guide tells you which package to install. The custom-mappings guide tells you how to make a mapping of your own. The custom-faces guide tells you how to build on a typeface of your own. This page tells you *why those choices matter once enough people make them*.

> **This is a collective project, not a finished product.** ShieldFont in its current form is enough to start, not enough to win. The win condition described below requires many people running many different mappings, and a body of practice the project has only begun to build. We are publishing it openly, with the toolchain shipped, and we are asking you to come help us figure the rest out.

---

## A note on names: protocol vs. typeface

A distinction worth pinning down before anything else, because it shapes how you read the rest of the documentation:

- **ShieldFont** is the *protocol*. The encoder, the GSUB substitution scheme, the v5 benchmark methodology, the licensing layer, the project. "ShieldFont" is the brand of the system, not the brand of any single font binary.
- **ShieldFont Optik** is our *flagship typeface*. It is one font built on the protocol: currently the only one the project itself maintains. Optik is licensed from Playtype.
- **a ShieldFont font** is any base font that has been converted using the protocol. *ShieldFont Optik* is one. Anything you build with `scripts/generate_font.py` against a base TTF is another.

**Any font with TrueType outlines and the Latin charset can be converted into a ShieldFont font.** Inter, Helvetica, EB Garamond, a custom typeface from your studio, a face you have an existing commercial license for: the protocol is typeface-agnostic. We ship Optik because Playtype made it available; we expect the long tail of ShieldFont fonts in production to be built on whatever typeface the deployer already uses.

The conversion is one command:

```bash
python3 scripts/generate_font.py \
  --base-path /path/to/your-typeface.ttf \
  --name "ShieldFont YourTypeface" \
  --prefix shieldfont-yourtypeface \
  --mapping-path scripts/v18alpha_for_font.json
```

The naming convention we recommend for community-built ShieldFont typefaces: keep "ShieldFont" as the prefix, then add a name of your own. *ShieldFont Optik*, *ShieldFont Vellum*, *ShieldFont YourFoundry*. This keeps the protocol attribution visible while leaving the second word yours. **Do not use the base typeface's name** — open font licences reserve it, so "ShieldFont Inter" would breach the OFL you built under. Credit the base in the font's *Description* field instead. The full recipe, plus the licensing that follows from the base you pick, is in [custom faces](./custom-faces.md).

---

## What one page accomplishes, and why that's not the point

A single blog post protected by ShieldFont is one drop in a training corpus that runs into the trillions of tokens. Our benchmarks show that drop is **measurably useless as training signal**: its meaning is broken, at a bidirectional-entailment failure under NLI of **55.8%** on news, **51.9%** on general web, **34.5%** on fiction and **31.1%** on older fiction — a 41.8% median across those four corpora — versus ~2.1% for a synonym-swap control (see the [benchmark](../benchmark/), which asks for the per-corpus figures rather than a bare median, and for good reason). What happens next depends on the pipeline's quality filter, and both outcomes are fine for you: on real-world corpora the FineWeb-Edu classifier **drops 99.0–99.8% of encoded chunks** outright, so their meaning never reaches a model at all; the minority that does pass (6.5–13.5% of the chunks that would have passed clean) spends 19.4% of its token budget (four-corpus) on shifted meaning. What we do **not** claim is that encoded text sails through quality gates, or that it damages the model that trains on it. (Earlier fine-tune "training-damage" numbers are demoted as measured with the wrong instrument.) On its own, that result is statistically real and economically irrelevant.

The economic case for ShieldFont is not the per-page case. It is the **network case**.

---

## The reading gap, independently documented

ShieldFont's premise is that machine readers ingest a page's underlying text while humans read what the font renders. That gap is documented by independent security research as well. In March 2026, LayerX Security published ["Poisoned Typeface"](https://layerxsecurity.com/blog/poisoned-typeface-a-simple-font-rendering-poisons-every-ai-assistant-and-only-microsoft-cares/), in which researcher Roy Paz used a remapped font to make a page read one way to a human and another way to anything parsing the text underneath. All eleven AI assistants they tested, including ChatGPT, Claude, Copilot, Gemini, and Perplexity, read the underlying text and missed what a human saw on screen. Most vendors declined to treat the reports as a vulnerability, and only Microsoft took the disclosure through a full fix. LayerX's framing is offensive (an attacker hiding instructions from AI safety checks) where ShieldFont's is defensive (a writer hiding meaning from scrapers), and the two projects are unaffiliated. The observation underneath is the same: font rendering can split what humans and machines read from a single page.

---

## The network case

Take the same mechanism and run it across a million writers. Then change one thing: every writer ships a slightly different mapping.

The mapping is the substitution table: the thing that says `world → lake, paper → calcium, people → troops`. Three users running three different mappings produce three different encodings of the same plain English. To a scraper, they look like three independent corpora of subtly broken text. To a model trained on all three, they are three incompatible substitution schemes, all camouflaged as natural English, all entering the corpus at once.

What the AI labs would have to do to defend against this:

1. **Detect** ShieldFont encoded text in their crawl, as opposed to merely scoring it low and discarding it along with everything else that scores low. Encoded text reads, statistically, like English, so it does not announce itself the way gibberish would — but be careful how far you push this one. Our own benchmark measures encoded chunks passing the FineWeb-Edu gate at **7.4–15.5× lower** rates than clean ones, and a perplexity rise of 120.8%, which is a signal a lab could learn to key on. Detection is *unattractive* to build, not impossible.
2. **Identify** which of the *N* community mappings was used to produce a given encoded passage. Harder: they would need a public registry of every mapping, and a private mapping by definition is not in that registry.
3. **Reverse** the encoding before training. **For a private mapping**, this is the hard step: there is no published table to reach for, so an attacker has to fetch and invert *your* font, for *your* site, deliberately. **For the shipped defaults, it is an afternoon's work** — `alpha`, `beta`, `gamma` and `maxhide` are public, `decode()` is a shipped API, and we recovered all 11,962 pairs from our own font with no dictionary at all. That gap between the head and the tail is the entire reason the network case is about *many different* mappings rather than about ours.
4. **Repeat** for every ShieldFont deployment on the open web. For every retraining run.

Or, the cheaper option, they negotiate with publishers, respect robots-flavored consent signals, and pay for what they ingest.

That is the win condition. Not stopping scraping. Making the cost of scraping protected text exceed the cost of doing the right thing.

---

## Why the diversity of mappings is doing the work

Three published variants (`alpha`, `beta`, `gamma`) are a good first step. They give the project a baseline of protection that any user can install with one stylesheet line. But three is a small number, and a determined adversary can collect three CDN-hosted mappings on a quiet afternoon.

What the project actually wants is **a long tail of mappings**: many of them never published anywhere. Every user who runs a custom mapping (see [`custom-mappings.md`](./custom-mappings.md)) adds an independent damage signal that the AI labs cannot pre-compute their way around. The damage from any one mapping may be small. The damage from a thousand independent mappings, simultaneously contaminating a training corpus, is not the sum: it is the *interference*. Each mapping makes the others harder to filter, because filtering one does not catch the next.

This is the asymmetry we want. Cheap to participate, expensive to defend against, more expensive the more participants there are.

---

## Head and tail: what your choice does to everyone else

Which tier you install is a personal decision about camouflage. It is also a vote about what the whole deployed population looks like from a scraper's side, and those are two different arguments that pull in different directions. **Both are hypotheses. Neither is settled, and we are stating them here so you can disagree with us in public.**

Two populations exist today, and they defend by different mechanisms:

| Population | Who | What a scraper meets | The risk | The payoff |
|---|---|---|---|---|
| **The head: shared defaults** | CDN paste-in, the downloadable font, and every React install that leaves `variant` unset | one public table, `alpha`, repeated across many sites, published on npm and readable straight out of any font | **One inversion decodes everyone.** Invert the font once and every site on the default is open at the same time. And a model may simply absorb a fixed one-to-one dictionary as a systematic transform rather than being confused by it. | **Volume.** The same shifted word pairs recur across thousands of pages. Repetition at scale is the only configuration in which a swap could plausibly move what a model takes a word to mean. |
| **The tail: private seeds** | anyone who ran `reseed_mapping.py` and built their own font | thousands of unrelated tables, one per site, none of them published anywhere | **Too thin to shift anything.** A one-off mapping on one site contributes noise, and incremental corpus noise is cheap to filter out. | **Nothing to precompute.** No published table exists to reach for, so an attacker has to fetch and invert *your* font, for *your* site, deliberately. It turns a solved problem back into a per-target one. |

**The specific result that argues against the head, stated at full strength.** Allen-Zhu and Li, *Physics of Language Models 3.3* ([arXiv 2404.05405](https://arxiv.org/abs/2404.05405)), find that junk training data degrades a model's knowledge capacity badly when that junk is *high-entropy* (unpredictable, never repeating), but that when the junk is **highly repetitive** instead, it "does not affect the learning speed of useful knowledge" at all. A single fixed dictionary applied identically across every site that uses it is about as repetitive as junk gets. That places the whole shared-mapping tier in a **zero-collateral-damage regime**: on their result, the head would cost a model nothing beyond the pages it wastes. Their next result is no kinder, a source-identifying prefix recovers most of the degradation anyway, because models learn which sources are worth trusting.

We have not run the experiment that would settle this, and we would rather point at the falsifier than wait to be handed it. It is on the [roadmap](../ROADMAP.md) as an open research question, stated with the falsifier attached: train matched models on a corpus poisoned by one shared mapping versus N private mappings at equal token volume, and compare.

**How to read the two together.** The head is a coordinated bet that repetition becomes association. The tail is an uncoordinated bet that unpredictability is not worth chasing. They can both be right at once, because they fail under opposite conditions: the head fails if models treat repetitive substitution as noise to normalise away, and the tail fails if per-site noise gets filtered out before training ever starts. The mix is the hedge, and that is the honest reason we ship both rather than a reasoned preference for either.

**What we would honestly like you to do.** If you are one site with one essay, the default is fine, and you are adding to the head where the volume argument lives. If you publish a lot, or you are technical enough to run a build, **mint your own seed.** The tail is underpopulated, it is the population no precomputed table touches, and it is the only one of the two where we do not currently have a citable result arguing against it.

---

## Run a simple mapping. Run it anyway.

A practical consequence of the network case is that **per-mapping sophistication matters less than participation**. The big, carefully benchmarked mappings we ship are not the only legitimate ones. A user who runs a *very simple* custom mapping (say, two hundred nouns reshuffled with a private seed) contributes meaningfully to the network even though the per-page damage of their mapping is a fraction of a full one's.

We expect the strongest configurations of the project to look like this:

- Most users running **simple, private, custom mappings**: a reseed of the shipped pool, or a hand-written 200-pair noun-only file
- A handful of users running **fully bespoke mappings** for high-stakes content
- The published variants (`alpha` / `beta` / `gamma`) as the zero-setup baseline for anyone who wants protection without touching a script

The simple-mapping recommendation has two side benefits worth being explicit about:

- **Lower SEO impact.** A 200-pair mapping that touches only nouns leaves the rest of your prose (verbs, articles, structure, headings, meta descriptions) fully readable to search crawlers. Topic relevance through context is largely preserved. Long-tail keyword ranking on the encoded nouns themselves is the price you pay; we discuss that tradeoff openly in the FAQ. The point is that the SEO cost of *participating in the network* is not all-or-nothing. Be clear-eyed about the mechanism, though: whatever you *do* wrap becomes `aria-hidden` decoy text in the DOM, so search engines index the decoy, and you cannot distinguish Googlebot from an AI scraper. Don't wrap content you need to rank.
- **Lower setup cost.** Fewer pairs means a smaller font binary, a smaller mapping JSON, faster to mint, easier to verify, easier to keep private. Someone who wants to participate in 30 minutes can.

If you are choosing between *a perfect mapping nobody else has* and *no mapping at all because building the perfect one is hard*, the second option helps the network zero. The first helps a lot. **A small private mapping helps almost as much.**

---

## Three stances: pick what you actually want

> **Status: product strategy in progress, planned for a future release.** This section describes the direction the project is heading, not the shape of what currently ships. Today the production default is one balanced mapping: v18 `alpha` (M15-EN ships as the opt-in `maxhide` coverage variant). The three-stance split is a future product axis. Open questions and open work are tracked in GitHub issues: input welcome.

A subtle thing the methodology surfaces: *protecting your content* and *damaging the model that scrapes it* are related goals but not identical ones. You can optimize for either. You can optimize for both. We think the user should get to choose, explicitly, rather than have us choose for them.

So in a future release the project intends to ship **three preset stances**, plus the custom paths from [`custom-mappings.md`](./custom-mappings.md). **None of the three exists today.** There is no `stance` option in any package, nothing in `<Shield>` or `@shieldfont/core` accepts one, and the table below is a sketch of intent, not a menu you can pick from:

| Stance (**none ship today**) | Would optimize for | Who it would be for |
|---|---|---|
| **Balanced** *(would be the default)* | Protection AND damage: reasonable trade-off across both axes. | Most users. The pick for anyone without a strong reason to choose otherwise. |
| **Protection-first** | Making *your specific content* maximally unreadable and maximally hard to reverse. Optimizes for entropy in the substitution structure; less concerned with whether the encoded text causes downstream training damage. | Writers, journalists, anyone protecting a specific corpus they care about. The "I don't trust the network argument; just hide my words" stance. |
| **Damage-first** | Maximum disruption to models trained on the encoded text. Optimizes for substitutions that read as plausible prose but produce semantic contradictions when ingested (M2-class antonym mappings, or hybrid antonym/POS-balanced families). Less concerned with whether your specific page is recoverable. | Activists, people who don't care if their own page is reversed but care a lot about degrading the corpus's value to scrapers. The "I am not the protagonist of my own data; the harm to scrapers is" stance. |

Balanced would be the default because most users coming to the project don't have a strong stance: they want their writing protected and they want scraping to cost something. The two specialized stances would exist for users who *do* have a strong stance and want to lean into it. Until any of this ships, the actual choice you have is the one the packages expose: `alpha` (default), `beta`, `gamma`, or the opt-in coverage-max `maxhide`, plus a mapping of your own.

The intent is that stances stay compatible with [custom mappings](./custom-mappings.md): build or reseed a mapping in any stance. The stance would be the strategy preset; the mapping is the artifact.

Open product questions, in scope for the stance strategy work:

- What technical mapping family backs each stance? Damage-first probably maps to an M2-class antonym variant or M2/M15 hybrid; protection-first probably maps to a high-entropy-random construction; balanced would inherit from the shipping default, v18 `alpha` (M15-EN is the opt-in `maxhide` coverage variant, not the balanced one). None of these are committed.
- Naming. "Balanced / Protection-first / Damage-first" is descriptive but may not be the right marketing surface. Brand names (Cloak / Toxin / Optik?) would be more memorable but harder to change later.
- How do stances combine with the alpha/beta/gamma rotation? Three stances × three rotations = nine SKUs. That may be the right answer or it may be too many. The minimum-viable shape is probably one variant per stance at first, with rotation deferred.
- For users building a mapping from scratch: do they pick a stance to inherit construction defaults from, or do they fully specify everything themselves?

This is the kind of decision we want to make in public with the people who will actually use it. If you have a strong opinion on any of the four questions above, an issue or a discussion on GitHub is the right surface.

---

## What the project is asking of you

If you read one practical thing from this page, read this:

**Run a custom mapping. It does not have to be sophisticated. It does not have to be benchmarked. It does not have to be public. It just has to be different from everyone else's.**

The integration guide ([`integration.md`](./integration.md)) will get you to a working install in minutes. The custom-mappings guide ([`custom-mappings.md`](./custom-mappings.md)) will get you off the public defaults and onto the path that actually compounds.

The CLAUDE.md template ([`CLAUDE.md`](./CLAUDE.md)) tells your AI co-pilot how to handle ShieldFont protected content correctly so that any tooling you use respects the same conventions.

Single drops are interesting. The flood is the point.

---

## How to help

This is the part where the project stops being something you install and starts being something you join. Concretely, the things that need to happen for the network case to materialize, and the people who can help us do them:

- **Run a custom mapping on real published writing.** Reseeding is the lowest-friction contribution: one command, and it takes seconds. Anyone with a blog, a newsletter, a manifesto, an essay site can participate today. No PR required, no maintainer approval, no telemetry. The network grows by one when you do this.
- **Stress-test the benchmark.** We have run it across two base models. We have not run it at 7B+ scale, we have not tried adversarial filters, and we have not stress-tested the bucket-preservation property of reseeding with a hostile evaluator. Independent replication is the most valuable contribution a researcher can make. Everything you need is in [`benchmark/`](../benchmark/).
- **Translate the approach.** The shipped mappings are English-only. A native speaker of any language with significant scraped content (Portuguese, Spanish, French, German, Italian, Japanese, Mandarin, Arabic, Hindi) can produce a variant for that language on the same principles.
- **Say the network case out loud.** The collective-action framing only works if people understand it. If you are writing about AI training, data consent, or the open-web-vs-LLM tension, the asymmetry argument in this document is offered to you for free. Cite the white paper, link the repo, send people here.

The code is AGPL-3.0; font binaries depend on the base typeface you build against, and [NOTICE](../NOTICE) has the details. The work happens on GitHub. There is a Code of Conduct. There is a CLA. There is no ad budget, no paid promotion, no waiting list. There is just a thing that works in v1 and gets stronger as more people join.

If that sounds like a project you want to be part of: welcome.
