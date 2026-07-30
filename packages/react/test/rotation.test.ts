/**
 * Time-based variant rotation.
 *
 * The load-bearing property is ARCHIVE REPRODUCIBILITY: pinning a period index
 * must reproduce that period's assignment exactly, forever, with no stored key
 * and no backup. Several assertions below are therefore GOLDEN values — if a
 * change to the hash, the key format or the pool flips them, that change has
 * silently broken every published archive and the test is meant to say so.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Shield, setRotation, periodIndex, variantFor } from "../src/Shield.js";
import { renderedVariant } from "./helpers.js";

const SAMPLE = "The future of writing belongs to those who write it.";

/** Many distinct blocks, to measure distribution and reassignment rates. */
const BLOCKS = Array.from(
  { length: 300 },
  (_, i) => `Block number ${i}: the future of writing belongs to those who write it.`,
);

/** Rotation tests never care about a11y; opt out so no dev warning fires. */
const A11Y_OFF = { mode: "none" } as const;

afterEach(() => {
  setRotation(false);
});

describe("periodIndex", () => {
  it("is calendar-aligned for monthly, not 30-day blocks", () => {
    // 30 days after the epoch is still January, so still period 0.
    expect(periodIndex("2026-01-31T00:00:00Z")).toBe(0);
    expect(periodIndex("2026-01-31T23:59:59Z")).toBe(0);
    // The calendar boundary, not the 30-day one, moves it.
    expect(periodIndex("2026-02-01T00:00:00Z")).toBe(1);
    expect(periodIndex("2026-03-15T00:00:00Z")).toBe(2);
    expect(periodIndex("2027-01-01T00:00:00Z")).toBe(12);
  });

  it("counts backwards before the epoch", () => {
    expect(periodIndex("2025-12-31T23:59:59Z")).toBe(-1);
    expect(periodIndex("2025-01-01T00:00:00Z")).toBe(-12);
  });

  it("uses fixed windows for weekly and daily", () => {
    expect(periodIndex("2026-01-01T00:00:00Z", { period: "weekly" })).toBe(0);
    expect(periodIndex("2026-01-07T23:59:59Z", { period: "weekly" })).toBe(0);
    expect(periodIndex("2026-01-08T00:00:00Z", { period: "weekly" })).toBe(1);
    expect(periodIndex("2026-01-02T00:00:00Z", { period: "daily" })).toBe(1);
    expect(periodIndex("2026-03-15T00:00:00Z", { period: "daily" })).toBe(73);
  });

  it("is UTC, so build machines in different zones agree", () => {
    // 2026-02-01T00:30+02:00 is 2026-01-31T22:30Z — January in UTC, February
    // locally. A Sao Paulo box and a Copenhagen box must both say period 0.
    expect(periodIndex("2026-02-01T00:30:00+02:00")).toBe(0);
    expect(periodIndex("2026-01-31T22:30:00Z")).toBe(0);
    // Same instant expressed three ways, same answer.
    const instant = new Date("2026-06-15T12:00:00Z");
    expect(periodIndex(instant)).toBe(periodIndex(instant.toISOString()));
  });

  it("honours a custom epoch", () => {
    expect(periodIndex("2026-03-15T00:00:00Z", { epoch: "2026-03-01T00:00:00Z" })).toBe(0);
    expect(periodIndex("2026-03-15T00:00:00Z", { epoch: "2025-01-01T00:00:00Z" })).toBe(14);
  });

  it("throws loudly on an unparseable epoch instead of hashing NaN", () => {
    expect(() => periodIndex("2026-03-15T00:00:00Z", { epoch: "last tuesday" })).toThrow(
      /not a valid date/,
    );
    expect(() => setRotation({ epoch: "not-a-date" })).toThrow(/not a valid date/);
  });
});

