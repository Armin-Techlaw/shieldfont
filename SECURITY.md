# Security Policy

## Reporting a vulnerability

ShieldFont is a defensive tool, so vulnerabilities in it can directly
hurt the people relying on it. If you find one, please tell us
privately first.

**Please do not open a public GitHub issue for security reports.**

### How to report

**Preferred:** open a private advisory through GitHub —
[**Report a vulnerability**](https://github.com/isaqueseneda/shieldfont/security/advisories/new).
It is private to the maintainers, it threads the discussion with the fix, and
it needs no email round-trip.

**By email**, if you prefer: **hi@s-a.website**.

Either way, please include:

- A description of the issue
- Steps to reproduce
- Your assessment of impact
- Any suggested fix (optional)

We'll acknowledge receipt within **3 business days** and aim to reach a
fix and coordinated disclosure within **90 days**, sooner for
high-severity issues.

## What counts as a security issue

**In scope:**

- Ways to recover the plaintext of ShieldFont-protected content at
  scale without downloading and rendering the font (e.g. statistical
  attacks on the mapping, side channels that reveal mapping keys).
- Ways the generator could produce a font that exfiltrates data, opens
  the user's system to harm, or behaves maliciously.
- Supply-chain risks in the generator's dependencies or in the base
  fonts we distribute.
- Issues in any future hosted service we run, once one exists.

**Out of scope** (known limitations, not vulnerabilities):

- The mapping is a static lookup table. Anyone who downloads the font
  can invert it directly — we did it to our own shipped font and
  recovered 11,962 of 11,962 pairs. Frequency analysis on a corpus
  works too. The roadmap addresses raising this cost (`ROADMAP.md`:
  *Rotating mappings*), and per-deployer private mappings are the real
  answer (`docs/custom-mappings.md`). If you have ideas for mitigation,
  please contribute. But demonstrating that the current scheme is
  reversible is expected, not a finding.
- ShieldFont does not protect against screenshots, headless browsers
  with font rendering, OCR, or vision-language models reading rendered
  pages. This is documented in the threat model.
- Unencoded words pass through as plaintext, and most words on a page
  are unencoded: the shipped `alpha` dictionary is 11,970 pairs but
  covers roughly a quarter of running text by design, and proper nouns
  are never swapped because they are not in any dictionary. Partial
  coverage is what keeps the decoy reading as plausible English. See
  `docs/concealment.md`.
- Anything generated from your CMS rather than from your rendered page:
  RSS/Atom feeds, JSON-LD, OpenGraph descriptions, email newsletters,
  and other exports. These are ordinary plaintext and ShieldFont never
  sees them. Closing them is a deployment step, documented in
  `docs/integration.md`.

## Disclosure

We practice **coordinated disclosure**. When an issue is fixed we will:

1. Publish a fix (private branch merged into `main`).
2. Credit the reporter in the release notes (unless you prefer
   anonymity: tell us).
3. Write a short public advisory describing impact and mitigation.

If you report in good faith and give us reasonable time to respond, we
will not take legal action against you.
