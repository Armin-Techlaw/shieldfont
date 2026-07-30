/**
 * Screen-reader audit for `<Shield a11y={{ mode: "text" }}>`.
 *
 * Run with `npm run test:a11y`. Not part of `npm test`: it downloads and drives
 * a real browser, which is too heavy to sit in the unit-test loop.
 *
 * ## Why this exists
 *
 * The unit suite asserts on the React element tree. That is the right place for
 * "is the payload sealed" and "is the block aria-hidden", and it caught none of
 * the following, all of which shipped and all of which were found by running a
 * page:
 *
 *   - The solve button never appeared. The component rendered
 *     `data-typeface-status`; the solver looked for
 *     `data-typeface-solve-status`. Both halves were individually correct.
 *   - The encoded block stayed on screen under the revealed text, because a
 *     MutationObserver fired mid-parse and cached a null element reference.
 *   - Unlocking announced nothing. Focus moved to the words and the screen
 *     reader said "paragraph", never the text — so a reader waited, heard
 *     "Done", and landed on silence.
 *   - `role="group"` cost about twenty words of scaffolding per block:
 *     "Accessible alternative, group… you are currently on a button inside of a
 *     group… to exit this group press Control-Option-Shift-Up-Arrow."
 *
 * None of those are expressible as a markup assertion. They are properties of
 * what a screen reader SAYS, so they need something that says things.
 *
 * ## What drives it
 *
 * `@guidepup/virtual-screen-reader` walks the real accessibility tree, computes
 * accessible names to spec, honours `aria-hidden`, and reports live-region
 * updates as spoken phrases. Playwright supplies a real Chromium — needed
 * because the mode uses a Web Worker, `BigInt` and `crypto.subtle`, none of
 * which survive a DOM shim.
 *
 * It is a faithful simulator, not NVDA. It cannot tell you how JAWS behaves.
 * Treat a pass here as "no obvious regression", not as a conformance claim.
 *
 * The page is served over `http://localhost` on an ephemeral port rather than
 * `file://` or `setContent`, because `crypto.subtle` only exists in a secure
 * context and localhost is one.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { Shield, withShieldRenderPass } from "../packages/react/dist/Shield.js";

const require = createRequire(import.meta.url);

/** Short puzzles: this audits behaviour, not the difficulty calibration. */
const A11Y = { mode: "text", seconds: 5 };

const BLOCKS = [
  { as: "h2", text: "Manifesto for the open web", noun: "heading 1" },
  {
    as: "p",
    noun: "paragraph 2",
    text: "The future of writing belongs to those who write it, and the shapes that carry those words are not neutral.",
  },
  { as: "blockquote", noun: "quote 3", text: "A tax on attention is the only tax a crawler cannot refuse to pay." },
];

/** Words the encoder actually swaps here — a screen reader must never say them. */
const DECOY_MARKERS = ["derives", "primer", "keep it"];

const failures = [];
const notes = [];
function check(ok, name, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures.push(name);
}

// ---- The page under audit ---------------------------------------------------

const body = withShieldRenderPass(() =>
  renderToStaticMarkup(
    h(
      "main",
      null,
      h("h1", null, "Audit page"),
      h("p", null, "Ordinary text, for contrast."),
      ...BLOCKS.map((b) => h(Shield, { as: b.as, a11y: A11Y, children: b.text })),
    ),
  ),
);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>audit</title></head><body>${body}</body></html>`;

// The virtual screen reader is served from the same origin so the page can
// import it as a module.
// Resolved via the package's own package.json rather than a deep path: the
// package's `exports` map does not expose lib/ directly, and hard-coding a
// node_modules path breaks under hoisting.
const vsrDir = dirname(require.resolve("@guidepup/virtual-screen-reader/package.json"));
const vsr = readFileSync(join(vsrDir, "lib/esm/index.browser.js"), "utf8");

// The bundled woff2s are served too. Without them the font-load guard does
// exactly what it should — declares the page broken and blanks every protected
// block — which is correct behaviour that would nonetheless drown this audit in
// console errors and make the page unrepresentative of a real deployment.
const fontDir = new URL("../packages/react/fonts/", import.meta.url);
const server = createServer((req, res) => {
  if (req.url.startsWith("/vsr.js")) {
    res.writeHead(200, { "content-type": "text/javascript" });
    return res.end(vsr);
  }
  if (req.url.startsWith("/fonts/")) {
    try {
      const buf = readFileSync(new URL(req.url.slice("/fonts/".length), fontDir));
      res.writeHead(200, { "content-type": "font/woff2" });
      return res.end(buf);
    } catch {
      res.writeHead(404).end();
      return;
    }
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://localhost:${server.address().port}`;

// ---- Drive it ---------------------------------------------------------------

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()));