describe("variantFor — determinism", () => {
  it("gives the same answer for the same inputs, every time", () => {
    const first = variantFor(SAMPLE, { at: 2, salt: "example.com" });
    for (let i = 0; i < 200; i++) {
      expect(variantFor(SAMPLE, { at: 2, salt: "example.com" })).toBe(first);
    }
  });

  it("is stable across equivalent spellings of the same instant", () => {
    const byString = variantFor(SAMPLE, { at: "2026-03-15T00:00:00Z" });
    const byDate = variantFor(SAMPLE, { at: new Date("2026-03-15T00:00:00Z") });
    const byIndex = variantFor(SAMPLE, { at: periodIndex("2026-03-15T00:00:00Z") });
    expect(byString).toBe(byDate);
    expect(byString).toBe(byIndex);
    expect(byString).toBe("beta"); // GOLDEN
  });

  it("mixes the period INTO the content hash, so blocks still vary on a page", () => {
    // A per-period flip of the whole site would be strictly worse than doing
    // nothing: one font per site per period is a cleaner fingerprint than three.
    for (const period of [0, 1, 2, 14]) {
      const used = new Set(BLOCKS.map((b) => variantFor(b, { at: period })));
      expect(used).toEqual(new Set(["alpha", "beta", "gamma"]));
    }
  });

  it("separates salt from period so they cannot collide", () => {
    // Spaces as separators would let salt "ab" + period 1 collide with salt "a"
    // + period "b1". NUL separators cannot appear in either field.
    expect(variantFor(SAMPLE, { salt: "ab", at: 1 })).not.toBe(
      variantFor(SAMPLE, { salt: "a", at: 11 }),
    );
    expect(variantFor(SAMPLE, { salt: "a" })).not.toBe(variantFor(SAMPLE, { salt: "b" }));
  });
});

describe("variantFor — period boundaries", () => {
  it("reassigns a block when the period rolls", () => {
    // This specific block flips at the 1 -> 2 boundary.
    expect(variantFor(SAMPLE, { at: 1 })).toBe("alpha"); // GOLDEN
    expect(variantFor(SAMPLE, { at: 2 })).toBe("beta"); // GOLDEN
    expect(variantFor(SAMPLE, { at: 1 })).not.toBe(variantFor(SAMPLE, { at: 2 }));
  });

  it("moves about two thirds of blocks at every boundary", () => {
    // 1 - 1/3 with a three-variant pool. This is the number the docs quote, so
    // the docs are wrong if this drifts.
    for (const from of [0, 1, 2, 13]) {
      const moved = BLOCKS.filter(
        (b) => variantFor(b, { at: from }) !== variantFor(b, { at: from + 1 }),
      ).length;
      expect(moved / BLOCKS.length).toBeGreaterThan(0.58);
      expect(moved / BLOCKS.length).toBeLessThan(0.75);
    }
  });

  it("rolls at the calendar boundary, not 30 days in", () => {
    // Measured over the population, because any single block has only a 2/3
    // chance of moving at a given boundary.
    const at = (iso: string) => BLOCKS.map((b) => variantFor(b, { at: iso }));
    const earlyJan = at("2026-01-02T00:00:00Z");
    const lateJan = at("2026-01-31T23:59:59Z"); // 30 days later, still January
    const feb = at("2026-02-01T00:00:00Z"); // one second later, new month

    // Nothing moves within a calendar month, however many days pass.
    expect(lateJan).toEqual(earlyJan);

    // Crossing into February reassigns about two thirds of the site.
    const moved = feb.filter((v, i) => v !== lateJan[i]).length;
    expect(moved / BLOCKS.length).toBeGreaterThan(0.58);
    expect(moved / BLOCKS.length).toBeLessThan(0.75);
  });
});

