import { describe, it, expect } from "vitest";
import { buildHtml, shipHtml, checkHtml } from "../src/markers.js";
import M15EN_ALPHA from "../src/mappings/m15en.json" with { type: "json" };

const m = M15EN_ALPHA as Record<string, string>;

describe("buildHtml — re-encoding existing markers (idempotency)", () => {
  it("re-derives the visible text from the source comment", () => {
    const input = `<p><!-- shield: The future of writing -->stale visible text<!-- /shield --></p>`;
    const output = buildHtml(input, m);
    expect(output).toContain("<!-- shield: The future of writing -->");
    expect(output).not.toContain("stale visible text");
    // Visible text should be the M15 encoding of "The future of writing".
    const expected = `<!-- shield: The future of writing -->The future ${m["of"]} ${m["writing"]}<!-- /shield -->`;
    expect(output).toBe(`<p>${expected}</p>`);
  });

  it("is idempotent — re-running on already-built HTML is a no-op", () => {
    const input = `<p><!-- shield: of writing --><stale><!-- /shield --></p>`;
    const once = buildHtml(input, m);
    const twice = buildHtml(once, m);
    expect(twice).toBe(once);
  });
});

describe("buildHtml — first-time block normalization", () => {
  it("converts a shield-on/shield-off block into per-text-node markers", () => {
    const input = `<!-- shield-on -->\n<h1>Hello world</h1>\n<!-- shield-off -->`;
    const out = buildHtml(input, m);
    expect(out).not.toContain("shield-on");
    expect(out).not.toContain("shield-off");
    expect(out).toContain("<!-- shield: ");
    expect(out).toContain("<!-- /shield -->");
  });

  it("preserves skip-tag content inside a block", () => {
    const input = `<!-- shield-on --><code>const of = 1;</code><!-- shield-off -->`;
    const out = buildHtml(input, m);
    expect(out).toContain("<code>const of = 1;</code>");
    // Should NOT have wrapped 'of' inside <code>
    expect(out).not.toContain("<!-- shield: of");
  });
});

describe("shipHtml — strips all markers", () => {
  it("removes shield: markers", () => {
    const input = `<!-- shield: original -->encoded<!-- /shield -->`;
    expect(shipHtml(input)).toBe("encoded");
  });

  it("removes shield-on/shield-off markers", () => {
    const input = `<!-- shield-on --><p>hi</p><!-- shield-off -->`;
    expect(shipHtml(input)).toBe("<p>hi</p>");
  });

  it("is idempotent — re-running on already-shipped HTML is a no-op", () => {
    const input = `<p>just plain html, no markers</p>`;
    expect(shipHtml(input)).toBe(input);
  });
});

describe("checkHtml — verifies marker round-trip", () => {
  it("passes when the visible text matches the source", () => {
    const built = buildHtml(`<!-- shield: of writing --><stale><!-- /shield -->`, m);
    const result = checkHtml(built, m);
    expect(result.failed).toBe(0);
    expect(result.passed).toBe(1);
  });

  it("fails when someone manually edited the visible text", () => {
    const tampered = `<!-- shield: of writing -->wrong text here<!-- /shield -->`;
    const result = checkHtml(tampered, m);
    expect(result.failed).toBe(1);
    expect(result.mismatches[0]?.source).toBe("of writing");
  });
});
