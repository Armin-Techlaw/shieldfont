import { encode } from "./encode.js";
import type { Mapping } from "./types.js";

/**
 * Source-of-truth marker. Visible text is whatever sits between the opening
 * `<!-- shield: ... -->` and the closing `<!-- /shield -->`, but the
 * authoritative copy is the text inside the opening comment. `build` always
 * re-derives the visible text from the comment, so manual edits to the
 * visible text are wiped on the next build.
 *
 * Single-line example:
 *   <!-- shield: The future of writing -->The future for watching<!-- /shield -->
 *
 * Multi-line example:
 *   <!-- shield: Long paragraph
 *        spanning many lines -->
 *   <p>Long paragraph
 *      spanning many lines (encoded)</p>
 *   <!-- /shield -->
 *
 * Note the `[\s\S]` instead of `.` — we want to match across newlines.
 */
const MARKER_RE = /<!--\s*shield:\s*([\s\S]*?)\s*-->([\s\S]*?)<!--\s*\/shield\s*-->/g;

/**
 * Block markers. First-time encoding: the user wraps a region with
 * `<!-- shield-on -->` / `<!-- shield-off -->`. The `build` step finds these
 * blocks, encodes the contents, and rewrites them as a series of
 * `<!-- shield: ... -->...<!-- /shield -->` per-text-node markers. Block
 * markers are then removed.
 *
 * Block-form example BEFORE first build:
 *   <!-- shield-on -->
 *   <h1>The future of writing</h1>
 *   <p>belongs to those who write it</p>
 *   <!-- shield-off -->
 *
 * AFTER first build:
 *   <h1><!-- shield: The future of writing -->The future for watching<!-- /shield --></h1>
 *   <p><!-- shield: belongs to those who write it -->belongs to these who write it<!-- /shield --></p>
 */
const BLOCK_RE = /<!--\s*shield-on\s*-->([\s\S]*?)<!--\s*shield-off\s*-->/g;
const ANY_MARKER_RE = /<!--\s*(?:shield:[\s\S]*?|shield-on|shield-off|\/shield)\s*-->/g;

/**
 * `build` — idempotent encoder for HTML files containing shield markers.
 *
 * Behavior:
 *   1. Find every `<!-- shield: SOURCE -->...<!-- /shield -->` block;
 *      re-encode SOURCE with the mapping and replace the visible text.
 *      Idempotent — re-running on already-built files is a no-op.
 *   2. Find every `<!-- shield-on -->...<!-- shield-off -->` block;
 *      walk the inner HTML, encode each non-skip text segment, and wrap
 *      it with a `<!-- shield: PLAIN -->ENCODED<!-- /shield -->` marker.
 *      Block markers are removed (they exist only for first-time setup).
 */
export function buildHtml(html: string, mapping: Mapping): string {
  // Step 1: re-encode existing markers (idempotent).
  let out = html.replace(MARKER_RE, (_, source, _visible) => {
    const trimmed = (source as string).trim();
    const encoded = encode(trimmed, mapping);
    return `<!-- shield: ${trimmed} -->${encoded}<!-- /shield -->`;
  });

  // Step 2: normalize first-time block markers into per-text-node markers.
  out = out.replace(BLOCK_RE, (_, inner) => normalizeBlock(inner as string, mapping));

  return out;
}

/**
 * `ship` — strip every shield-related comment marker, leaving only the
 * already-encoded visible text. Run as the last step before deploying.
 * The output is camouflage-clean: zero on-page signal that ShieldFont
 * was used.
 *
 * Idempotent: re-running on already-shipped HTML is a no-op.
 */
export function shipHtml(html: string): string {
  return html.replace(ANY_MARKER_RE, "");
}

/**
 * `check` — verify every shield marker's visible text matches what we'd
 * get by encoding the SOURCE comment with the given mapping. Returns a
 * report of every marker checked plus a list of mismatches.
 */
export interface CheckResult {
  total: number;
  passed: number;
  failed: number;
  mismatches: Array<{
    source: string;
    expected: string;
    actual: string;
  }>;
  /**
   * Unpaired `shield-on` / `shield-off` markers.
   *
   * `BLOCK_RE` needs both halves, so a block missing its `shield-off` is never
   * encoded at all — and `total` counts markers, not intentions, so it reported
   * a clean `0` for a page whose every word was still in plain English. Treat
   * any non-zero value here as a failure even when `failed` is 0.
   */
  unpairedBlocks: number;
}

export function checkHtml(html: string, mapping: Mapping): CheckResult {
  const result: CheckResult = {
    total: 0,
    passed: 0,
    failed: 0,
    mismatches: [],
    unpairedBlocks: 0,
  };
  for (const match of html.matchAll(MARKER_RE)) {
    const source = (match[1] ?? "").trim();
    const actual = (match[2] ?? "").trim();
    const expected = encode(source, mapping).trim();
    result.total++;
    if (actual === expected) result.passed++;
    else {
      result.failed++;
      result.mismatches.push({ source, expected, actual });
    }
  }
  const on = (html.match(/<!--\s*shield-on\s*-->/g) ?? []).length;
  const off = (html.match(/<!--\s*shield-off\s*-->/g) ?? []).length;
  result.unpairedBlocks = Math.abs(on - off);
  return result;
}