describe("variantFor — maxhide is never rotated into", () => {
  it("never selects maxhide from the default pool", () => {
    for (let period = -24; period <= 24; period++) {
      for (const b of BLOCKS) {
        expect(variantFor(b, { at: period })).not.toBe("maxhide");
      }
    }
  });

  it("filters maxhide out even when a caller puts it in the pool", () => {
    for (let period = -12; period <= 12; period++) {
      for (const b of BLOCKS.slice(0, 60)) {
        expect(variantFor(b, { at: period, pool: ["alpha", "maxhide", "beta"] })).not.toBe(
          "maxhide",
        );
        // Pool of two, one of which is filtered: only alpha can ever come back.
        expect(variantFor(b, { at: period, pool: ["alpha", "maxhide"] })).toBe("alpha");
      }
    }
  });

  it("falls back to the default pool rather than dying on an all-maxhide pool", () => {
    // A misconfigured pool must not take a page down.
    for (const b of BLOCKS.slice(0, 30)) {
      const v = variantFor(b, { at: 3, pool: ["maxhide"] });
      expect(["alpha", "beta", "gamma"]).toContain(v);
    }
    expect(variantFor(SAMPLE, { at: 3, pool: [] })).toBe(variantFor(SAMPLE, { at: 3 }));
  });

  it("drops unknown variant names so a JS caller cannot produce an undefined mapping", () => {
    const v = variantFor(SAMPLE, { at: 3, pool: ["alpha", "delta" as never] });
    expect(v).toBe("alpha");
  });

  it("still lets an author PIN maxhide explicitly", () => {
    expect(renderedVariant(Shield({ children: SAMPLE, variant: "maxhide", a11y: A11Y_OFF }))).toBe(
      "maxhide",
    );
  });
});

describe("archive reproducibility", () => {
  it("reproduces a past period exactly from its index alone", () => {
    // The whole point: no stored key, no backup. Period 14 rebuilt in 2029 must
    // equal period 14 built in 2027.
    const asBuiltThen = BLOCKS.map((b) => variantFor(b, { at: 14 }));
    const rebuiltLater = BLOCKS.map((b) => variantFor(b, { at: 14, salt: "" }));
    expect(rebuiltLater).toEqual(asBuiltThen);
  });

  it("ignores the wall clock entirely when `at` is a number", () => {
    // Two "now"s a decade apart, one pinned index: identical output.
    const a = BLOCKS.map((b) => variantFor(b, { at: 14 }, new Date("2026-04-01T00:00:00Z")));
    const b = BLOCKS.map((x) => variantFor(x, { at: 14 }, new Date("2036-11-30T00:00:00Z")));
    expect(a).toEqual(b);
  });

  it("treats a number as the INDEX and a date as an INSTANT", () => {
    // at: 2 is period 2. at: "2026-03-15" is an instant that FALLS IN period 2.
    // They must agree; a number must never be re-interpreted as a timestamp.
    expect(variantFor(SAMPLE, { at: 2 })).toBe(variantFor(SAMPLE, { at: "2026-03-15T00:00:00Z" }));
    // 2 as a millisecond timestamp would be 1970 — i.e. period -672.
    expect(variantFor(SAMPLE, { at: 2 })).not.toBe(variantFor(SAMPLE, { at: -672 }));
  });

  it("pins the clock through the module-level config too", () => {
    setRotation({ period: "monthly", at: 14 });
    const viaModule = BLOCKS.map((b) => renderedVariant(Shield({ children: b, a11y: A11Y_OFF })));
    setRotation(false);
    const viaPin = BLOCKS.map((b) => variantFor(b, { at: 14 }));
    expect(viaModule).toEqual(viaPin);
  });

  it("holds the golden assignment for period 14", () => {
    expect(variantFor(SAMPLE, { at: 14 })).toBe("alpha"); // GOLDEN
    expect(variantFor(SAMPLE, { at: 14, salt: "example.com" })).toBe("alpha"); // GOLDEN
    expect(variantFor(SAMPLE, { at: 0, salt: "example.com" })).toBe("gamma"); // GOLDEN
  });

  it("rejects a non-finite period index rather than hashing it", () => {
    expect(() => variantFor(SAMPLE, { at: Number.NaN })).toThrow(/finite period index/);
    expect(() => variantFor(SAMPLE, { at: Number.POSITIVE_INFINITY })).toThrow(
      /finite period index/,
    );
  });
});

