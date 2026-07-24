# Contributing to ShieldFont

Thanks for considering a contribution. ShieldFont is a statement project
as much as a technical one: we want as many people building on it as
possible, in as many languages, aesthetics, and contexts as possible.

This document covers how to get set up, how we accept contributions, and
the few rules we actually enforce.

---

## Ways to contribute

- **Code**: generator improvements, new variants, tests, CI.
- **Dictionaries**: new language mappings, better curation of existing
  ones. Linguists especially welcome. See `ROADMAP.md`.
- **Accessibility**: screen reader compatibility is an open problem and
  a priority. Help here is valued above almost anything else.
- **Threat research**: adversarial testing, scraper-pipeline evaluation,
  honest documentation of what ShieldFont does and doesn't defend against.
- **Integrations**: CMS plugins (WordPress, Ghost, Webflow, Shopify),
  static-site-generator adapters, browser extensions.
- **Writing**: README clarity, explainers, translations.
- **Issues**: bug reports and proposals are contributions too. Use the
  issue templates.

If you're unsure where to start, open a discussion or look for issues
tagged `good first issue` or `help wanted`.

---

## Development setup

```bash
pip3 install -r requirements.txt
```

Generate a font to verify your setup:

```bash
python3 scripts/generate_font.py \
  --base-url https://raw.githubusercontent.com/rsms/inter/v4.1/fonts/ttf/Inter-Regular.ttf \
  --cache-name Inter-Regular.ttf \
  --name "ShieldFont Dev" \
  --prefix shieldfont-dev
```

The output lands in `public/fonts/`.

---

## Pull request process

1. **Open an issue first** for anything beyond a small fix. Alignment up
   front saves a rewrite later.
2. **Fork** the repo, branch from `main`.
3. **Keep PRs focused.** One concern per PR.
4. **Sign the CLA** (see below) the first time you contribute.
5. **Update docs** if you change behavior. CLI flag changes → `README.md`.
   Generator output changes → note in the PR description.
6. **Describe the change**: what and why, not how. The diff shows how.

---

## CLA: Contributor License Agreement

ShieldFont is licensed under the **GNU Affero General Public License v3.0**
and intends to stay free and open. Before we accept your first
contribution, we ask you to sign the project's
[Contributor License Agreement](./CLA.md).

### What the CLA does

- **You keep copyright on your contributions.** The CLA is a *license*
  to the project, not a transfer of ownership.
- **You grant the Maintainers** (Isaque Seneda and Gabriel Abrucio) a
  broad license to distribute your contribution under AGPL-3.0, under
  future OSI-approved open-source licenses, and, where it sustains the
  project, under a separate commercial license.
- **You warrant** that you wrote it (or have permission to submit it)
  and that it doesn't infringe anyone else's rights.

### Why a CLA and not just DCO

We'll be transparent: we intend to sustain ShieldFont through a hosted
service and/or dual commercial licensing for organizations that can't
adopt AGPL internally. That revenue funds continued open-source
development. The CLA gives us the legal room to offer those commercial
terms *because we hold a sufficient license to the full codebase*.

Without a CLA, a single contributor could veto any commercial
arrangement and the open-source project would lose its funding path.
With the CLA, the AGPL version stays fully free forever, and paying
customers subsidize it.

We plan to revisit this choice at public launch: at that point we may
move to a DCO-only model. For now, while the founding team is two
people making strategic decisions together, the CLA is the simplest
path.

### How to sign

Open a pull request that adds your name, GitHub handle, and the date to
the Signatories table at the bottom of [CLA.md](./CLA.md). A maintainer
will merge it to countersign. After that, all your future contributions
are covered: you don't re-sign per PR.

If you're contributing on behalf of an employer, your employer may need
to sign a Corporate CLA. Open an issue and we'll coordinate.

---

## Coding style

- **Python**: standard library first. Only add a dependency with a
  reason. Follow PEP 8.
- **Comments:** explain *why*, never *what*. Self-explanatory names beat
  comments.
- **No one-liner cleverness** in the generator. Legibility matters.

---

## Questions

Open a GitHub Discussion. For security issues, see `SECURITY.md`: do
*not* open a public issue for those.