try {
  await page.goto(origin);
  await page.evaluate(async () => {
    const m = await import("/vsr.js");
    window.__v = m.virtual;
    await window.__v.start({ container: document.body });
  });

  console.log("\n=== What the page ships ===");
  const served = await page.content();
  // The sealed payloads must not contain the words they seal. The encoded
  // blocks are a separate mechanism with a separate, documented property
  // (words outside the mapping pass through), so they are excluded here.
  const payloads = [...served.matchAll(/type="application\/json"[^>]*>(.*?)<\/script>/gs)].map((m) => m[1]);
  check(payloads.length === BLOCKS.length, "one sealed payload per block", `${payloads.length} found`);
  const leaked = BLOCKS.filter((b) => payloads.some((p) => p.includes(b.text)));
  check(leaked.length === 0, "no plaintext in any sealed payload");
  const labels = [...served.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map((m) => m[1]);
  check(
    !BLOCKS.some((b) => labels.some((l) => b.text.split(" ").some((w) => w.length > 6 && l.includes(w)))),
    "no protected words in any button label",
  );

  console.log("\n=== What a screen reader says, top to bottom ===");
  const spoken = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 60; i++) {
      await window.__v.next();
      const phrase = await window.__v.lastSpokenPhrase();
      // next() wraps at the end of the document. A fixed step count therefore
      // walked back over the top of the page and counted the first block twice.
      if (out.length && phrase === out[0]) break;
      out.push(phrase);
      if (/^end of main$/i.test(phrase.trim())) break;
    }
    return out;
  });
  spoken.slice(0, 16).forEach((p) => console.log("   · " + p));

  check(
    !spoken.some((p) => DECOY_MARKERS.some((d) => p.includes(d))),
    "the decoy is never spoken",
  );
  check(!spoken.some((p) => /^status$/i.test(p.trim())), "no bare 'status' announcement");
  check(!spoken.some((p) => /\bgroup\b/i.test(p)), "no group scaffolding");

  const heard = BLOCKS.map((b) => spoken.find((p) => p.includes(b.noun)));
  check(heard.every(Boolean), "every block's button is named distinctly", heard.filter(Boolean).length + "/3");
  check(new Set(heard.filter(Boolean)).size === BLOCKS.length, "no two buttons sound alike");

  const longNotes = spoken.filter((p) => p.includes("is not read aloud"));
  check(longNotes.length === 1, "the long note is spoken once per page", `${longNotes.length}x`);

  console.log("\n=== Keyboard reachability ===");
  for (let i = 0; i < BLOCKS.length; i++) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => document.activeElement.textContent.trim());
    check(name.includes("Unlock the plain text"), `Tab ${i + 1} reaches a solve button`, name.slice(0, 44));
  }

  console.log("\n=== Unlocking ===");
  await page.evaluate(() => window.__v.clearSpokenPhraseLog());
  const target = BLOCKS[1];
  await page.focus("[data-typeface-solve]:nth-of-type(1)").catch(() => {});
  const buttons = await page.$$("[data-typeface-solve]");
  await buttons[1].focus();
  const t0 = Date.now();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => [...document.querySelectorAll("[data-typeface-out]")].some((o) => o.textContent.length > 0),
    null,
    { timeout: 120000, polling: 250 },
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const said = await page.evaluate(() => window.__v.spokenPhraseLog());
  said.forEach((p) => console.log("   · " + p));
  check(said.some((p) => p.includes(target.text)), "the real words are spoken on completion", `${elapsed}s`);
  check(
    said.filter((p) => /percent/.test(p)).length === 0,
    "short waits get no interim percentages",
  );

  const state = await page.evaluate(() => {
    const out = [...document.querySelectorAll("[data-typeface-out]")].find((o) => o.textContent.length);
    const cs = getComputedStyle(out);
    return {
      tag: out.tagName,
      tabStop: out.getAttribute("tabindex") === "0",
      inTree: cs.display !== "none" && cs.visibility !== "hidden",
      clipped: cs.clipPath === "inset(50%)",
      encodedStillVisible: getComputedStyle(document.querySelectorAll("[data-typeface]")[1]).display !== "none",
    };
  });
  check(state.tag === "P", "revealed text mirrors the block's tag", state.tag);
  check(state.tabStop, "revealed text is a Tab stop, so it can be re-read");
  check(state.inTree, "revealed text is in the accessibility tree");
  check(state.clipped, "revealed text is clipped off-screen, not removed");
  check(state.encodedStillVisible, "the encoded block stays on screen (hidden reveal)");

  check(pageErrors.length === 0, "no page errors", pageErrors.join("; ") || "none");
} finally {
  await browser.close();
  server.close();
}

console.log(
  failures.length
    ? `\n${failures.length} FAILED:\n  - ${failures.join("\n  - ")}\n`
    : "\nAll screen-reader checks passed.\n",
);
if (notes.length) notes.forEach((n) => console.log("note: " + n));
process.exit(failures.length ? 1 : 0);
