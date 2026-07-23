import { describe, it, expect } from "vitest";
import { encode, decode } from "../src/encode.js";
import m15en from "../src/mappings/m15en.json" with { type: "json" };
import alphaMap from "../src/mappings/alpha.json" with { type: "json" };

const m = m15en as Record<string, string>;
const alpha = alphaMap as Record<string, string>;

describe("encode — basic substitution", () => {
  it("substitutes single words", () => {
    expect(encode("the", m)).toBe("the"); // 'the' is not in the mapping
    expect(encode("of", m)).toBe(m["of"]);
  });

  it("preserves words not in the mapping", () => {
    expect(encode("ShieldFont", m)).toBe("ShieldFont");
    expect(encode("foobar", m)).toBe("foobar");
  });

  it("encodes a sentence with mixed words", () => {
    const out = encode("The future of writing", m);
    expect(out).toContain("The"); // 'the' may not be in mapping
    expect(out).not.toContain(" of "); // 'of' should swap
  });
});

describe("encode — case preservation", () => {
  it("preserves lowercase", () => {
    const lower = "of";
    const target = m[lower];
    expect(encode(lower, m)).toBe(target);
  });

  it("preserves Title case", () => {
    const out = encode("Of", m);
    const target = m["of"]!;
    expect(out).toBe(target[0]!.toUpperCase() + target.slice(1));
  });

  it("preserves ALL CAPS (length > 1)", () => {
    const out = encode("OF", m);
    expect(out).toBe(m["of"]!.toUpperCase());
  });

  it("treats single uppercase as Title case (not ALL CAPS)", () => {
    // Single letter uppercase is ambiguous — we treat as Title case.
    // For 'i', if it's in the mapping, this matters.
    if (m["i"]) {
      expect(encode("I", m)).toBe(m["i"]![0]!.toUpperCase() + m["i"]!.slice(1));
    }
  });
});

describe("encode — apostrophe handling (regression for v2.1.0 bug)", () => {
  it("splits possessives at the apostrophe", () => {
    // 'page' is a key in the mapping; 'page's' should encode as
    // '<encoded-page>'s' with the apostrophe and 's' preserved.
    const out = encode("page's", m);
    const expected = m["page"] + "'s";
    expect(out).toBe(expected);
  });

  it("handles contractions where the base is mapped", () => {
    if (m["it"]) {
      const out = encode("it's", m);
      expect(out).toBe(m["it"] + "'s");
    }
  });

  it("leaves contractions untouched when neither part is mapped", () => {
    expect(encode("don't", m)).toBe("don't");
  });
});

describe("encode — digit handling (letter-adjacency guard)", () => {
  it("swaps standalone digit runs", () => {
    // 1 → 6, 5 stays, 6 → 1, 8 → 3
    expect(encode("1568", m)).toBe("6513");
  });

  it("does NOT swap digits adjacent to letters", () => {
    expect(encode("M15-EN", m)).toBe("M15-EN");
    expect(encode("iPhone15", m)).toBe("iPhone15");
    expect(encode("v3", m)).toBe("v3");
  });

  it("swaps digits separated from letters by spaces", () => {
    // 'year' is in mapping, '2026' has space context so digits swap individually:
    // 2→2 (no map), 0→0 (no map), 2→2 (no map), 6→1.
    const out = encode("year 2026", m);
    expect(out).not.toBe("year 2026"); // something MUST have changed
    expect(out).toContain("2021"); // 2026 → 2021 (only 6 has a mapping)
  });
});

describe("F1 — letter-flanked digits round-trip (alpha)", () => {
  // The alpha font renders a swap-digit swapped with 0/2 letter-neighbours and
  // as-written with exactly 1; the encoder pre-swaps the 0/2 case so these
  // round-trip. (alpha digit map: 0↔5, 3↔8, 4↔9, 6↔7.)
  it("pre-swaps digits flanked by letters on both sides", () => {
    expect(encode("H3O", alpha)).toBe("H8O");
    expect(encode("a3b", alpha)).toBe("a8b");
    expect(encode("C4H10", alpha)).toBe("C9H15");
    expect(encode("he5lo", alpha)).toBe("he0lo");
  });
  it("leaves digits with exactly one letter-neighbour", () => {
    expect(encode("x5", alpha)).toBe("x5");
    expect(encode("mp3", alpha)).toBe("mp3");
    expect(encode("3D", alpha)).toBe("3D");
  });
  it("still permutes standalone digit runs", () => {
    expect(encode("1568", alpha)).toBe("1073");
  });
  it("is an involution (decode reverses)", () => {
    for (const s of ["H3O", "C4H10", "a3b", "x5", "Route66", "1568"]) {
      expect(decode(encode(s, alpha), alpha)).toBe(s);
    }
  });
});

describe("P1 — accented words pass through (Unicode tokenizer + NFC)", () => {
  it("does not split accented words", () => {
    for (const w of ["café", "résumé", "façade", "Zürich", "naïve"]) {
      expect(encode(w, alpha)).toBe(w);
    }
  });
  it("normalises decomposed (NFD) input to NFC", () => {
    expect(encode("café", alpha)).toBe("café".normalize("NFC"));
  });
});

describe("decode is the inverse of encode", () => {
  const samples = [
    "The future of writing belongs to those who write it.",
    "Will this affect my SEO?",
    "Does this work with screen readers?",
    "page's, model's, world's, won't, it's",
    "iPhone15, M15-EN, v3, 1568",
  ];
  for (const sample of samples) {
    it(`round-trips: ${sample.slice(0, 40)}…`, () => {
      const encoded = encode(sample, m);
      const decoded = decode(encoded, m);
      expect(decoded).toBe(sample);
    });
  }
});
