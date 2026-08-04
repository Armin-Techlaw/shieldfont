/**
 * Page-level assets are emitted once per page, not once per <Shield>.
 *
 * The @font-face <style> and the guard <script> are ~3.7 kB together and
 * identical for every shield of a family, so a six-shield page used to spend
 * roughly 19 kB repeating them. Nothing de-duplicated them: React does not
 * de-dupe <style> tags in SSR output (not on 18, and not on 19 without a
 * `precedence` prop this package does not pass), and the WeakSet that claimed
 * to was never read or written — it could not even have held variant strings,
 * since WeakSet.add("alpha") throws.
 *
 * What de-duplicates them now is a registry scoped to the render pass: React's
 * cache() supplies one under React Server Components, and
 * withShieldRenderPass() supplies one for the synchronous renderers, which
 * install no cache dispatcher. With NEITHER in play every shield emits its own
 * copy, which is the behaviour these tests pin down last: bigger, never broken.
 */
import { describe, it, expect } from "vitest";
import { Shield, withShieldRenderPass } from "../src/Shield.js";
import { findAllTags, props, shieldedBlock } from "./helpers.js";

const BODY = "The future of writing belongs to those who write it.";
const OFF = { mode: "none" } as const;

function html(el: { props: unknown }): string {
  return ((el.props as Record<string, { __html: string }>).dangerouslySetInnerHTML ?? { __html: "" })
    .__html;
}

function count(trees: unknown[], tag: string): number {
  return trees.reduce<number>((n, t) => n + findAllTags(t as never, tag).length, 0);
}

describe("inside a render pass the page-level assets are emitted once", () => {
  it("collapses six shields of one variant to one <style> and one guard", () => {
    const trees = withShieldRenderPass(() =>
      Array.from({ length: 6 }, (_, i) =>
        Shield({ children: `${BODY} ${i}`, variant: "alpha", a11y: OFF }),
      ),
    );
    expect(count(trees, "style")).toBe(1);
    expect(count(trees, "script")).toBe(1);
    // Every shield still renders its own encoded block. De-duplication touches
    // the page assets and nothing else.
    expect(trees.map((t) => props(shieldedBlock(t)).children)).toHaveLength(6);
    expect(new Set(trees.map((t) => props(shieldedBlock(t)).children)).size).toBe(6);
  });

  it("emits one pair per family when variants are mixed", () => {
    const trees = withShieldRenderPass(() => [
      Shield({ children: BODY, variant: "alpha", a11y: OFF }),
      Shield({ children: BODY, variant: "beta", a11y: OFF }),
      Shield({ children: BODY, variant: "alpha", a11y: OFF }),
      Shield({ children: BODY, variant: "gamma", a11y: OFF }),
      Shield({ children: BODY, variant: "beta", a11y: OFF }),
    ]);
    const styles = trees.flatMap((t) => findAllTags(t, "style")).map(html);
    expect(styles).toHaveLength(3);
    expect(styles.filter((s) => s.includes("optik-a"))).toHaveLength(1);
    expect(styles.filter((s) => s.includes("optik-b"))).toHaveLength(1);
    expect(styles.filter((s) => s.includes("optik-c"))).toHaveLength(1);
  });

  it("keeps the assets attached to the FIRST shield of each family", () => {
    const trees = withShieldRenderPass(() => [
      Shield({ children: BODY, variant: "alpha", a11y: OFF }),
      Shield({ children: BODY, variant: "alpha", a11y: OFF }),
    ]);
    // Order matters: the <style> has to reach the browser no later than the
    // element that needs it.
    expect(findAllTags(trees[0]!, "style")).toHaveLength(1);
    expect(findAllTags(trees[1]!, "style")).toHaveLength(0);
  });
});