describe("precedence: variant > rotate > setRotation > content hash", () => {
  it("1. an explicit variant prop always pins, over everything", () => {
    setRotation({ at: 14 });
    for (const pinned of ["alpha", "beta", "gamma", "maxhide"] as const) {
      const tree = Shield({
        children: SAMPLE,
        variant: pinned,
        rotate: { at: 3 },
        a11y: A11Y_OFF,
      });
      expect(renderedVariant(tree)).toBe(pinned);
    }
  });

  it("2. the rotate prop beats module-level setRotation", () => {
    // Chosen so the two configs disagree, otherwise the test proves nothing.
    expect(variantFor(SAMPLE, { at: 2 })).not.toBe(variantFor(SAMPLE, { at: 14 }));
    setRotation({ at: 14 });
    const tree = Shield({ children: SAMPLE, rotate: { at: 2 }, a11y: A11Y_OFF });
    expect(renderedVariant(tree)).toBe(variantFor(SAMPLE, { at: 2 }));
    expect(renderedVariant(tree)).not.toBe(variantFor(SAMPLE, { at: 14 }));
  });

  it("2b. rotate={false} opts one block out, back to the content hash", () => {
    setRotation({ at: 2, salt: "example.com" });
    const rotated = renderedVariant(Shield({ children: SAMPLE, a11y: A11Y_OFF }));
    const optedOut = renderedVariant(Shield({ children: SAMPLE, rotate: false, a11y: A11Y_OFF }));
    setRotation(false);
    const plain = renderedVariant(Shield({ children: SAMPLE, a11y: A11Y_OFF }));
    expect(optedOut).toBe(plain);
    expect(rotated).not.toBe(plain);
  });

  it("2c. rotate={true} uses the defaults", () => {
    const tree = Shield({ children: SAMPLE, rotate: true, a11y: A11Y_OFF });
    expect(renderedVariant(tree)).toBe(variantFor(SAMPLE, {}));
  });

  it("3. setRotation beats the content hash", () => {
    const before = renderedVariant(Shield({ children: SAMPLE, a11y: A11Y_OFF }));
    setRotation({ at: 2 });
    const after = renderedVariant(Shield({ children: SAMPLE, a11y: A11Y_OFF }));
    expect(before).toBe("alpha"); // GOLDEN content-hash assignment
    expect(after).toBe("beta");
    expect(after).not.toBe(before);
  });

  it("4. the content hash is the floor, and setRotation(false) restores it", () => {
    const plain = renderedVariant(Shield({ children: SAMPLE, a11y: A11Y_OFF }));
    setRotation({ at: 2 });
    expect(renderedVariant(Shield({ children: SAMPLE, a11y: A11Y_OFF }))).not.toBe(plain);
    setRotation(false);
    expect(renderedVariant(Shield({ children: SAMPLE, a11y: A11Y_OFF }))).toBe(plain);
  });

  it("emits the @font-face matching the rotated variant, in the same output", () => {
    // Rotation is only safe because the font declaration travels with the HTML.
    setRotation({ at: 2 });
    const tree = Shield({ children: SAMPLE, a11y: A11Y_OFF });
    const v = renderedVariant(tree);
    expect(v).toBe("beta");
    const css = (
      (tree.props as { children: { props: { dangerouslySetInnerHTML: { __html: string } } }[] })
        .children[0] as { props: { dangerouslySetInnerHTML: { __html: string } } }
    ).props.dangerouslySetInnerHTML.__html;
    expect(css).toContain("optik-b.woff2");
    expect(css).toContain("Optik Beta");
  });
});

describe("variant validation (regression)", () => {
  it("rejects a near-miss instead of dying inside the encoder", () => {
    // `variant="Alpha"` reached the encoder as an undefined mapping and threw
    // `Cannot convert undefined or null to object`, with nothing in the stack
    // naming the prop that caused it.
    expect(() => Shield({ children: "x", variant: "Alpha" as never, a11y: { mode: "none" } }))
      .toThrow(/is not a mapping/);
    expect(() => Shield({ children: "x", variant: "m15en" as never, a11y: { mode: "none" } }))
      .toThrow(/"maxhide", not "m15en"/);
  });

  it("accepts every documented variant", () => {
    for (const v of ["alpha", "beta", "gamma", "maxhide"] as const) {
      expect(() => Shield({ children: "x", variant: v, a11y: { mode: "none" } })).not.toThrow();
    }
  });
});
