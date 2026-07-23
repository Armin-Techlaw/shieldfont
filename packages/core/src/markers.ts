import { encode, decode } from "./encode.js";
import { encodeHtml } from "./html.js";
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
}

export function checkHtml(html: string, mapping: Mapping): CheckResult {
  const result: CheckResult = { total: 0, passed: 0, failed: 0, mismatches: [] };
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
  return result;
}

// -- internal helpers --

/**
 * Walk the inner HTML of a `<!-- shield-on -->...<!-- shield-off -->` block
 * and wrap each text segment (outside skip tags) with a
 * `<!-- shield: PLAIN -->ENCODED<!-- /shield -->` marker.
 */
function normalizeBlock(inner: string, mapping: Mapping): string {
  const TAG_RE = /<([!/]?[a-zA-Z][^>]*?)>/gs;
  const SKIP_TAGS = new Set([
    "script", "style", "code", "pre", "textarea", "svg", "math", "noscript",
  ]);

  const out: string[] = [];
  let inSkip = 0;
  let last = 0;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(inner)) !== null) {
    const segment = inner.slice(last, m.index);
    out.push(inSkip === 0 ? wrapSegment(segment, mapping) : segment);
    out.push(m[0]);
    const tagBody = m[1] ?? "";
    const tagMatch = /^(\/?)([a-zA-Z]+)/.exec(tagBody);
    if (tagMatch) {
      const closing = tagMatch[1] === "/";
      const name = tagMatch[2]?.toLowerCase() ?? "";
      if (SKIP_TAGS.has(name)) {
        if (closing && inSkip > 0) inSkip--;
        else if (!closing && !tagBody.trimEnd().endsWith("/")) inSkip++;
      }
    }
    last = m.index + m[0].length;
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
  // If the encoded form equals the source, no substitution happened — skip.
  const encoded = encode(segment, mapping);
  if (encoded === segment) return segment;
  return `<!-- shield: ${segment.trim()} -->${encoded}<!-- /shield -->`;
}
