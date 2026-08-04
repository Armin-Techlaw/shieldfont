/**
 * The `weight` prop and the bundled-weight story.
 *
 * The four bundled filename prefixes (optik-a/b/c/m) are MAPPING VARIANTS
 * (alpha/beta/gamma/maxhide); weight is the orthogonal axis. Every variant
 * ships six real static cuts of Optik (Playtype's uprights, Regular 400
 * through Black 900), so the `weight` prop resolves named weights against the
 * OPTIK_WEIGHTS registry and SNAPS numeric CSS weights to the nearest of those
 * six cuts before writing `font-weight`.
 *
 * The injected @font-face still declares one face per cut, each claiming a
 * numeric band that tiles 1..1000 with no gaps, so a weight arriving by
 * inheritance or from the host's own stylesheet also lands on a real cut and
 * the browser never synthesises a faux bold of the licensed typeface. The two
 * resolutions have to agree exactly, which is asserted here over every integer
 * in the range.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { CSSProperties } from "react";
import { Shield, OPTIK_WEIGHTS, resolveOptikWeight } from "../src/Shield.js";
import { findTag, props, shieldedBlock } from "./helpers.js";

const BODY = "The future of writing belongs to those who write it.";

function styleOf(tree: ReturnType<typeof Shield>): CSSProperties {
  return props(shieldedBlock(tree)).style as CSSProperties;
}

function faceFor(weight?: keyof typeof OPTIK_WEIGHTS | number): string {
  const tree = Shield({ children: BODY, variant: "alpha", weight });
  const style = findTag(tree, "style");
  return (props(style!).dangerouslySetInnerHTML as { __html: string }).__html;
}

describe("default behaviour is unchanged", () => {
  it("omits font-weight entirely when the prop is unset", () => {
    const style = styleOf(Shield({ children: BODY }));
    expect(style.fontWeight).toBeUndefined();
    expect("fontWeight" in style).toBe(false);
  });

  it("keeps the font-family scope regardless of weight", () => {
    const style = styleOf(Shield({ children: BODY, variant: "alpha", weight: "bold" }));
    expect(String(style.fontFamily)).toContain("Optik");
  });

  it("always disables font synthesis on the rendered element", () => {
    // Belt-and-braces next to the gapless @font-face bands: a synthetic bold
    // would smear the licensed typeface and distort the ligature composites.
    expect(styleOf(Shield({ children: BODY })).fontSynthesis).toBe("none");
    expect(styleOf(Shield({ children: BODY, weight: 700 })).fontSynthesis).toBe("none");
  });
});

describe("named weights", () => {
  it("resolves every Playtype cut name to its numeric weight", () => {
    expect(styleOf(Shield({ children: BODY, weight: "regular" })).fontWeight).toBe(400);
    expect(styleOf(Shield({ children: BODY, weight: "medium" })).fontWeight).toBe(500);
    expect(styleOf(Shield({ children: BODY, weight: "demibold" })).fontWeight).toBe(600);
    expect(styleOf(Shield({ children: BODY, weight: "bold" })).fontWeight).toBe(700);
    expect(styleOf(Shield({ children: BODY, weight: "extrabold" })).fontWeight).toBe(800);
    expect(styleOf(Shield({ children: BODY, weight: "black" })).fontWeight).toBe(900);
  });

  it("rejects a weight name with no bundled cut, loudly", () => {
    // Plain-JS callers are not stopped by the type system, so the runtime
    // check must throw. "semibold" is a plausible near-miss for "demibold";
    // "heavy" for "black".
    expect(() => Shield({ children: BODY, weight: "semibold" as never })).toThrow(RangeError);
    expect(() => Shield({ children: BODY, weight: "semibold" as never })).toThrow(/demibold/);
    expect(() => Shield({ children: BODY, weight: "heavy" as never })).toThrow(RangeError);
  });

  it("registry: all six Playtype upright cuts, lowercased", () => {
    expect(OPTIK_WEIGHTS).toEqual({
      regular: 400,
      medium: 500,
      demibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900,
    });
  });
});

describe("numeric weights snap to the nearest real cut", () => {
  it("emits an exact cut for a number that already is one", () => {
    for (const cut of Object.values(OPTIK_WEIGHTS)) {
      expect(styleOf(Shield({ children: BODY, weight: cut })).fontWeight).toBe(cut);
    }
  });

  it("emits the nearest cut for an off-cut number", () => {
    // The four the owner named, plus the two extremes of the range.
    expect(styleOf(Shield({ children: BODY, weight: 470 })).fontWeight).toBe(500);
    expect(styleOf(Shield({ children: BODY, weight: 620 })).fontWeight).toBe(600);
    expect(styleOf(Shield({ children: BODY, weight: 999 })).fontWeight).toBe(900);
    expect(styleOf(Shield({ children: BODY, weight: 300 })).fontWeight).toBe(400);
    expect(styleOf(Shield({ children: BODY, weight: 1 })).fontWeight).toBe(400);
    expect(styleOf(Shield({ children: BODY, weight: 1000 })).fontWeight).toBe(900);
  });

  it("covers every band, at both edges and inside", () => {
    const cases: [number, number][] = [
      [1, 400], [100, 400], [399, 400], [400, 400], [449, 400],
      [450, 500], [470, 500], [500, 500], [549, 500],
      [550, 600], [620, 600], [600, 600], [649, 600],
      [650, 700], [700, 700], [749, 700],
      [750, 800], [800, 800], [849, 800],
      [850, 900], [900, 900], [999, 900], [1000, 900],
    ];
    for (const [input, expected] of cases) {
      expect(resolveOptikWeight(input), `weight ${input}`).toBe(expected);
    }
  });

  it("rounds every exact midpoint UP, matching the @font-face bands", () => {
    // The documented tie-break. 450 is equidistant from 400 and 500; the CSS
    // band for 500 is "450 549", so the component has to agree and pick 500.
    expect(resolveOptikWeight(450)).toBe(500);
    expect(resolveOptikWeight(550)).toBe(600);
    expect(resolveOptikWeight(650)).toBe(700);
    expect(resolveOptikWeight(750)).toBe(800);
    expect(resolveOptikWeight(850)).toBe(900);
  });

  it("agrees with the emitted @font-face bands on EVERY integer in 1..1000", () => {
    // The invariant that makes this refactor a no-op on screen: whatever the
    // browser would have picked from the bands is what the component now emits
    // outright. Parse the bands out of the real CSS rather than restating them.
    // Upright faces only: both styles declare the same bands, and pairing
    // every band with every filename across the whole sheet would line the
    // upright bands up against the italic files.
    const css = faceFor(undefined);
    const upright = (css.match(/@font-face\{[^}]*\}/g) ?? []).filter((f) =>
      f.includes("font-style:normal"),
    );
    const bands = upright
      .map((face) => /font-weight:(\d+) (\d+)/.exec(face) as RegExpExecArray)
      .map((m) => [Number(m[1]), Number(m[2])] as const);
    const files = upright
      .map((face) => /optik-a(?:-(\d+))?\.woff2/.exec(face) as RegExpExecArray)
      .map((m) => (m[1] ? Number(m[1]) : 400));
    expect(bands).toHaveLength(files.length);

    for (let w = 1; w <= 1000; w++) {
      const i = bands.findIndex(([lo, hi]) => w >= lo && w <= hi);
      expect(i, `no band covers ${w}`).toBeGreaterThanOrEqual(0);
      expect(resolveOptikWeight(w), `weight ${w}`).toBe(files[i]);
    }
  });

  it("resolves a fractional weight the way the browser resolves it", () => {
    // The bands are integer-delimited, so 449.5 sits in the one-unit gap
    // between "1 449" and "450 549" and no band contains it. Chrome resolves
    // the gap by rounding to the nearest integer first, which was verified
    // against document.fonts.load(): 449.2 matches the 400 face, 449.5 and
    // 449.9 match the 500 face. Raw nearest-cut arithmetic would send all
    // three to 400 (449.5 is 49.5 from 400 and 50.5 from 500), so the
    // rounding in nearestCut() is what keeps this agreeing with the browser.
    expect(resolveOptikWeight(449.2)).toBe(400);
    expect(resolveOptikWeight(449.5)).toBe(500);
    expect(resolveOptikWeight(449.9)).toBe(500);
    expect(resolveOptikWeight(549.5)).toBe(600);
    expect(resolveOptikWeight(649.5)).toBe(700);
    expect(resolveOptikWeight(849.5)).toBe(900);
    // And a fraction nowhere near a boundary is simply its own cut.
    expect(resolveOptikWeight(700.4)).toBe(700);
  });

  it("throws a RangeError on input that is nonsense rather than imprecise", () => {
    // Snapping helps a number that means something. It is not a licence to
    // accept a number that does not.
    for (const bad of [0, -400, 1001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => Shield({ children: BODY, weight: bad })).toThrow(RangeError);
      expect(() => resolveOptikWeight(bad)).toThrow(RangeError);
    }
    expect(() => resolveOptikWeight(Number.NaN)).toThrow(/1\.\.1000/);
  });
});

describe("resolveOptikWeight (the exported helper)", () => {
  it("resolves every name exactly as the component does", () => {
    for (const [name, numeric] of Object.entries(OPTIK_WEIGHTS)) {
      expect(resolveOptikWeight(name as keyof typeof OPTIK_WEIGHTS)).toBe(numeric);
      expect(
        styleOf(Shield({ children: BODY, weight: name as keyof typeof OPTIK_WEIGHTS })).fontWeight,
      ).toBe(numeric);
    }
  });

  it("always returns a weight that has a bundled file", () => {
    const cuts = Object.values(OPTIK_WEIGHTS) as number[];
    for (let w = 1; w <= 1000; w++) expect(cuts).toContain(resolveOptikWeight(w));
  });

  it("rejects an unknown name the same way the prop does", () => {
    expect(() => resolveOptikWeight("semibold" as never)).toThrow(RangeError);
    expect(() => resolveOptikWeight("semibold" as never)).toThrow(/demibold/);
  });
});

describe("weight never changes what ships", () => {
  it("does not affect the variant choice or the encoded text", () => {
    const plain = Shield({ children: BODY, variant: "alpha" });
    const weighted = Shield({ children: BODY, variant: "alpha", weight: "bold" });
    expect(props(shieldedBlock(weighted))["data-typeface"]).toBe(
      props(shieldedBlock(plain))["data-typeface"],
    );
    expect(props(shieldedBlock(weighted)).children).toBe(props(shieldedBlock(plain)).children);
    expect(props(shieldedBlock(weighted)).children).not.toBe(BODY);
  });

  it("emits the same @font-face set with and without a weight", () => {
    // The full six-face set is declared per variant regardless of the weight
    // prop; browsers lazily download only the faces text actually resolves
    // to, so an unused declaration costs nothing.
    const base = faceFor(undefined);
    expect(faceFor("regular")).toBe(base);
    expect(faceFor("black")).toBe(base);
    expect(faceFor(700)).toBe(base);
  });
});

describe("the italic prop", () => {
  it("sets font-style only when given, in both directions", () => {
    // Unset emits nothing, so a shielded block inside an italic pull quote
    // follows it. `italic={false}` pins upright against such an ancestor and
    // therefore has to emit `normal`.
    expect(styleOf(Shield({ children: BODY })).fontStyle).toBeUndefined();
    expect(styleOf(Shield({ children: BODY, italic: true })).fontStyle).toBe("italic");
    expect(styleOf(Shield({ children: BODY, italic: false })).fontStyle).toBe("normal");
  });

  it("changes nothing about the encoding or the variant", () => {
    // The cut is a rendering choice. Two blocks that differ only in style must
    // ship the same ciphertext through the same dictionary.
    const upright = Shield({ children: BODY, variant: "alpha" });
    const slanted = Shield({ children: BODY, variant: "alpha", italic: true });
    expect(props(shieldedBlock(slanted)).children).toBe(props(shieldedBlock(upright)).children);
    expect(props(shieldedBlock(slanted))["data-typeface"]).toBe(
      props(shieldedBlock(upright))["data-typeface"],
    );
  });

  it("never lets the browser fake the oblique", () => {
    // A synthesised italic distorts the word composites enough to expose that
    // decoys are in play, which is why a real cut had to be drawn for each.
    expect(styleOf(Shield({ children: BODY, italic: true })).fontSynthesis).toBe("none");
  });
});

describe("@font-face weight bands", () => {
  /** The declared faces of one style, in declaration order. */
  const facesOfStyle = (css: string, style: "normal" | "italic") =>
    (css.match(/@font-face\{[^}]*\}/g) ?? []).filter((f) =>
      f.includes(`font-style:${style}`),
    );

  it("declares one face per registry weight IN BOTH STYLES, under one family", () => {
    const css = faceFor(undefined);
    const faces = css.match(/@font-face\{[^}]*\}/g) ?? [];
    // Six cuts x two styles. Without the italic half, `italic` and any author
    // rule saying `font-style: italic` render UPRIGHT and log nothing:
    // font-synthesis is off, so with no declared italic face there is nothing
    // for the browser to resolve to and nothing it is allowed to fake.
    expect(faces).toHaveLength(Object.keys(OPTIK_WEIGHTS).length * 2);
    expect(facesOfStyle(css, "normal")).toHaveLength(Object.keys(OPTIK_WEIGHTS).length);
    expect(facesOfStyle(css, "italic")).toHaveLength(Object.keys(OPTIK_WEIGHTS).length);
    for (const face of faces) {
      // ONE family for both styles. Declaring the italics under a family of
      // their own would leave ordinary `font-style: italic` unable to reach
      // them, which is the entire point of shipping them.
      expect(face).toContain("font-family:'Optik'");
      expect(face).toContain("font-display:block");
    }
  });

  it("gives each cut its band and its file, under the naming rule", () => {
    const css = faceFor(undefined);
    // Regular keeps the historical bare filename; every other cut carries a
    // numeric suffix. Italics take an `-italic` infix BEFORE the weight.
    expect(css).toContain("optik-a.woff2') format('woff2');font-weight:1 449");
    expect(css).toContain("optik-a-500.woff2') format('woff2');font-weight:450 549");
    expect(css).toContain("optik-a-600.woff2') format('woff2');font-weight:550 649");
    expect(css).toContain("optik-a-700.woff2') format('woff2');font-weight:650 749");
    expect(css).toContain("optik-a-800.woff2') format('woff2');font-weight:750 849");
    expect(css).toContain("optik-a-900.woff2') format('woff2');font-weight:850 1000");
    expect(css).toContain("optik-a-italic.woff2') format('woff2');font-weight:1 449");
    expect(css).toContain("optik-a-italic-700.woff2') format('woff2');font-weight:650 749");
    expect(css).toContain("optik-a-italic-900.woff2') format('woff2');font-weight:850 1000");
  });

  it("bands tile 1..1000 with no gaps and no overlaps, per style", () => {
    // The property that makes weight synthesis impossible: EVERY numeric CSS
    // weight matches exactly one declared face IN EACH STYLE. Checked per
    // style rather than over the whole sheet, because the two styles overlap
    // each other's bands by design — that is what makes them alternatives.
    const css = faceFor(undefined);
    for (const style of ["normal", "italic"] as const) {
      const bands = facesOfStyle(css, style)
        .map((face) => /font-weight:(\d+) (\d+)/.exec(face) as RegExpExecArray)
        .map((m) => [Number(m[1]), Number(m[2])] as const)
        .sort((a, b) => a[0] - b[0]);
      expect(bands).toHaveLength(Object.keys(OPTIK_WEIGHTS).length);
      expect(bands[0][0]).toBe(1);
      expect(bands[bands.length - 1][1]).toBe(1000);
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i][0]).toBe(bands[i - 1][1] + 1);
      }
    }
  });
});

