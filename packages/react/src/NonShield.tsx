import * as React from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import {
  claim,
  currentCamo,
  neutralFontFaceCss,
  resolveOptikWeight,
  type ShieldVariant,
  type ShieldWeight,
} from "./Shield.js";

/**
 * # `<NonShield>` — the page's ordinary text, in the same typeface
 *
 * Renders its children EXACTLY as written, in Optik. No encoding, no decoys,
 * no `aria-hidden`, no sealed payload, no puzzle, no copy guard, no notice
 * strip. The words in the DOM are the words on screen: a screen reader reads
 * them, a search engine indexes them, a translator translates them, copy-paste
 * copies them, and find-in-page finds them.
 *
 * ## Why it exists
 *
 * A ShieldFont page has always had two kinds of type on it. The shielded
 * paragraphs render in Optik; the headings, captions, nav and intros above and
 * around them render in whatever fallback the host stylesheet supplies,
 * because there was no supported way to put unprotected text in the shipped
 * face. The result is a page that looks like two different designs stapled
 * together, and the author's only fix was to hand-roll a `@font-face` and a
 * `font-family` rule of their own — duplicating this package's font plumbing
 * and, as it turns out, walking straight into the bug described below.
 *
 * It also gives the project's own advice somewhere to land. `docs/integration.md`
 * says headings must NOT be shielded ("Headings: don't shield them"), because
 * once the body is a decoy the headings are the only accurate text left on the
 * page. `<NonShield as="h2">` is the supported way to honour that and still get
 * the typeface — the heading stays real, indexable and readable.
 *
 * ## THE THING THIS COMPONENT ACTUALLY DOES — read this before touching it
 *
 * Setting `font-family: Optik` on plain text DOES NOT WORK, and the failure is
 * silent. It is the single reason this file is more than four lines long.
 *
 * The shipped `optik-*.woff2` files are not the Optik typeface. They are
 * SHIELDED builds of it: `scripts/generate_font.py` injects GSUB lookups that
 * substitute whole words, and wires them into the OpenType `ccmp` feature,
 * which is on by default and which `font-variant-ligatures: none` does not
 * reach. And the substitution dictionary is an INVOLUTION — `m[m[x]] === x`,
 * asserted by `@shieldfont/core`'s own encoder, which is why `decode` is
 * literally defined as `encode`. Every word in the dictionary is therefore
 * both an original and a decoy, and the font swaps it either way.
 *
 * So a shielded face renders plain English as the DECOY. Measured by shaping
 * text through the shipped `optik-a.woff2` with HarfBuzz:
 *
 *   "Read the docs"   ->  composites drawn from the letters "Reset", "sellers"
 *   "belongs"         ->  a composite drawn from the letters "determines"
 *   "2026 report"     ->  "2527 report"        (swap-eligible digits, same feature)
 *   "Chapter 7"       ->  "Chapter 6"
 *
 * 11,962 of the 11,970 words in the `alpha` dictionary shape to a substituted
 * composite. The docs already warn about this from the authoring side — see
 * the WARNING in `docs/integration.md` ("plain English pasted into a `.tk9`
 * element fires the ligatures backwards") and the Word/Pages equivalent — but
 * a component that quietly did the same thing would be far worse than a
 * warning, because nothing errors. The page renders. The bytes are correct.
 * A heading just says the wrong thing, forever, and the author's own eyes are
 * the only test that could ever catch it.
 *
 * ### The fix that was wrong for a year: `font-feature-settings: "ccmp" 0`
 *
 * That WAS this component's whole mechanism, and by shaping it looked exact:
 * with ccmp disabled all 11,970 dictionary words shape to their own letters,
 * and the only survivors are the base font's legitimate `fi`/`fl` ligatures.
 *
 * It is exact in HarfBuzz. It is exact in Blink and in Gecko. **WebKit ignores
 * it entirely.** Safari applies `ccmp` unconditionally, and there is no CSS
 * that reaches it. Tested against a shipped cut, all of these still painted
 * the decoy:
 *
 *   font-feature-settings: "ccmp" 0        font-variant-ligatures: none
 *   font-feature-settings: "ccmp" off      font-variant: none
 *   -webkit-font-feature-settings: "ccmp" 0
 *   font-feature-settings: "ccmp" 0,"calt" 0,"liga" 0,"clig" 0
 *
 * So every heading, deck and caption a site put in `<NonShield>` read as
 * scrambled words to every Safari reader, while looking perfect to the author
 * on Chrome — the exact silent-wrong-text failure the paragraphs above were
 * written to prevent, reintroduced by the fix for it.
 *
 * ### What it does now: a different FILE
 *
 * `optik-n*.woff2` — the NEUTRAL cut. Same Optik outlines, same metrics, same
 * sanitised name table, built from the same statics (the build script asserts
 * outline and advance identity against `optik-a`, so the two can never drift),
 * and **no injected lookups at all**. Nothing to switch off means nothing an
 * engine can decline to switch off.
 *
 * It is also small: ~35 KB a cut against the shielded face's ~840 KB, because
 * it carries the 526 real glyphs and none of the ~35,900 word composites. A
 * page with shielded prose and unshielded headings pays almost nothing for the
 * second family.
 *
 * Accented text is untouched either way — Optik composes its accents through
 * precomposed glyphs and GPOS mark positioning, not ccmp.
 *
 * ## What it deliberately does NOT do
 *
 * It emits no font-load guard, and it is not covered by `<Shield>`'s. That is
 * a decision, not an omission — see the note above the `@font-face` claim
 * below.
 */
