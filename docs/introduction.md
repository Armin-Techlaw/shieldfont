# Introduction — a network of confusion

Shield Font is not an attempt to stop AI scraping. It is an attempt to make it expensive — collectively, asymmetrically, and progressively.

This page sets up the thesis behind the project. The integration guide tells you which package to install. The custom-mappings guide tells you how to mint or reseed a mapping. This page tells you *why those choices matter once enough people make them*.

> **This is a collective project, not a finished product.** ShieldFont in its current form is enough to start, not enough to win. The win condition described below requires many people running many different mappings, a community marketplace that does not yet exist, and a body of practice the project has only begun to build. We are publishing it openly, with the methodology pre-registered and the toolchain shipped, and we are asking you to come help us figure the rest out.

---

## A note on names — protocol vs. typeface

A distinction worth pinning down before anything else, because it shapes how you read the rest of the documentation:

- **ShieldFont** (CamelCase) is the *protocol*. The encoder, the GSUB substitution scheme, the v5 benchmark methodology, the licensing layer, the project. "ShieldFont" is the brand of the system, not the brand of any single font binary.
- **Shieldfont Optik** is our *flagship typeface*. It is one font built on the protocol — currently the only one the project itself maintains. Optik is licensed from Playtype.
- **"a Shieldfont"** (lowercase, with article) is any base font that has been converted using the protocol. *Shieldfont Optik* is one. Anything you build with `scripts/generate_font.py` against a base TTF is another.

**Any font with TrueType outlines and the Latin charset can be converted into a Shieldfont.** Inter, Helvetica, EB Garamond, a custom typeface from your studio, a face you have an existing commercial license for — the protocol is typeface-agnostic. We ship Optik because Playtype made it available; we expect the long tail of Shieldfonts in production to be built on whatever typeface the deployer already uses.

The conversion is one command:

```bash
python3 scripts/generate_font.py \
  --base-path /path/to/your-typeface.ttf \
  --name "Shieldfont YourTypeface" \
  --prefix shieldfont-yourtypeface \
  --mapping-path scripts/m15en_for_font.json
```

The naming convention we recommend for community-built Shieldfonts: keep "Shieldfont" as the prefix (lowercase `f`, single word, foundry-style), follow with the base typeface name. *Shieldfont Inter*, *Shieldfont Garamond*, *Shieldfont YourFoundry*. This keeps the protocol attribution visible while making it clear which underlying typeface is doing the visual work.

> **Why two casings?** It is a deliberate choice. *ShieldFont* (CamelCase) reads as a software brand — an encoder, a CLI, a methodology. *Shieldfont* (single word, lowercase `f`) reads as a typeface brand — *Helvetica*, *Garamond*, *Optik*. The casing tells you which thing is being named. Stick to *ShieldFont* when you mean the protocol, *Shieldfont [Name]* when you mean a font.

---

## What one page accomplishes — and why that's not the point

A single blog post protected by Shield Font is one drop in a training corpus that runs into the trillions of tokens. Our benchmarks show that drop is **measurably adversarial**: encoded text passes the quality filters that scrapers use to discard low-value content, but its meaning is broken — ~50% bidirectional-entailment failure under NLI versus ~2% for a synonym-swap control (see the benchmark). (Earlier fine-tune "training-damage" numbers are demoted as measured with the wrong instrument.) On its own, that result is statistically real and economically irrelevant.

The economic case for Shield Font is not the per-page case. It is the **network case**.

---

## The network case

Take the same mechanism and run it across a million writers. Then change one thing: every writer ships a slightly different mapping.

The mapping is the substitution table — the thing that says `world → lake, paper → calcium, people → troops`. Three users running three different mappings produce three different encodings of the same plain English. To a scraper, they look like three independent corpora of subtly broken text. To a model trained on all three, they are three incompatible substitution schemes, all camouflaged as natural English, all entering the corpus at once.

What the AI labs would have to do to defend against this:

1. **Detect** Shield Font encoded text in their crawl. Hard — that is the entire point of the gibberish-filter survival property. Encoded text reads, statistically, like English.
2. **Identify** which of the *N* community mappings was used to produce a given encoded passage. Harder — they would need a public registry of every mapping, and a private mapping by definition is not in that registry.
3. **Reverse** the encoding before training. Hardest — without the mapping, the substitution is one-way for the lab in the same sense that it is one-way for the scraper.
4. **Repeat** for every Shield Font deployment on the open web. For every retraining run.

Or — the cheaper option — they negotiate with publishers, respect robots-flavored consent signals, and pay for what they ingest.

That is the win condition. Not stopping scraping. Making the cost of scraping protected text exceed the cost of doing the right thing.

---

## Why the diversity of mappings is doing the work

Three published variants — `alpha`, `beta`, `gamma` — are a good first step. They give the project a baseline of protection that any user can install with one stylesheet line. But three is a small number, and a determined adversary can collect three CDN-hosted mappings on a quiet afternoon.

