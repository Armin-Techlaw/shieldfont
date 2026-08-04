/**
 * `<NonShield>` — the unprotected half of the pair.
 *
 * What these tests are really guarding is a silent failure. The shipped
 * `optik-*.woff2` files are SHIELDED builds whose GSUB lookups ride the
 * OpenType `ccmp` feature, and the dictionary is an involution, so a shielded
 * face renders plain English as the decoy: "Read the docs" draws as composites
 * built from the letters "Reset" and "sellers". Nothing errors when that
 * happens. The page renders, the bytes are right, and a heading just says the
 * wrong thing.
 *
 * So the single most important assertion in this file is the dull-looking one
 * about the FAMILY NAME. `<NonShield>` renders `optik-n` — the one shipped cut
 * with no lookups injected into it — and if somebody "tidies" that back to a
 * shielded family, every test about DOM text still passes and every reader
 * sees the wrong words.
 *
 * It used to switch the substitutions off with `font-feature-settings:
 * "ccmp" 0` instead, which is exact in HarfBuzz, Blink and Gecko, and which
 * WEBKIT IGNORES ENTIRELY — so headings read as decoys in Safari and nowhere
 * else. Do not reintroduce it as a "belt and braces" line either: it would
 * suggest the family name is optional, which is the mistake this file exists
 * to catch.
 *
 * Same technique as the rest of the suite: these are plain function components
 * with no hooks, so the tests call them and inspect the returned element tree.
 */
import { describe, it, expect } from "vitest";
import { NonShield } from "../src/NonShield.js";
import { Shield, withShieldRenderPass } from "../src/Shield.js";
import { findAllTags, props, walkAll, visibleText } from "./helpers.js";

const HEADING = "Read the docs";
// Every word here is in the alpha dictionary, so an unshielded render through a
// shielded face would visibly rewrite the whole sentence.
const BODY = "The future of writing belongs to those who write it.";
const OFF = { mode: "none" } as const;

function html(el: { props: unknown }): string {
  return ((el.props as Record<string, { __html: string }>).dangerouslySetInnerHTML ?? { __html: "" })
    .__html;
}

/**
 * The single rendered element — the host element that is not a page asset.
 *
 * `walkAll` yields the enclosing Fragment too, and a Fragment's `type` is a
 * symbol rather than a tag name, so "the first thing that is not a <style>"
 * matched the Fragment and every style assertion read `undefined`. Restrict to
 * string types, i.e. real host elements.
 */
function block(tree: unknown) {
  const el = walkAll(tree as never).find(
    (e) => typeof e.type === "string" && e.type !== "style" && e.type !== "script",
  );
  if (!el) throw new Error("no rendered element in the tree");
  return el;
}

function styleOf(tree: unknown): Record<string, unknown> {
  return props(block(tree)).style as Record<string, unknown>;
}

describe("the words in the DOM are the words the author wrote", () => {
  it("renders a plain string completely unchanged", () => {
    const tree = NonShield({ children: BODY });
    expect(props(block(tree)).children).toBe(BODY);
  });

  it("does not encode: no dictionary word is substituted", () => {
    // The encoder would turn "belongs" into "determines" and "write" into
    // "sell". Assert on the words themselves rather than on a hash, so the
    // failure message names what went wrong.
    const rendered = String(props(block(NonShield({ children: BODY }))).children);
    expect(rendered).toContain("belongs");
    expect(rendered).toContain("write");
    expect(rendered).not.toContain("determines");
    expect(rendered).not.toContain("sell");
  });

  it("defaults to a <div>, and `as` chooses the element", () => {
    expect(block(NonShield({ children: HEADING })).type).toBe("div");
    expect(block(NonShield({ as: "h2", children: HEADING })).type).toBe("h2");
    expect(block(NonShield({ as: "span", children: HEADING })).type).toBe("span");
  });

  it("accepts a table tag, which <Shield> has to reject", () => {
    // <Shield as="td"> throws because its wrapper <div> gets foster-parented
    // out of the table. <NonShield> renders one element and needs no wrapper.
    expect(() => NonShield({ as: "td", children: HEADING })).not.toThrow();
    expect(block(NonShield({ as: "td", children: HEADING })).type).toBe("td");
  });
});

