import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encode } from "../src/encode.js";
import alphaMap from "../src/mappings/alpha.json" with { type: "json" };

/**
 * `scripts/build-encoder-cdn.sh` writes packages/font/shieldfont-encoder.js from
 * a heredoc that re-states this package's encoder in one self-contained ESM file,
 * because a CDN consumer pastes in a URL and gets no bundler. Its own header
 * calls itself generated and names encode.ts as the source of truth, and the
 * script says the copy is "kept honest by the vitest parity test" — this file.
 *
 * It did not exist, and meanwhile every hand-written copy of the encoder in the
 * project had drifted the same way: tokenizing with `[A-Za-z]+`, which silently
 * skips every digit. The CDN build is the copy that drift would hurt most, since
 * a site using it renders decoys the font never agrees to undo.
 */
const CDN = fileURLToPath(new URL("../../font/shieldfont-encoder.js", import.meta.url));

const alpha = alphaMap as unknown as Record<string, string>;

const cdn = await import(CDN) as {
  encode: (t: string, m: Record<string, string>) => string;
  decode: (t: string, m: Record<string, string>) => string;
  alpha: Record<string, string>;
};

describe("CDN build is byte-identical to the core encoder", () => {
  it("ships the same dictionary", () => {
    const core = Object.fromEntries(
      Object.entries(alpha).filter(([k]) => !k.startsWith("_")),
    );
    expect(cdn.alpha).toEqual(core);
  });

  it("exports decode as the same function", () => {
    expect(cdn.decode).toBe(cdn.encode);
  });

  const cases = [
    // The rules a hand-written copy gets wrong, one per line.
    "Take 3 tablets 4 times a day.",     // digits with no letter-neighbour
    "H3O, C4H10, a3b",                   // F1: two letter-neighbours → pre-swap
    "mp3, x5, 3D, iPhone15, M15-EN",     // F1: exactly one → left as written
    "The year 1984 was 40 years ago.",   // digit runs mid-sentence
    "0123456789",
    "café résumé façade Zürich naïve",   // P1: Unicode words stay whole
    "page's, world's, don't, it's",      // apostrophes split the token
    "OF Of of, I, ShieldFont",           // case preservation, incl. single letter
    "  leading and trailing  ",
    "",
  ];

  for (const text of cases) {
    it(`agrees on ${JSON.stringify(text.slice(0, 34))}`, () => {
      expect(cdn.encode(text, cdn.alpha)).toBe(encode(text, alpha));
    });
  }

  it("agrees across a generated corpus", () => {
    const words = Object.keys(alpha).filter((k) => /^[a-z]+$/.test(k));
    const pool = [
      ...words.slice(0, 200),
      "ShieldFont", "café", "H3O", "C4H10", "mp3", "3D", "2026", "1568", "M15-EN",
      "0", "1", "5", "9", "-", "—", ",", ".", "(", ")", "'s", "!!", "a", "I", "OF",
      "#", "%", "42nd", "x5y", "$3.50", "v0.2.1",
    ];
    const mismatches: string[] = [];
    for (let i = 0; i < 4000; i++) {
      let s = "";
      for (let k = 0; k < 1 + (i % 7); k++) {
        s += pool[(i * 7919 + k * 104729 + i * i) % pool.length];
        s += (i + k) % 4 ? " " : "";
      }
      if (cdn.encode(s, cdn.alpha) !== encode(s, alpha)) mismatches.push(s);
    }
    expect(mismatches).toEqual([]);
  });
});