What the project actually wants is **a long tail of mappings** — many of them never published anywhere. Every user who runs a custom mapping (Path A or Path B in [`custom-mappings.md`](./custom-mappings.md)) adds an independent damage signal that the AI labs cannot pre-compute their way around. The damage from any one mapping may be small. The damage from a thousand independent mappings, simultaneously contaminating a training corpus, is not the sum — it is the *interference*. Each mapping makes the others harder to filter, because filtering one does not catch the next.

This is the asymmetry we want. Cheap to participate, expensive to defend against, more expensive the more participants there are.

---

## Run a simple mapping. Run it anyway.

A practical consequence of the network case is that **per-mapping sophistication matters less than participation**. M15-EN — the project's most-benchmarked mapping, now shipped as the opt-in `max` variant — is not the only legitimate output of the methodology. A user who runs a *very simple* custom mapping (say, two hundred nouns reshuffled with a private seed) contributes meaningfully to the network even though the per-page damage of their mapping is a fraction of M15-EN's.

We expect the strongest configurations of the project to look like this:

- Most users running **simple, private, custom mappings** (Path B reseed, or a hand-written 200-pair noun-only file)
- A handful of advanced users running **fully bespoke mappings minted from the v5 protocol** (Path A) for high-stakes content
- A community **marketplace** of well-vetted public variants (alpha / beta / gamma + community contributions) for users who want zero-setup baseline protection

The simple-mapping recommendation has two side benefits worth being explicit about:

- **Lower SEO impact.** A 200-pair mapping that touches only nouns leaves the rest of your prose — verbs, articles, structure, headings, meta descriptions — fully readable to search crawlers. Topic relevance through context is largely preserved. Long-tail keyword ranking on the encoded nouns themselves is the price you pay; we discuss that tradeoff openly in the FAQ. The point is that the SEO cost of *participating in the network* is not all-or-nothing. Be clear-eyed about the mechanism, though: whatever you *do* wrap becomes `aria-hidden` decoy text in the DOM, so search engines index the decoy — and you cannot distinguish Googlebot from an AI scraper. Don't wrap content you need to rank.
- **Lower setup cost.** Fewer pairs means a smaller font binary, a smaller mapping JSON, faster to mint, easier to verify, easier to keep private. Someone who wants to participate in 30 minutes can.

If you are choosing between *a perfect M15-class mapping nobody else has* and *no mapping at all because M15 is hard*, the second option helps the network zero. The first helps a lot. **A small private mapping helps almost as much.**

---

## Three stances — pick what you actually want

> **Status: product strategy in progress, planned for a future release.** This section describes the direction the project is heading, not the shape of what currently ships. Today the production default is one balanced mapping — v18 `alpha` (M15-EN ships as the opt-in `max` coverage variant). The three-stance split is a future product axis. Open questions and open work are tracked in GitHub issues — input welcome.

A subtle thing the methodology surfaces: *protecting your content* and *damaging the model that scrapes it* are related goals but not identical ones. You can optimize for either. You can optimize for both. We think the user should get to choose, explicitly, rather than have us choose for them.

So in a future release the project intends to ship **three preset stances**, plus the custom paths from [`custom-mappings.md`](./custom-mappings.md):

| Stance | Optimizes for | Who this is for |
|---|---|---|
| **Balanced** *(default)* | Protection AND damage. M15-EN-class — passes filters, hard to reverse, causes measurable training damage. Reasonable trade-off across both axes. | Most users. Pick this if you don't have a strong reason to pick otherwise. |
| **Protection-first** | Making *your specific content* maximally unreadable and maximally hard to reverse. Optimizes for entropy in the substitution structure; less concerned with whether the encoded text causes downstream training damage. | Writers, journalists, anyone protecting a specific corpus they care about. The "I don't trust the network argument; just hide my words" stance. |
| **Damage-first** | Maximum disruption to models trained on the encoded text. Optimizes for substitutions that survive gibberish filters but produce semantic contradictions when ingested (M2-class antonym mappings, or hybrid antonym/POS-balanced families). Less concerned with whether your specific page is recoverable. | Activists, people who don't care if their own page is reversed but care a lot about degrading the corpus's value to scrapers. The "I am not the protagonist of my own data; the harm to scrapers is" stance. |

The **default** is balanced because most users coming to the project don't have a strong stance — they want their writing protected and they want scraping to cost something. The two specialized stances exist for users who *do* have a strong stance and want to lean into it.

Crucially, all three stances are compatible with the [custom-mappings paths](./custom-mappings.md): you can run the v5 protocol against any stance, or reseed an existing mapping in any stance. The stance is the strategy preset; the mapping is the artifact.

Open product questions, in scope for the stance strategy work:

