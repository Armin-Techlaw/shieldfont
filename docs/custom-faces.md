# Custom faces: bring your own typeface

> **Naming reminder.** Throughout this page: *ShieldFont* (CamelCase) is the protocol; *ShieldFont Optik* is the flagship typeface; *a ShieldFont* is any base font that has been converted using the protocol. See the [introduction](./introduction.md#a-note-on-names-protocol-vs-typeface) for the full naming convention.

A custom mapping and a custom face are two different forks. [Custom mappings](./custom-mappings.md) covers the first: a private dictionary nobody else has. This page covers the second: the typeface your ShieldFont is built on.

You can vary the **base typeface** independently of the mapping. The protocol is typeface-agnostic: `scripts/generate_font.py` accepts any base with **TrueType outlines** (`.ttf`), so you can build against *ShieldFont Optik*, *ShieldFont Inter*, *ShieldFont Garamond*, or your own studio's typeface. (CFF/`.otf` fonts are rejected: convert to `.ttf` first; variable fonts are auto-instanced to their default.) The choice of mapping is what protects your content; the choice of base typeface is purely aesthetic and operational. Forking is the intended mode of use on both axes.

---

## The recipe

`scripts/generate_font.py` is a one-command builder: point it at a base TTF, give it a name and a mapping, get back a font binary that obeys the protocol:

```bash
pip3 install -r requirements.txt

python3 scripts/generate_font.py \
  --base-path /path/to/your-typeface.ttf \
  --name "ShieldFont YourTypeface" \
  --prefix shieldfont-yourtypeface \
  --mapping-path scripts/v18alpha_for_font.json

# Audit the build (optional but recommended):
python3 scripts/audit_font.py --font public/fonts/shieldfont-yourtypeface.ttf \
  --mapping scripts/v18alpha_for_font.json
```

Outputs land in `public/fonts/` as `.ttf`, `.woff2`, and a ready `@font-face` CSS. The `--mapping-path` argument decides which dictionary the font decodes. The example above uses the shipped `alpha` pool; to build against a private mapping instead, mint one first and pass its path (see [Custom mappings](./custom-mappings.md)).

The pairing rule from the mappings guide applies unchanged here: a page renders correctly only under a font built from the same mapping that encoded it. Changing the base typeface never changes the pairs; changing the mapping always requires a new font build.

---

## Naming

Recommended naming for community-built ShieldFonts: keep `ShieldFont` as the prefix, follow with the base typeface name: *ShieldFont Inter*, *ShieldFont Garamond*, *ShieldFont YourFoundry*. Same CamelCase everywhere, including the font's internal name table; context tells you whether the word means the protocol or a specific typeface.

---

## Licensing

The code is AGPL-3.0 (see [LICENSE](../LICENSE)). Font binaries are a separate question, and which terms apply depends on the base typeface you build against. Fonts you generate from an OFL base font (Inter, Syne Mono, Young Serif) are OFL-1.1. The shipped default variants are built on **Optik** (© [Playtype](https://playtype.com)), distributed in ShieldFont's shielded form with Playtype's permission: not OFL, and not for standalone use as a typeface. [NOTICE](../NOTICE) has the details for both cases. Check it before redistributing any font binary.

---

## See also

- [`docs/custom-mappings.md`](./custom-mappings.md), a private mapping to build your face against
- [`docs/introduction.md`](./introduction.md), the naming convention and the thesis behind forking
- [`README.md`](../README.md), the same recipe with the full generator-flag table