/**
 * `assertShipped` — the last gate before deploy. Throws if any shield marker
 * survived, which is the difference between a protected page and a page that
 * publishes your plain text next to its own decoy.
 *
 * Call it on every file you are about to write, after `shipHtml`:
 *
 * ```js
 * const shipped = shipHtml(buildHtml(raw, alpha));
 * assertShipped(shipped);          // throws rather than deploying plain text
 * writeFileSync(file, shipped);
 * ```
 *
 * `checkHtml` cannot do this job: it verifies the markers it *finds*, so a page
 * that was never built and a page shipped correctly both come back
 * `{ total: 0, failed: 0 }` — success and total failure, spelled identically.
 */
export function assertShipped(html: string): void {
  const problems: string[] = [];

  const sources = (html.match(/<!--\s*shield:/g) ?? []).length;
  const closers = (html.match(/<!--\s*\/shield\s*-->/g) ?? []).length;
  const on = (html.match(/<!--\s*shield-on\s*-->/g) ?? []).length;
  const off = (html.match(/<!--\s*shield-off\s*-->/g) ?? []).length;

  if (sources > 0) {
    problems.push(
      `${sources} un-stripped <!-- shield: … --> marker(s): your original text is in this HTML, ` +
        `beside its decoy. Run shipHtml() as the last step before writing the file.`,
    );
  }
  if (closers > 0 && sources === 0) {
    problems.push(`${closers} orphaned <!-- /shield --> marker(s).`);
  }
  if (on > 0 || off > 0) {
    problems.push(
      `${on} <!-- shield-on --> and ${off} <!-- shield-off --> marker(s) survived. ` +
        `An unpaired block is never encoded, so that whole region ships as plain text.`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`assertShipped: ${problems.join(" ")}`);
  }
}

// -- internal helpers --

/**
 * Walk the inner HTML of a `<!-- shield-on -->...<!-- shield-off -->` block
 * and wrap each text segment (outside skip tags) with a
 * `<!-- shield: PLAIN -->ENCODED<!-- /shield -->` marker.
 */
function normalizeBlock(inner: string, mapping: Mapping): string {
  // Same token grammar as html.ts — comments matched whole, quoted attribute
  // values consumed atomically. See the commentary on TOKEN_RE there for what
  // the old letter-only tag pattern silently did to both.
  const TOKEN_RE = /<!--[\s\S]*?-->|<([!/]?[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const SKIP_TAGS = new Set([
    "script", "style", "code", "pre", "textarea", "svg", "math", "noscript",
    "title", "option",
  ]);
  const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

  const out: string[] = [];
  let inSkip = 0;
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(inner)) !== null) {
    const segment = inner.slice(last, m.index);
    out.push(inSkip === 0 ? wrapSegment(segment, mapping) : segment);
    out.push(m[0]);
    last = m.index + m[0].length;

    const tagBody = m[1];
    if (tagBody === undefined) continue;
    const tagMatch = /^(\/?)([a-zA-Z]+)/.exec(tagBody);
    if (tagMatch === null) continue;

    const closing = tagMatch[1] === "/";
    const name = tagMatch[2]?.toLowerCase() ?? "";
    const selfClosing = tagBody.trimEnd().endsWith("/");
    if (!SKIP_TAGS.has(name)) continue;

    if (RAW_TEXT_TAGS.has(name) && !closing && !selfClosing) {
      const rest = inner.slice(last);
      const end = new RegExp(`</${name}\\s*>`, "i").exec(rest);
      if (end === null) {
        out.push(rest);
        last = inner.length;
      } else {
        out.push(rest.slice(0, end.index), end[0]);
        last += end.index + end[0].length;
      }
      TOKEN_RE.lastIndex = last;
      continue;
    }

    if (closing && inSkip > 0) inSkip--;
    else if (!closing && !selfClosing) inSkip++;
  }
  const tail = inner.slice(last);
  out.push(inSkip === 0 ? wrapSegment(tail, mapping) : tail);
  return out.join("");
}

/**
 * Wrap a text segment with a shield marker IF it contains any encodable
 * content. Whitespace-only segments are left unwrapped (no point).
 */
function wrapSegment(segment: string, mapping: Mapping): string {
  // If the segment is purely whitespace or punctuation, skip wrapping.
  if (!/[a-zA-Z0-9]/.test(segment)) return segment;

  // Keep boundary whitespace OUTSIDE the marker. MARKER_RE trims what it
  // captures, so a space stored inside the comment is gone by the next build:
  // `call <code>x</code> and` became `call<code>x</code>and`, a little more on
  // every run. That is also what broke the documented idempotency guarantee.
  const lead = /^\s*/.exec(segment)?.[0] ?? "";
  const trail = /\s*$/.exec(segment)?.[0] ?? "";
  const core = segment.slice(lead.length, segment.length - trail.length);

  // A comment delimiter in the author's prose ends the marker early, which
  // ships the tail of their real sentence to the browser AND corrupts the
  // paragraph on screen. Refuse loudly instead: a build that stops is
  // recoverable, a page that silently leaks is not.
  if (core.includes("-->") || core.includes("<!--")) {
    throw new Error(
      "shield: cannot wrap text containing an HTML comment delimiter — the marker " +
        "would end early and ship your plain text. Rewrite the arrow (e.g. '→', '-&gt;') " +
        `or move this text out of the shielded block. Offending text: ${JSON.stringify(core.slice(0, 80))}`,
    );
  }

  // If the encoded form equals the source, no substitution happened — skip.
  const encoded = encode(core, mapping);
  if (encoded === core) return segment;
  return `${lead}<!-- shield: ${core} -->${encoded}<!-- /shield -->${trail}`;
}