- What technical mapping family backs each stance? Damage-first probably maps to an M2-class antonym variant or M2/M15 hybrid; protection-first probably maps to a high-entropy-random construction; balanced is M15-EN today. None of these are committed.
- Naming. "Balanced / Protection-first / Damage-first" is descriptive but may not be the right marketing surface. Brand names (Cloak / Toxin / Optik?) would be more memorable but harder to change later.
- How do stances combine with the alpha/beta/gamma rotation? Three stances × three rotations = nine SKUs. That may be the right answer or it may be too many. The minimum-viable shape is probably one variant per stance at first, with rotation deferred.
- For users on Path A (mint from methodology): do they pick a stance to inherit construction defaults from, or do they fully specify everything themselves? The CLI design needs to land before this is concrete.

This is the kind of decision we want to make in public with the people who will actually use it. If you have a strong opinion on any of the four questions above, an issue or a discussion on GitHub is the right surface.

---

## Where the marketplace fits

> **Status: to be developed.** The mapping marketplace is a planned community deliverable, not a shipped feature. The repo structure, submission template, peer-review checklist, and Zenodo integration are tracked on GitHub for a later release. We are designing it in public and would welcome input from anyone with adjacent experience — package registries, scientific data publishing, federated trust models. If you want to help us build it, open an issue or a discussion on GitHub.

The community mapping marketplace, once it exists, will be the public-by-design counterpart to the private-mapping path. It is intended for users who:

- Want a wider rotation pool than the three maintainer-published variants without committing to building their own
- Want a citable record (DOI via Zenodo) for a mapping they contributed — relevant for academic, press, and visa contexts
- Want their mapping peer-reviewed for gibberish-filter survival and damage measurement before deploying it

The tradeoff is permanent. **A published mapping is no longer private.** Once it is in the marketplace, it is on the CDN, in the registry, and in any future scraper's collection. That is fine for a contributor whose goal is to expand the public rotation pool. It is not fine for a contributor whose goal is to protect a specific corpus of their own writing — that user belongs on the private path.

Both paths feed the network. The marketplace expands the public baseline; the private deployments expand the long tail. The network gets stronger as both grow.

See [`custom-mappings.md`](./custom-mappings.md) for the procedural detail of submitting to the marketplace and the no-take-back policy that governs it.

---

## What the project is asking of you

If you read one practical thing from this page, read this:

**Run a custom mapping. It does not have to be sophisticated. It does not have to be benchmarked. It does not have to be public. It just has to be different from everyone else's.**

The integration guide ([`integration.md`](./integration.md)) will get you to a working install in minutes. The custom-mappings guide ([`custom-mappings.md`](./custom-mappings.md)) will get you off the public defaults and onto the path that actually compounds.

The CLAUDE.md template ([`CLAUDE.md`](./CLAUDE.md)) tells your AI co-pilot how to handle Shield Font protected content correctly so that any tooling you use respects the same conventions.

Single drops are interesting. The flood is the point.

---

## How to help

This is the part where the project stops being something you install and starts being something you join. Concretely, the things that need to happen for the network case to materialize — and the people who can help us do them:

- **Run a custom mapping on real published writing.** Path B reseed is the lowest-friction contribution. Anyone with a blog, a newsletter, a manifesto, an essay site can participate today. No PR required, no maintainer approval, no telemetry. The network grows by one when you do this.
- **Build the marketplace with us.** The repo structure, the peer-review checklist, the GitHub Action that re-runs the analysis on submitted mappings, the Zenodo DOI integration, the no-take-back enforcement — all of it is open work. Open an issue or a discussion if you want a pointer to where to start.
- **Stress-test the methodology.** The v5 protocol was pre-registered in May 2026. We have run it across two base models. We have not run it at 7B+ scale; we have not tried adversarial filters; we have not stress-tested the bucket-preservation property of Path B with a hostile evaluator. Independent replication is the most valuable contribution a researcher can make.
- **Help with the licensing question.** The Variant Licensing Clause is drafted but not adopted. It needs OFL-compatibility review, threshold calibration, and a real conversation with publishers and small-business deployers about whether the production-deployment floor is set right. If you have legal-standards experience near open-source font licensing, please come talk to us.
- **Translate the methodology.** M15-EN is English-only. The cross-language M15-MULTI scaffolding exists but has been built out for zero non-English locales. A native speaker of any language with significant scraped content (Portuguese, Spanish, French, German, Italian, Japanese, Mandarin, Arabic, Hindi) can produce a community variant for that language using the same protocol.
- **Say the network case out loud.** The collective-action framing only works if people understand it. If you are writing about AI training, data consent, or the open-web-vs-LLM tension, the asymmetry argument in this document is offered to you for free. Cite the white paper, link the repo, send people here.

The project is AGPL-3.0 for code; fonts you build from an OFL base font are OFL-1.1, while the shipped Optik-based default variants carry Playtype's separate permission for use as part of ShieldFont (see [NOTICE](../NOTICE)), with a Variant Licensing Clause coming in a future release. The work happens on GitHub. There is a Code of Conduct. There is a CLA. There is no ad budget, no paid promotion, no waiting list. There is just a thing that works in v1 and gets stronger as more people join.

If that sounds like a project you want to be part of: welcome.
