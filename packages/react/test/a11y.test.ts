/**
 * The `a11y` prop.
 *
 * Two properties carry the whole feature and are asserted hardest:
 *   1. the alternative is OUTSIDE the aria-hidden subtree — otherwise assistive
 *      technology never reaches it and the prop is decoration;
 *   2. `visualHidden` clips rather than `display:none`-ing — the latter would
 *      remove the control from the accessibility tree, which is the exact bug
 *      the prop exists to fix.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { Shield } from "../src/Shield.js";
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
      { mode: "text", href: "/plain" } as const,
      { mode: "audio", src: "/a.mp3" } as const,
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

  it("renders a transcript link only when one is given", () => {
    const without = Shield({ children: BODY, a11y: { mode: "audio", src: "/a.mp3" } });
    expect(findAllTags(without, "a")).toHaveLength(0);

    const withT = Shield({
      children: BODY,
      a11y: { mode: "audio", src: "/a.mp3", transcript: "/t.txt" },
    });
    const links = findAllTags(withT, "a");
    expect(links).toHaveLength(1);
    expect(props(links[0]!).href).toBe("/t.txt");
    expect(props(links[0]!).children).toBe("Transcript");
  });

  it("lets `label` name the transcript link and `note` replace the sentence", () => {
    const tree = Shield({
      children: BODY,
      a11y: {
        mode: "audio",
        src: "/a.mp3",
        transcript: "/t.txt",
        label: "Read the transcript",
        note: "Listen to this essay.",
      },
    });
    expect(props(findTag(tree, "a")!).children).toBe("Read the transcript");
    expect(props(findTag(tree, "p")!).children).toBe("Listen to this essay.");
  });
});

describe('mode: "text"', () => {
  it("links the plain-text version with a sensible default label", () => {
    const tree = Shield({ children: BODY, a11y: { mode: "text", href: "/posts/1/plain" } });
    const link = findTag(tree, "a");
    expect(link).toBeDefined();
    expect(props(link!).href).toBe("/posts/1/plain");
    expect(props(link!).children).toBe("Plain-text version");
    expect(findTag(tree, "audio")).toBeUndefined();
  });

  it("honours a custom label", () => {
    const tree = Shield({
      children: BODY,
      a11y: { mode: "text", href: "/p.txt", label: "Read as plain text" },
    });
    expect(props(findTag(tree, "a")!).children).toBe("Read as plain text");
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
      { mode: "text", href: "/p.txt", visualHidden: true } as const,
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
    const tree = Shield({ children: BODY, a11y: { mode: "text", href: "/p.txt" } });
    const wrap = walkAll(tree).find((el) => String(props(el).className ?? "").endsWith("-alt"));
    expect(wrap!.type).toBe("div");
    expect(findTag(tree, "p")).toBeDefined();
  });

  it("uses phrasing content for an inline Shield, so it cannot split a <p>", () => {
    // A <div>/<p> sibling emitted next to an inline <Shield as="span"> inside a
    // paragraph makes the browser close the enclosing <p> early.
    const tree = Shield({ as: "span", children: BODY, a11y: { mode: "text", href: "/p.txt" } });
    const wrap = walkAll(tree).find((el) => String(props(el).className ?? "").endsWith("-alt"));
    expect(wrap!.type).toBe("span");
    expect(findTag(tree, "div")).toBeUndefined();
    expect(findTag(tree, "p")).toBeUndefined();
    expect(shieldedBlock(tree).type).toBe("span");
  });

  it("groups and labels the alternative", () => {
    const tree = Shield({ children: BODY, a11y: { mode: "audio", src: "/a.mp3" } });
    const wrap = walkAll(tree).find((el) => String(props(el).className ?? "").endsWith("-alt"));
    expect(props(wrap!).role).toBe("group");
    expect(props(wrap!)["aria-label"]).toBe("Accessible alternative");
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