describe("de-duplication never loses a weight", () => {
  it("hands a later shield's weight to the watcher the first one started", () => {
    const trees = withShieldRenderPass(() => [
      Shield({ children: BODY, variant: "alpha", weight: "regular", a11y: OFF }),
      Shield({ children: BODY, variant: "alpha", weight: "black", a11y: OFF }),
    ]);
    const scripts = trees.flatMap((t) => findAllTags(t, "script")).map(html);
    expect(scripts).toHaveLength(2);
    // One full bootstrap seeded with 400 ...
    expect(scripts[0]).toContain("var SEED   = 400;");
    expect(scripts[0]!.length).toBeGreaterThan(1000);
    // ... and one tiny hand-off carrying 900.
    expect(scripts[1]).toContain("s.seed(900,0)");
    expect(scripts[1]!.length).toBeLessThan(400);
  });

  it("emits one hand-off per distinct weight, not per shield", () => {
    const trees = withShieldRenderPass(() => [
      Shield({ children: BODY, variant: "alpha", weight: "regular", a11y: OFF }),
      Shield({ children: `${BODY} a`, variant: "alpha", weight: "bold", a11y: OFF }),
      Shield({ children: `${BODY} b`, variant: "alpha", weight: "bold", a11y: OFF }),
      Shield({ children: `${BODY} c`, variant: "alpha", weight: "bold", a11y: OFF }),
    ]);
    const scripts = trees.flatMap((t) => findAllTags(t, "script")).map(html);
    expect(scripts).toHaveLength(2);
    expect(scripts[1]).toContain("s.seed(700,0)");
  });

  it("treats numbers that snap to the same cut as one weight", () => {
    // 470, 500 and 530 are three ways of writing Medium. Because the snapping
    // happens before the bookkeeping, the pass claims 500 once and the page
    // gets a single hand-off instead of three.
    const trees = withShieldRenderPass(() => [
      Shield({ children: BODY, variant: "alpha", weight: "bold", a11y: OFF }),
      Shield({ children: `${BODY} a`, variant: "alpha", weight: 470, a11y: OFF }),
      Shield({ children: `${BODY} b`, variant: "alpha", weight: 500, a11y: OFF }),
      Shield({ children: `${BODY} c`, variant: "alpha", weight: 530, a11y: OFF }),
    ]);
    const scripts = trees.flatMap((t) => findAllTags(t, "script")).map(html);
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toContain("var SEED   = 700;");
    expect(scripts[1]).toContain("s.seed(500,0)");
  });

  it("treats the same weight in two styles as two faces", () => {
    // optik-a-700.woff2 and optik-a-italic-700.woff2 are different files. If
    // the bookkeeping keyed on weight alone, the upright block would claim 700
    // and the italic one would emit no hand-off at all — so the guard would
    // never probe the italic cut, and a deploy that copied only the uprights
    // would pass while every emphasis on the page fell back to upright.
    const trees = withShieldRenderPass(() => [
      Shield({ children: BODY, variant: "alpha", weight: "bold", a11y: OFF }),
      Shield({ children: `${BODY} a`, variant: "alpha", weight: "bold", italic: true, a11y: OFF }),
    ]);
    const scripts = trees.flatMap((t) => findAllTags(t, "script")).map(html);
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toContain("var SEED   = 700;");
    expect(scripts[0]).toContain("var SEEDIT = 0;");
    expect(scripts[1]).toContain("s.seed(700,1)");
  });

  it("adds no hand-off for a shield that never set a weight", () => {
    // Inherited weights are the DOM sweep's job, not the seed's.
    const trees = withShieldRenderPass(() => [
      Shield({ children: BODY, variant: "alpha", a11y: OFF }),
      Shield({ children: `${BODY} 2`, variant: "alpha", a11y: OFF }),
    ]);
    expect(count(trees, "script")).toBe(1);
    expect(html(findAllTags(trees[0]!, "script")[0]!)).toContain("var SEED   = null;");
  });

  it("gives each family its own weight bookkeeping", () => {
    const trees = withShieldRenderPass(() => [
      Shield({ children: BODY, variant: "alpha", weight: "bold", a11y: OFF }),
      Shield({ children: BODY, variant: "beta", weight: "bold", a11y: OFF }),
    ]);
    // Two bootstraps, no hand-offs: 700 is claimed per family, so beta's
    // bootstrap still carries its own seed.
    const scripts = trees.flatMap((t) => findAllTags(t, "script")).map(html);
    expect(scripts).toHaveLength(2);
    expect(scripts.every((s) => s.includes("var SEED   = 700;"))).toBe(true);
    expect(scripts.some((s) => s.includes('"Optik Beta"'))).toBe(true);
  });
});

describe("the pass scope is a scope, not a global", () => {
  it("starts clean for every pass, so no page ships without its assets", () => {
    // The failure this guards against: a static export rendering page after
    // page in one synchronous loop, where a module-level Set would leave every
    // page after the first with no @font-face and no guard.
    for (const pass of [1, 2, 3]) {
      const trees = withShieldRenderPass(() => [
        Shield({ children: `${BODY} ${pass}`, variant: "alpha", a11y: OFF }),
        Shield({ children: `${BODY} ${pass}b`, variant: "alpha", a11y: OFF }),
      ]);
      expect(count(trees, "style")).toBe(1);
      expect(count(trees, "script")).toBe(1);
    }
  });

  it("emits per instance with no pass scope, rather than risking a bare page", () => {
    const trees = Array.from({ length: 6 }, (_, i) =>
      Shield({ children: `${BODY} ${i}`, variant: "alpha", a11y: OFF }),
    );
    expect(count(trees, "style")).toBe(6);
    expect(count(trees, "script")).toBe(6);
  });

  it("closes the scope even when the render throws", () => {
    expect(() =>
      withShieldRenderPass(() => {
        Shield({ children: BODY, variant: "alpha", a11y: OFF });
        throw new Error("render blew up");
      }),
    ).toThrow("render blew up");
    // Scope gone: the next shield emits its own assets again.
    const tree = Shield({ children: BODY, variant: "alpha", a11y: OFF });
    expect(findAllTags(tree, "style")).toHaveLength(1);
  });

  it("returns whatever the render returned", () => {
    expect(withShieldRenderPass(() => "<html>done</html>")).toBe("<html>done</html>");
  });

  it("restores an outer scope after a nested one", () => {
    const trees = withShieldRenderPass(() => {
      const outer = Shield({ children: BODY, variant: "alpha", a11y: OFF });
      const inner = withShieldRenderPass(() =>
        Shield({ children: BODY, variant: "alpha", a11y: OFF }),
      );
      const after = Shield({ children: BODY, variant: "alpha", a11y: OFF });
      return [outer, inner, after];
    });
    // The nested pass gets its own registry, so it emits; the outer pass had
    // already claimed alpha, so the shield after it does not.
    expect(findAllTags(trees[0]!, "style")).toHaveLength(1);
    expect(findAllTags(trees[1]!, "style")).toHaveLength(1);
    expect(findAllTags(trees[2]!, "style")).toHaveLength(0);
  });
});

describe("byte cost", () => {
  it("shrinks the repeated payload of a six-shield page by an order of magnitude", () => {
    const make = () =>
      Array.from({ length: 6 }, (_, i) =>
        Shield({ children: `${BODY} ${i}`, variant: "alpha", a11y: OFF }),
      );
    const bytes = (trees: ReturnType<typeof make>) =>
      trees
        .flatMap((t) => [...findAllTags(t, "style"), ...findAllTags(t, "script")])
        .reduce((n, el) => n + html(el).length, 0);

    const before = bytes(make());
    const after = bytes(withShieldRenderPass(make));
    expect(after * 5).toBeLessThan(before);
  });
});
