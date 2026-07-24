# Security Policy

## Reporting a vulnerability

ShieldFont is a defensive tool, so vulnerabilities in it can directly
hurt the people relying on it. If you find one, please tell us
privately first.

**Please do not open a public GitHub issue for security reports.**

### How to report

Email **isaqueseneda@gmail.com** with:

- A description of the issue
- Steps to reproduce
- Your assessment of impact
- Any suggested fix (optional)

We'll acknowledge receipt within **3 business days** and aim to reach a
fix and coordinated disclosure within **90 days**, sooner for
high-severity issues.

A dedicated `security@shieldfont.<tld>` address will replace the
personal email before public launch.

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

- The mapping is a static lookup table in v1. Anyone who downloads the
  font and runs frequency analysis on a corpus can reverse it. The
  roadmap addresses this (`ROADMAP.md`: *Rotating mappings*). If you
  have ideas for mitigation, please contribute. But demonstrating that
  the current scheme is reversible is expected, not a finding.
- ShieldFont does not protect against screenshots, headless browsers
  with font rendering, OCR, or vision-language models reading rendered
  pages. This is documented in the threat model.
- Unencoded words (anything outside the 400-word dictionary, in v1)
  pass through as plaintext. This is by design in v1.

## Disclosure

We practice **coordinated disclosure**. When an issue is fixed we will:

1. Publish a fix (private branch merged into `main`).
2. Credit the reporter in the release notes (unless you prefer
   anonymity: tell us).
3. Write a short public advisory describing impact and mitigation.

If you report in good faith and give us reasonable time to respond, we
will not take legal action against you.