describe("the substitutions are absent from the FILE, not switched off in CSS", () => {
  it("renders the neutral family, never a shielded one", () => {
    // THE LOAD-BEARING ASSERTION. `optik-n` is the only shipped cut with no
    // injected lookups; every other family substitutes words no matter what
    // CSS says, because WebKit applies ccmp unconditionally.
    const family = String(styleOf(NonShield({ children: BODY })).fontFamily);
    expect(family).toContain("Optik Text");
    // A shielded family would also "contain Optik", so assert the file the
    // stylesheet actually points at.
    const css = html(findAllTags(NonShield({ children: BODY }) as never, "style")[0]!);
    expect(css).toContain("optik-n.woff2");
    expect(css).not.toContain("optik-a");
  });

  it("does not try to disable the feature in CSS any more", () => {
    // Neither of these reaches ccmp in WebKit. Shipping one would imply the
    // family name above is a belt-and-braces measure rather than the mechanism.
    const style = styleOf(NonShield({ children: BODY }));
    expect(style.fontFeatureSettings).toBeUndefined();
    expect(style.fontVariantLigatures).toBeUndefined();
  });

  it("<Shield> re-asserts ccmp so an author stylesheet cannot switch it off", () => {
    // font-feature-settings inherits, so a <Shield> inside a <NonShield> would
    // otherwise inherit "ccmp" 0 and publish its decoy text at full
    // readability — protection silently off, nothing logged.
    const style = props(
      walkAll(Shield({ children: BODY, variant: "alpha", a11y: OFF })).find(
        (e) => (props(e).style as Record<string, unknown> | undefined)?.fontFamily,
      )!,
    ).style as Record<string, unknown>;
    expect(style.fontFeatureSettings).toBe("normal");
  });

  it("renders in the Optik family and never synthesises a weight", () => {
    const style = styleOf(NonShield({ children: HEADING }));
    expect(String(style.fontFamily)).toContain("Optik");
    expect(style.fontSynthesis).toBe("none");
  });
});

describe("none of the protection machinery is emitted", () => {
  it("marks nothing aria-hidden", () => {
    const all = walkAll(NonShield({ children: BODY }) as never);
    expect(all.some((e) => props(e)["aria-hidden"] !== undefined)).toBe(false);
  });

  it("ships no sealed payload and no JSON data island", () => {
    const tree = NonShield({ children: BODY });
    const scripts = findAllTags(tree, "script");
    expect(scripts).toHaveLength(0);
  });

  it("emits no solver, no copy guard and no font-load guard", () => {
    // A <NonShield>-only page carries exactly one asset: the @font-face rule.
    const tree = NonShield({ children: BODY });
    expect(findAllTags(tree, "script")).toHaveLength(0);
    expect(findAllTags(tree, "style")).toHaveLength(1);
    expect(html(findAllTags(tree, "style")[0]!)).toContain("@font-face");
  });

  it("draws no notice strip and no buttons", () => {
    const tree = NonShield({ children: BODY });
    expect(findAllTags(tree, "button")).toHaveLength(0);
    // Nothing in the markup explains, apologises or names the mechanism.
    expect(visibleText(block(tree))).toBe(BODY);
  });

  it("stamps no data-typeface attribute, so the guard cannot match it", () => {
    // This is what keeps a missing font from blanking perfectly readable text:
    // the guard's selectors are scoped to [data-typeface="<variant>"].
    const all = walkAll(NonShield({ children: BODY }) as never);
    const attrs = all.flatMap((e) => Object.keys(props(e)));
    expect(attrs.some((k) => /^data-typeface/.test(k))).toBe(false);
  });
});

describe("children: arbitrary JSX is accepted, unlike <Shield>", () => {
  it("<Shield> still throws on non-string children", () => {
    // The rule <NonShield> departs from, pinned here so the contrast is a test
    // and not just a comment.
    expect(() =>
      Shield({ children: { type: "em", props: {} } as never, a11y: OFF }),
    ).toThrow(/plain string/);
  });

  it("accepts nested elements, because there is no encoder to blind", () => {
    const link = React_createElement("a", { href: "/docs" }, "the docs");
    expect(() => NonShield({ as: "h2", children: ["Read ", link] })).not.toThrow();
    const tree = NonShield({ as: "h2", children: ["Read ", link] });
    expect(visibleText(block(tree))).toBe("Read the docs");
  });

  it("accepts numbers, fragments and nullish children", () => {
    expect(() => NonShield({ children: 2026 })).not.toThrow();
    expect(() => NonShield({ children: null })).not.toThrow();
    expect(() => NonShield({ children: undefined })).not.toThrow();
  });

  it("rejects an unknown prop rather than dropping it silently", () => {
    expect(() => NonShield({ children: HEADING, href: "/x" } as never)).toThrow(/does not/);
  });
});