describe("the package bundles a font file for every registered weight", () => {
  // The neutral react-tier filenames, one per mapping variant (see README),
  // plus `optik-n` — the unshielded cut <NonShield> renders in.
  const VARIANT_PREFIXES = ["optik-a", "optik-b", "optik-c", "optik-m"];
  const fontsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../fonts");

  it("has every variant's file for every weight in OPTIK_WEIGHTS, in both styles", () => {
    for (const [name, numeric] of Object.entries(OPTIK_WEIGHTS)) {
      for (const prefix of VARIANT_PREFIXES) {
        for (const style of ["", "-italic"]) {
          // Regular keeps the bare filename; every other cut gets a -<weight>
          // suffix (e.g. optik-a-700.woff2, optik-a-italic-700.woff2).
          const file =
            numeric === 400
              ? `${prefix}${style}.woff2`
              : `${prefix}${style}-${numeric}.woff2`;
          const path = resolve(fontsDir, file);
          expect(existsSync(path), `missing ${file} for weight "${name}"`).toBe(true);
          expect(statSync(path).size).toBeGreaterThan(10_000);
        }
      }
    }
  });

  it("has the neutral cut for every weight and style", () => {
    // A missing neutral cut is the failure <NonShield> exists to prevent: the
    // browser falls back, and on WebKit the fallback within the family is a
    // SHIELDED face, which paints decoys on text that was never encoded.
    //
    // The size floor is much lower than the shielded one on purpose. These
    // carry 526 real glyphs and none of the ~35,900 word composites, so ~35 kB
    // is correct and a file the size of a shielded cut would mean the wrong
    // font was copied into place.
    for (const [name, numeric] of Object.entries(OPTIK_WEIGHTS)) {
      for (const style of ["", "-italic"]) {
        const file =
          numeric === 400 ? `optik-n${style}.woff2` : `optik-n${style}-${numeric}.woff2`;
        const path = resolve(fontsDir, file);
        expect(existsSync(path), `missing ${file} for weight "${name}"`).toBe(true);
        const { size } = statSync(path);
        expect(size, `${file} is suspiciously small`).toBeGreaterThan(10_000);
        expect(size, `${file} looks like a shielded cut, not a neutral one`).toBeLessThan(
          200_000,
        );
      }
    }
  });
});
