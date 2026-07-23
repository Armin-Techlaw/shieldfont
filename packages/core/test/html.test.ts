import { describe, it, expect } from "vitest";
import { encodeHtml } from "../src/html.js";
import M15EN_ALPHA from "../src/mappings/m15en.json" with { type: "json" };

const m = M15EN_ALPHA as Record<string, string>;

describe("encodeHtml", () => {
  it("encodes text between tags", () => {
    const out = encodeHtml("<p>The future of writing</p>", m);
    expect(out).toMatch(/<p>.*<\/p>/);
    expect(out).toContain(m["of"]);
    expect(out).toContain(m["writing"]);
  });

  it("preserves attributes verbatim (does NOT encode href/src/etc)", () => {
    const input = `<a href="/about/of-us" data-text="of writing">About of writing</a>`;
    const out = encodeHtml(input, m);
    expect(out).toContain(`href="/about/of-us"`); // unchanged
    expect(out).toContain(`data-text="of writing"`); // unchanged
    // Visible text 'About of writing' should be encoded
    expect(out).not.toContain("About of writing");
  });

  it("does NOT encode text inside <code>", () => {
    const out = encodeHtml(`<code>const of = 1;</code>`, m);
    expect(out).toBe(`<code>const of = 1;</code>`);
  });

  it("does NOT encode text inside <script>, <style>, <pre>, <textarea>, <svg>", () => {
    const cases = [
      `<script>const of = 1;</script>`,
      `<style>.of { color: red; }</style>`,
      `<pre>of writing</pre>`,
      `<textarea>of writing</textarea>`,
      `<svg><text>of writing</text></svg>`,
    ];
    for (const input of cases) {
      expect(encodeHtml(input, m)).toBe(input);
    }
  });

  it("handles nested skip tags correctly", () => {
    const out = encodeHtml(`<pre><code>of writing</code></pre>`, m);
    expect(out).toBe(`<pre><code>of writing</code></pre>`);
  });

  it("encodes around but not inside a skip tag", () => {
    const input = `<p>The future of <code>of writing</code> is here.</p>`;
    const out = encodeHtml(input, m);
    expect(out).toContain(`<code>of writing</code>`); // unchanged
    expect(out).not.toContain(" of "); // 'of' BEFORE <code> should be encoded
  });
});