export interface NonShieldProps {
  /**
   * The HTML element to render. Defaults to `"div"`, matching `<Shield>`;
   * set `as="span"` for inline use, `as="h2"` for a heading.
   *
   * Unlike `<Shield>`, there is no table-tag restriction. `<Shield>` has to
   * reject `as="td"` because it wraps its output in a `<div>` to have somewhere
   * to put the accessible control, and the parser foster-parents that wrapper
   * out of the table. <NonShield> renders one element and nothing else, so
   * `<NonShield as="td">` is a `<td>` and behaves like one.
   */
  as?: ElementType;

  /**
   * @deprecated Accepted so existing call sites keep compiling, and IGNORED.
   *
   * It used to select which SHIELDED file to draw the outlines from, back when
   * this component rendered through a shielded face with the substitutions
   * switched off. It was purely a bandwidth choice even then — all four faces
   * draw the same Optik outlines — and the advice was to pin it to whatever
   * the page's shielded blocks used so the browser could reuse a download.
   *
   * There is now one neutral cut and it is 35 KB, so there is nothing left to
   * economise: whatever you pass, you get `optik-n`. An unbundled value still
   * throws rather than being quietly accepted, because a typo'd variant name
   * is a mistake worth hearing about even when the value goes unused.
   */
  variant?: ShieldVariant;

  /**
   * Render in the italic cut. Default: unset (the element inherits its
   * `font-style`).
   *
   * You often do not need it. All six weights ship as real italics under the
   * same family name, and this component takes arbitrary JSX, so a nested
   * `<em>`, `<i>` or `<cite>` — exactly the markup a heading or a caption
   * carries — resolves on its own. That is the difference from `<Shield>`,
   * which accepts a plain string and therefore has no way to italicise a
   * phrase at all. Use this prop for a whole block; use `<em>` for a word.
   *
   * Nothing is ever synthesised, so an italic here is a real drawn italic.
   */
  italic?: boolean;

  /**
   * Font weight: a bundled cut name (`"regular"` | `"medium"` | `"demibold"` |
   * `"bold"` | `"extrabold"` | `"black"`) or a numeric CSS weight (1..1000)
   * that snaps to the nearest real cut, exactly as on `<Shield>`. Default:
   * unset, so the element inherits.
   *
   * The six cuts are static files, not a variable font, and the rendered
   * element sets `font-synthesis: none` for the same reason `<Shield>` does:
   * a browser-synthesised bold of a licensed Playtype typeface is a smeared
   * misrepresentation of someone's typeface.
   */
  weight?: ShieldWeight;

  /** Line-height passthrough. */
  lineHeight?: number | string;

  /** Font-size passthrough. */
  size?: string;

  /** className escape hatch. */
  className?: string;

  /**
   * style escape hatch — merges over the internal font scope.
   *
   * It can therefore override `fontFamily`, and pointing this component at a
   * SHIELDED family is the one override that silently renders decoys: the
   * neutral cut is the whole mechanism now, so replacing it removes it. There
   * is no guard against that, for the usual reason — a component that refused
   * to be overridden here would also refuse every legitimate override.
   */
  style?: CSSProperties;