describe("font assets share <Shield>'s registry, and are not duplicated", () => {
  it("emits ONE stylesheet per family, not one per element", () => {
    const trees = withShieldRenderPass(() => [
      NonShield({ as: "h2", children: HEADING }),
      Shield({ children: BODY, variant: "alpha", a11y: OFF }),
      NonShield({ as: "p", children: HEADING }),
    ]);
    const styles = trees.flatMap((t) => findAllTags(t as never, "style")).map(html);
    // TWO families now, so two stylesheets: the shielded cut and the neutral
    // one are different files and must not answer to the same family name, or
    // CSS font matching would hand unshielded headings to the shielded face.
    // The three ELEMENTS still produce two sheets, which is the de-duplication
    // this describe block is about — the second <NonShield> emits nothing.
    expect(styles).toHaveLength(2);
    expect(styles.filter((s) => s.includes("optik-n.woff2"))).toHaveLength(1);
    expect(styles.filter((s) => s.includes("optik-a.woff2"))).toHaveLength(1);
    expect(findAllTags(trees[2] as never, "style")).toHaveLength(0);
  });

  it("emits ONE guard, and <NonShield> is not what emits it", () => {
    const trees = withShieldRenderPass(() => [
      NonShield({ as: "h2", variant: "alpha", children: HEADING }),
      Shield({ children: BODY, variant: "alpha", a11y: OFF }),
    ]);
    const scripts = trees.flatMap((t) => findAllTags(t as never, "script"));
    expect(scripts).toHaveLength(1);
    // The <NonShield> rendered first and still emitted no script of its own.
    expect(findAllTags(trees[0] as never, "script")).toHaveLength(0);
  });

  it("a NonShield that renders first does not starve <Shield> of its guard", () => {
    // The registry buckets are independent: claiming "styles" must not claim
    // "guards". If it did, a page whose first element is a heading would ship
    // no font-load guard at all and a missing font would paint raw decoys.
    const trees = withShieldRenderPass(() => [
      NonShield({ as: "h1", variant: "beta", children: HEADING }),
      Shield({ children: BODY, variant: "beta", a11y: OFF }),
    ]);
    const guard = trees.flatMap((t) => findAllTags(t as never, "script")).map(html);
    expect(guard).toHaveLength(1);
    expect(guard[0]).toContain("document.fonts");
  });

  it("never auto-rotates, so a page of headings means ONE font", () => {
    // <Shield> hashes its content across alpha/beta/gamma. <NonShield> has one
    // face and no dictionary to spread, so four headings are one stylesheet
    // and one file — and `variant` cannot change that even when passed.
    const trees = withShieldRenderPass(() =>
      ["one", "two", "three", "four"].map((t) => NonShield({ children: t })),
    );
    const styles = trees.flatMap((t) => findAllTags(t as never, "style"));
    expect(styles).toHaveLength(1);
    expect(html(styles[0]!)).toContain("optik-n");

    const pinned = withShieldRenderPass(() => [
      NonShield({ children: HEADING, variant: "gamma" }),
    ]);
    expect(html(findAllTags(pinned[0] as never, "style")[0]!)).toContain("optik-n");
  });
});

describe("styling props behave as they do on <Shield>", () => {
  it("snaps a numeric weight to a real bundled cut", () => {
    expect(styleOf(NonShield({ children: HEADING, weight: 470 })).fontWeight).toBe(500);
    expect(styleOf(NonShield({ children: HEADING, weight: "demibold" })).fontWeight).toBe(600);
  });

  it("sets font-style only when `italic` is given, in both directions", () => {
    // Unset must emit NOTHING, so a caption inside an italic aside follows it.
    // `italic={false}` is a real instruction — pin upright against an italic
    // ancestor — so it has to emit `normal` rather than nothing.
    expect(styleOf(NonShield({ children: HEADING })).fontStyle).toBeUndefined();
    expect(styleOf(NonShield({ children: HEADING, italic: true })).fontStyle).toBe("italic");
    expect(styleOf(NonShield({ children: HEADING, italic: false })).fontStyle).toBe("normal");
  });

  it("declares the italic cuts, so a nested <em> has a face to resolve to", () => {
    // <NonShield> takes arbitrary JSX, so `<em>` inside a heading is the
    // ordinary case rather than an edge one. font-synthesis is off, so a
    // missing italic declaration would render it upright and log nothing.
    const css = html(findAllTags(NonShield({ children: HEADING }) as never, "style")[0]!);
    expect(css).toContain("optik-n-italic.woff2");
    expect(css).toContain("optik-n-italic-700.woff2");
    expect(css).toContain("font-style:italic");
  });

  it("throws on a weight that is not a real cut or a valid number", () => {
    expect(() => NonShield({ children: HEADING, weight: "heavy" as never })).toThrow(RangeError);
    expect(() => NonShield({ children: HEADING, weight: 0 })).toThrow(RangeError);
  });

  it("passes through size, lineHeight, className and style", () => {
    const tree = NonShield({
      children: HEADING,
      size: "3rem",
      lineHeight: 1.2,
      className: "title",
      style: { color: "red" },
    });
    const style = styleOf(tree);
    expect(style.fontSize).toBe("3rem");
    expect(style.lineHeight).toBe(1.2);
    expect(style.color).toBe("red");
    expect(props(block(tree)).className).toBe("title");
  });

  it("throws on an unknown variant", () => {
    expect(() => NonShield({ children: HEADING, variant: "Alpha" as never })).toThrow(
      /not a bundled face/,
    );
  });
});

// A tiny local createElement so this file needs no JSX pragma, matching the
// rest of the suite's habit of staying in plain .ts.
function React_createElement(type: string, p: Record<string, unknown>, ...kids: unknown[]) {
  return { $$typeof: Symbol.for("react.element"), type, key: null, ref: null, props: { ...p, children: kids.length === 1 ? kids[0] : kids } } as never;
}
