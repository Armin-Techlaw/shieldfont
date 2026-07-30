/**
 * The `a11y` prop.
 *
 * Two properties carry the whole feature and are asserted hardest:
 *   1. the alternative is OUTSIDE the aria-hidden subtree — otherwise assistive
 *      technology never reaches it and the prop is decoration;
 *   2. `visualHidden` clips rather than `display:none`-ing — the latter would
 *      remove the control from the accessibility tree, which is the exact bug
 *      the prop exists to fix.
 *
 * A third property is now asserted just as hard, in "renders no link, ever":
 * the alternative contains NO `<a>` at all. `mode: "text"` and the audio
 * mode's optional `transcript` both used to put a URL to the original words in
 * the HTML, which any scraper that follows it reads for free. Both are gone,
 * and the test is the guard against either coming back by accident. The cases
 * they carried (markup validity, `visualHidden`, `note`) run against the audio
 * mode.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { Shield, type ShieldA11y } from "../src/Shield.js";
import type { CSSProperties } from "react";
import { descendants, findAllTags, findTag, props, shieldedBlock, walkAll } from "./helpers.js";

const BODY = "The future of writing belongs to those who write it.";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("aria-hidden stays on the encoded block", () => {
  it("keeps aria-hidden=\"true\", with and without an alternative", () => {
    for (const a11y of [
      { mode: "none" } as const,
      { mode: "audio", src: "/a.mp3" } as const,
      { mode: "audio", src: "/a.mp3", note: "Listen." } as const,
    ]) {
      const block = shieldedBlock(Shield({ children: BODY, a11y }));
      expect(props(block)["aria-hidden"]).toBe("true");
    }
  });

  it("never puts the alternative inside the hidden subtree", () => {
    const tree = Shield({ children: BODY, a11y: { mode: "audio", src: "/a.mp3" } });
    const block = shieldedBlock(tree);
    const inside = descendants(block);
    expect(inside.some((el) => el.type === "audio")).toBe(false);
    expect(inside.some((el) => el.type === "a")).toBe(false);
    // ...and it IS somewhere in the tree.
    expect(findTag(tree, "audio")).toBeDefined();
  });

  it("puts the alternative BEFORE the hidden block in DOM order", () => {
    const tree = Shield({ children: BODY, a11y: { mode: "audio", src: "/a.mp3" } });
    const order = walkAll(tree);
    const audioAt = order.findIndex((el) => el.type === "audio");
    const blockAt = order.indexOf(shieldedBlock(tree));
    expect(audioAt).toBeGreaterThanOrEqual(0);
    expect(blockAt).toBeGreaterThanOrEqual(0);
    expect(audioAt).toBeLessThan(blockAt);
  });
});

describe('mode: "audio"', () => {
  it("renders a native <audio controls> with preload=none and the src", () => {
    const tree = Shield({ children: BODY, a11y: { mode: "audio", src: "/audio/post-1.mp3" } });
    const audio = findTag(tree, "audio");
    expect(audio).toBeDefined();
    expect(props(audio!).controls).toBe(true);
    expect(props(audio!).preload).toBe("none");
    expect(props(audio!).src).toBe("/audio/post-1.mp3");
  });

  it("renders an explanatory sentence, not a bare label", () => {
    const tree = Shield({ children: BODY, a11y: { mode: "audio", src: "/a.mp3" } });
    const note = findTag(tree, "p");
    expect(note).toBeDefined();
    const text = String(props(note!).children);
    expect(text.length).toBeGreaterThan(40);
    expect(text).toMatch(/assistive technology/i);
    expect(text).toMatch(/audio/i);
  });

  it("lets `note` replace the sentence", () => {
    const tree = Shield({
      children: BODY,
      a11y: { mode: "audio", src: "/a.mp3", note: "Listen to this essay." },
    });
    expect(props(findTag(tree, "p")!).children).toBe("Listen to this essay.");
  });
});

describe("renders no link, ever", () => {
  // The regression guard for the whole reason `mode: "text"` and the audio
  // mode's `transcript` were deleted: a URL to the original words sitting in
  // the HTML is a one-line bypass for any scraper that follows it, and it
  // cannot be shown to a screen reader without being shown to everyone else.
  // If an <a> reappears in this output, something has undone that.
  it("emits no <a> under any accepted configuration", () => {
    for (const a11y of [
      { mode: "none" } as const,
      { mode: "audio", src: "/a.mp3" } as const,
      { mode: "audio", src: "/a.mp3", note: "Listen." } as const,
      { mode: "audio", src: "/a.mp3", visualHidden: true } as const,
    ]) {
      const tree = Shield({ children: BODY, a11y });
      expect(findAllTags(tree, "a")).toHaveLength(0);
    }
    // ...including with no `a11y` at all (which warns; silence it here).
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(findAllTags(Shield({ children: BODY }), "a")).toHaveLength(0);
  });

  it("ignores a leftover `transcript`/`label` instead of rendering it", () => {
    // TypeScript rejects both fields now, but a plain-JS caller and a project
    // mid-upgrade can still pass the 0.2.0 shape. The old URL must not reach
    // the DOM just because the object it arrived on still has the key — that
    // would make the removal cosmetic for exactly the installs that have not
    // migrated yet. (Typechecking does not run over this directory, so this is
    // asserted at runtime, where it is actually verified.)
    const stale = {
      mode: "audio",
      src: "/a.mp3",
      transcript: "/t.txt",
      label: "Read the transcript",
    } as unknown as ShieldA11y;
    const tree = Shield({ children: BODY, a11y: stale });
    expect(findAllTags(tree, "a")).toHaveLength(0);
    expect(JSON.stringify(tree)).not.toContain("/t.txt");
    // The audio itself still renders — a stale field is ignored, not fatal.
    expect(findTag(tree, "audio")).toBeDefined();
  });
});

describe('mode: "none"', () => {
  it("renders nothing extra and does not warn — an auditable opt-out", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tree = Shield({ children: BODY, a11y: { mode: "none" } });
    expect(warn).not.toHaveBeenCalled();
    expect(findTag(tree, "audio")).toBeUndefined();
    expect(findTag(tree, "a")).toBeUndefined();
    expect(findTag(tree, "p")).toBeUndefined();
    // style + script + the encoded block, nothing else.
    expect(walkAll(tree).filter((el) => typeof el.type === "string")).toHaveLength(3);
  });
});

describe("visualHidden", () => {
  it("clips instead of using display:none or visibility:hidden", () => {
    for (const a11y of [
      { mode: "audio", src: "/a.mp3", visualHidden: true } as const,
      { mode: "audio", src: "/a.mp3", note: "Listen.", visualHidden: true } as const,
    ]) {
      const tree = Shield({ children: BODY, a11y });
      const wrap = walkAll(tree).find((el) => String(props(el).className ?? "").endsWith("-alt"));
      expect(wrap).toBeDefined();
      const style = props(wrap!).style as CSSProperties;
      expect(style.clipPath).toBe("inset(50%)");
      expect(style.position).toBe("absolute");
      expect(style.overflow).toBe("hidden");
      // The two ways of getting this wrong.
      expect(style.display).toBeUndefined();
      expect(style.visibility).toBeUndefined();
      expect(JSON.stringify(style)).not.toContain("none");
    }
  });

  it("is visible by default", () => {
    const tree = Shield({ children: BODY, a11y: { mode: "audio", src: "/a.mp3" } });
    const wrap = walkAll(tree).find((el) => String(props(el).className ?? "").endsWith("-alt"));
    expect(props(wrap!).style).toBeUndefined();
  });
});

describe("markup validity", () => {
  it("wraps in a div/p for block Shields", () => {
    const tree = Shield({ children: BODY, a11y: { mode: "audio", src: "/a.mp3" } });
    const wrap = walkAll(tree).find((el) => String(props(el).className ?? "").endsWith("-alt"));
    expect(wrap!.type).toBe("div");
    expect(findTag(tree, "p")).toBeDefined();
  });

  it("uses phrasing content for an inline Shield, so it cannot split a <p>", () => {
    // A <div>/<p> sibling emitted next to an inline <Shield as="span"> inside a
    // paragraph makes the browser close the enclosing <p> early.
    const tree = Shield({ as: "span", children: BODY, a11y: { mode: "audio", src: "/a.mp3" } });
    const wrap = walkAll(tree).find((el) => String(props(el).className ?? "").endsWith("-alt"));
    expect(wrap!.type).toBe("span");
    expect(findTag(tree, "div")).toBeUndefined();
    expect(findTag(tree, "p")).toBeUndefined();
    expect(shieldedBlock(tree).type).toBe("span");
  });

  it("wraps the alternative without a group role", () => {
    // `role="group"` + `aria-label` used to be here. Removed after a real
    // VoiceOver session: it announced the group, then that you were "inside of
    // a group", then how to exit the group — before a control that already
    // named itself. A note and a player read fine as plain siblings.
    const tree = Shield({ children: BODY, a11y: { mode: "audio", src: "/a.mp3" } });
    const wrap = walkAll(tree).find((el) => String(props(el).className ?? "").endsWith("-alt"));
    expect(wrap).toBeDefined();
    // `presentation` takes the wrapper itself out of the accessibility tree.
    // Without it VoiceOver announces the plain <div> as a group of its own.
    expect(props(wrap!).role).toBe("presentation");
    expect(props(wrap!)["aria-label"]).toBeUndefined();
  });
});

describe("still encodes", () => {
  it("leaves the shielded text encoded regardless of the a11y mode", () => {
    const tree = Shield({ children: BODY, a11y: { mode: "audio", src: "/a.mp3" } });
    const encoded = props(shieldedBlock(tree)).children as string;
    expect(typeof encoded).toBe("string");
    expect(encoded).not.toBe(BODY);
    // The alternative must never carry the plaintext into the HTML.
    expect(JSON.stringify(walkAll(tree))).not.toContain(BODY);
  });
});