  /**
   * The content, rendered verbatim.
   *
   * ## Arbitrary JSX is allowed here, and is NOT allowed on `<Shield>`
   *
   * `<Shield>` throws on anything but a plain string, and the reason is
   * specific: the ENCODER cannot see inside a component. Given
   * `<Shield><Byline author={a} /></Shield>`, a walk of the tree reaches an
   * unrendered element, so the byline's text would ship to the browser
   * UNENCODED inside a block that still looks protected, still carries
   * `aria-hidden`, and still renders through the font. That is a silent leak
   * of the exact text the author installed this package to keep back, so
   * `<Shield>` fails loud instead.
   *
   * Not one clause of that applies here. `<NonShield>` encodes nothing, hides
   * nothing and seals nothing; every character it renders is meant to be read,
   * indexed and copied. There is no protected form for nested content to fall
   * out of, so there is no leak for a restriction to prevent — and a rule with
   * no failure behind it is just an inconvenience with a good pedigree.
   *
   * The inconvenience would also be severe, because it lands exactly on this
   * component's purpose. The content it exists for — headings, captions, nav,
   * intros — is the content most likely to contain a link or an emphasis:
   *
   *   <NonShield as="h2">Read <a href="/docs">the docs</a></NonShield>
   *   <NonShield as="p">Photograph by <em>Jane Roe</em></NonShield>
   *
   * A string-only rule would reject both and send the author back to the
   * hand-rolled `font-family` this component was added to replace, which is
   * how they meet the ccmp bug in the class comment. So: strings, numbers,
   * elements, fragments, arrays, anything React renders.
   *
   * Inheritance is what makes it correct as well as convenient. `font-family`
   * and `font-feature-settings` are both inherited properties, so a nested
   * `<a>` or `<em>` picks up the typeface AND the substitution-off rule from
   * this element without being touched.
   *
   * `null` and `undefined` are accepted and render nothing, matching React's
   * own treatment of them rather than inventing a stricter one for a component
   * that has nothing to protect.
   */
  children?: ReactNode;
}

/**
 * Every prop `<NonShield>` understands. Same fail-loud treatment as
 * `<Shield>`: an unrecognised prop is a prop that would silently not reach the
 * element, and `<NonShield as={Link} href="/x">` is the mistake people make.
 */
const NONSHIELD_PROPS = new Set([
  "as", "variant", "weight", "italic", "lineHeight", "size", "className", "style", "children",
]);

/**
 * `<NonShield>` — ordinary, readable text in the shipped Optik face.
 *
 * The counterpart to `<Shield>`: same typeface, same weights, same page
 * assets, and none of the protection. Use it for everything on a ShieldFont
 * page that should stay real — headings above all, which
 * `docs/integration.md` says must never be shielded.
 *
 * Read the header of this file before changing what it emits. The family name
 * below is load-bearing, not housekeeping: it names the one shipped cut with
 * no substitution lookups in it, and pointing this component at any other
 * family renders decoys with nothing anywhere reporting a problem.
 *
 * @example
 *   <NonShield as="h2">Read the docs</NonShield>
 *   <NonShield as="p" weight="medium">Photograph by <em>Jane Roe</em></NonShield>
 */
