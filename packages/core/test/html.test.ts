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

describe("HTML comments are inert (regression)", () => {
  it("does not let a tag name inside a comment disable encoding", () => {
    // The old tag pattern could not match `<!--`, so the `<pre>` written inside
    // this comment incremented the skip depth and never gave it back — every
    // text node to the end of the document shipped in plain English.
    const out = encodeHtml(`<p>of writing</p><!-- <pre> --><p>of writing</p>`, m);
    expect(out).not.toContain(`<p>of writing</p><!-- <pre> --><p>of writing</p>`);
    expect(out.split("<!-- <pre> -->")[1]).not.toContain("of writing");
  });

  it("leaves comment bodies untouched", () => {
    expect(encodeHtml(`<!-- of writing -->`, m)).toBe(`<!-- of writing -->`);
  });

  it("does not count a tag written inside a raw-text element", () => {
    // <script> content is CDATA: this page contains no <textarea>.
    const out = encodeHtml(`<script>var t = "<textarea>";</script><p>of writing</p>`, m);
    expect(out).toContain(`<script>var t = "<textarea>";</script>`);
    expect(out.split("</script>")[1]).not.toContain("of writing");
  });
});

describe("attribute values survive a > inside them (regression)", () => {
  it("does not encode an attribute containing a greater-than sign", () => {
    const input = `<img alt="of writing > of writing">`;
    expect(encodeHtml(input, m)).toBe(input);
  });

  it("still encodes the text after such a tag", () => {
    const out = encodeHtml(`<img alt="a > b"><p>of writing</p>`, m);
    expect(out).toContain(`alt="a > b"`);
    expect(out).not.toContain(`<p>of writing</p>`);
  });
});

describe("system-chrome tags are skipped (regression)", () => {
  it("leaves <title> and <option> alone — the OS draws them, not our font", () => {
    expect(encodeHtml(`<title>of writing</title>`, m)).toBe(`<title>of writing</title>`);
    expect(encodeHtml(`<option>of writing</option>`, m)).toBe(`<option>of writing</option>`);
  });
});

describe("encodeHtml argument validation (regression)", () => {
  it("names the bad argument", () => {
    expect(() => encodeHtml(null as unknown as string, m)).toThrow(/html must be a string/);
  });
});
