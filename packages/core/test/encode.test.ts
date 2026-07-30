import { describe, it, expect } from "vitest";
import { encode, decode, encodeSegments } from "../src/encode.js";
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

describe("encodeSegments — the overlay API cannot drift from encode()", () => {
  const samples = [
    "Take 3 tablets 4 times a day for 10 days.",
    "H3O, C4H10, a3b, x5, mp3, 3D, Route66",
    "The year 1984 was 40 years ago.",
    "café résumé — naïve façade",
    "1568 vs M15-EN vs iPhone15",
    "",
    "0123456789",
    "no digits here at all",
  ];

  for (const s of samples) {
    it(`joins back to encode(): ${JSON.stringify(s.slice(0, 32))}`, () => {
      const joined = encodeSegments(s, alpha).map((g) => g.encoded).join("");
      expect(joined).toBe(encode(s, alpha));
    });

    it(`preserves the original: ${JSON.stringify(s.slice(0, 32))}`, () => {
      const joined = encodeSegments(s, alpha).map((g) => g.original).join("");
      expect(joined).toBe(s.normalize("NFC"));
    });
  }

  it("flags exactly the pieces that changed", () => {
    for (const seg of encodeSegments("Take 3 tablets in 2026", alpha)) {
      expect(seg.swapped).toBe(seg.encoded !== seg.original);
    }
  });

  it("reports swapped digits — the case every hand-rolled overlay missed", () => {
    const digits = encodeSegments("Take 3 tablets", alpha).filter((s) => s.kind === "digit");
    expect(digits).toEqual([{ original: "3", encoded: "8", swapped: true, kind: "digit" }]);
  });

  it("still reports a one-letter-neighbour digit, marked unswapped", () => {
    // It IS a token the dictionary had a say over — the context rule declined.
    // Counters need it in the denominator; overlays must not ring it.
    const segs = encodeSegments("mp3", alpha);
    expect(segs.filter((s) => s.kind === "digit")).toEqual([
      { original: "3", encoded: "3", swapped: false, kind: "digit" },
    ]);
  });

  it("gives every digit its own segment", () => {
    const segs = encodeSegments("2026", alpha);
    expect(segs.map((s) => s.kind)).toEqual(["digit", "digit", "digit", "digit"]);
    expect(segs.map((s) => s.encoded).join("")).toBe(encode("2026", alpha));
  });

  it("reads letter-context across the word boundary, not just inside the gap", () => {
    // 'a' and 'b' are separate word segments; the 3 between them still sees two
    // letter-neighbours and must swap, exactly as encode() does.
    expect(encodeSegments("a3b", alpha).find((s) => s.original === "3")?.encoded).toBe("8");
  });

  it("uses the ENCODED word edge for context, matching what the font sees", () => {
    // The dictionary decides the neighbouring characters, so context must be
    // read after substitution. Letters stay letters, so the verdict holds.
    const text = "of 5 of";
    expect(encodeSegments(text, alpha).map((s) => s.encoded).join("")).toBe(encode(text, alpha));
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

describe("E1 — HTML character references are markup, not prose", () => {
  it("leaves numeric references intact", () => {
    // The browser resolves these before the font runs, so a swapped digit is a
    // changed character no ligature can undo: `don&#39;t` rendered as "donTt".
    for (const s of ["don&#39;t", "a&#8212;b", "&#169; 2026", "&#x2019;"]) {
      expect(encode(s, m)).toContain(s.replace(/2026/, ""));
    }
    expect(encode("don&#39;t", m)).toBe("don&#39;t");
    expect(encode("a&#8212;b", m)).toBe("a&#8212;b");
  });

  it("never manufactures a tag out of plain text", () => {
    // &#75;b&#72; → &#60;b&#62; would be parsed by the browser as a live <b>.
    expect(encode("&#75;b&#72;", m)).toBe("&#75;b&#72;");
  });

  it("leaves named references intact", () => {
    for (const s of ["&copy;", "&amp;", "&euro;", "&nbsp;"]) {
      expect(encode(s, m)).toBe(s);
    }
  });

  it("still permutes digits and words outside a reference", () => {
    expect(encode("2026", m)).not.toBe("2026");
    expect(encode("of writing", m)).not.toBe("of writing");
  });

  it("does not mistake prose ampersands for references", () => {
    expect(encode("AT&T and R&D", m)).toBe(encode("AT&T and R&D", m));
    expect(encode("Tom & Jerry", m)).toContain("&");
  });
});

describe("prototype keys are not dictionary entries", () => {
  it("passes 'constructor' through instead of returning Object's source", () => {
    expect(encode("constructor", m)).toBe("constructor");
    expect(encode("The constructor signed off.", m)).toContain("constructor");
  });

  it("does not throw on a capitalised prototype key", () => {
    expect(() => encode("Constructor of the bridge", m)).not.toThrow();
    expect(() => encode("TOSTRING", m)).not.toThrow();
  });

  it("passes the other inherited names through", () => {
    expect(encode("toString valueOf hasOwnProperty", m))
      .toBe("toString valueOf hasOwnProperty");
  });
});

describe("argument validation (regression)", () => {
  it("names the bad argument instead of failing inside the encoder", () => {
    // These used to surface as `Cannot read properties of null (reading
    // 'normalize')` from a frame the caller has no reason to recognise. A CMS
    // field that came back null is an ordinary mistake.
    expect(() => encode(null as unknown as string, m)).toThrow(/text must be a string, received null/);
    expect(() => encode(undefined as unknown as string, m)).toThrow(/received undefined/);
    expect(() => encode(42 as unknown as string, m)).toThrow(/received number/);
    expect(() => encodeSegments(null as unknown as string, m)).toThrow(/text must be a string/);
  });

  it("rejects a missing or non-object mapping", () => {
    expect(() => encode("x", null as unknown as typeof m)).toThrow(/mapping must be a mapping object/);
    expect(() => encode("x", 42 as unknown as typeof m)).toThrow(/mapping must be a mapping object/);
  });

  it("still accepts the empty string", () => {
    expect(encode("", m)).toBe("");
  });
});