export function NonShield(props: NonShieldProps) {
  const { as, variant, weight, italic, lineHeight, size, className, style, children } = props;

  const unknown = Object.keys(props).filter((k) => !NONSHIELD_PROPS.has(k));
  if (unknown.length > 0) {
    throw new Error(
      `<NonShield> received ${unknown.map((k) => `\`${k}\``).join(", ")}, which it does not ` +
        `forward — the element would render without ${unknown.length > 1 ? "them" : "it"}. ` +
        `<NonShield> accepts only: ${[...NONSHIELD_PROPS].join(", ")}. ` +
        `To wrap text in something that needs its own props, put that element outside: ` +
        `<Link href="/x"><NonShield as="span">…</NonShield></Link>.`,
    );
  }

  // NO `warnIfClientRender()` HERE, and its absence is the point rather than an
  // oversight. That warning exists because <Shield> rendering in a browser means
  // the plaintext and the whole dictionary were serialised into the JS bundle
  // before the encoder ran. <NonShield> has no plaintext to leak: its children
  // are published verbatim by design, on the server or the client, and there is
  // no dictionary in play. It is safe in a "use client" component, which is
  // also what lets an author put a heading in Optik inside an interactive
  // island.
  const Tag = (as ?? "div") as ElementType;

  const { camo, fontHost } = currentCamo();
  // `variant` no longer selects anything — see the prop's note. It is still
  // VALIDATED, because a typo'd variant name means the author believed they
  // were choosing something, and hearing "not a bundled face" is better than
  // having the value ignored twice over.
  if (variant !== undefined && !Object.prototype.hasOwnProperty.call(camo.family, variant)) {
    throw new Error(
      `<NonShield variant="${String(variant)}"> is not a bundled face. ` +
        `Valid values: ${Object.keys(camo.family).map((k) => `"${k}"`).join(", ")}. ` +
        `(The prop no longer selects a file: <NonShield> always renders the ` +
        `neutral cut.)`,
    );
  }

  const fontWeight = weight === undefined ? undefined : resolveOptikWeight(weight);
  // THE LOAD-BEARING LINE. This is the one shipped family with no substitution
  // lookups in it. Point this component at a shielded family instead and it
  // renders "Read the docs" as "Reset the sellers", in every browser, with
  // nothing anywhere reporting a problem. The long version — including why the
  // `font-feature-settings: "ccmp" 0` that used to live here was not good
  // enough — is in the header of this file.
  const family = camo.neutralFamily;

  const finalStyle: CSSProperties = {
    fontFamily: `'${family}', system-ui, sans-serif`,
    // Same reason as <Shield>: never let a browser fake a cut of a licensed
    // typeface. Every numeric weight already lands on a real bundled file, and
    // every italic on a real drawn one.
    fontSynthesis: "none",
    ...(fontWeight !== undefined && { fontWeight }),
    // Unset inherits, so a caption inside an italic aside stays italic.
    // `italic={false}` pins upright against such an ancestor, so it has to
    // emit `normal` rather than nothing.
    ...(italic !== undefined && { fontStyle: italic ? "italic" : "normal" }),
    ...(lineHeight !== undefined && { lineHeight }),
    ...(size !== undefined && { fontSize: size }),
    ...style,
  };

  // ---- Page assets: the stylesheet YES, the guard NO ------------------------
  //
  // The @font-face stylesheet is claimed from <Shield>'s OWN pass registry, not
  // from a second one, so a page mixing the two components emits exactly one
  // stylesheet per family whichever component renders first. The buckets are
  // independent, so a <NonShield> that claims "styles" does not stop a later
  // <Shield> emitting the guard it still needs.
  //
  // THE GUARD IS DELIBERATELY NOT EMITTED, NOT SEEDED, AND NOT MATCHED.
  //
  // <NonShield> also does not stamp the `[data-typeface="<variant>"]` attribute
  // that <Shield> puts on every block. That attribute is what the guard's
  // selectors are scoped to, so leaving it off is what keeps this component out
  // of the guard's reach — in three separate ways, each of which would be a bug:
  //
  //   1. IT MUST NOT BE SKELETONISED. When a face fails to load, the guard
  //      blanks every matching element behind a grey skeleton. That is exactly
  //      right for <Shield>, where the alternative is painting raw decoy text
  //      at full readability. It is exactly wrong here. A missing font leaves
  //      <NonShield> rendering the correct words in a fallback face — the
  //      design is degraded and the CONTENT IS PERFECTLY FINE. Blanking it
  //      would destroy readable text to solve a problem that does not exist,
  //      and would do it to headings, which are usually the last accurate text
  //      on a shielded page.
  //
  //   2. ITS FACES MUST NOT BE SEEDED into a running guard. The guard fails
  //      the whole family if any probed face is missing. Seed a weight that
  //      only an unshielded heading uses and a missing `optik-a-800.woff2`
  //      would skeletonise every genuinely shielded block on the page — real
  //      protected text blanked because a heading's cut was absent. Separate
  //      families make this structural rather than a rule to remember: the
  //      guard watches one family name, and the neutral cut is not it.
  //
  //   3. IT MUST NOT PROVOKE `checkDescendants()`, which warns whenever a
  //      matched element computes to a font-family that is not ours. Perfectly
  //      correct <NonShield> markup — a nested <code> in its own monospace
  //      face, say — would emit console warnings telling the author to remove
  //      an override that is doing its job.
  //
  // A <NonShield>-only page therefore ships no guard at all, which is the right
  // amount of machinery for a page with nothing to hide. And on a mixed page
  // the guard keeps working exactly as before: it watches the family, and the
  // shielded blocks are still the only things it can act on.
  const emitStyle = claim("styles", family);

  return (
    <>
      {emitStyle ? <style dangerouslySetInnerHTML={{ __html: neutralFontFaceCss() }} /> : null}
      {/*
        One element, the children verbatim. No `aria-hidden`, no id, no data
        attribute, no sibling control, no sealed payload and no script: there is
        nothing here to explain, unlock or apologise for. A block that carried
        any of that furniture while being fully readable would be worse than
        useless — it would tell a scraper which pages use this library, on the
        text that has nothing to hide.
      */}
      <Tag className={className} style={finalStyle}>
        {children}
      </Tag>
    </>
  );
}
