import { encode } from "./encode.js";
import type { Mapping } from "./types.js";

/**
 * Tags whose contents are NEVER encoded. Anything inside these is treated
 * as raw — code samples, scripts, styles, embedded SVG/MathML.
 */
const SKIP_TAGS = new Set([
  "script",
  "style",
  "code",
  "pre",
  "textarea",
  "svg",
  "math",
  "noscript",
]);

/**
 * Match a single HTML tag. The `[!/]?` allows `<!doctype>`, `<!-- -->` and
 * `</closing>` tags. Body matches lazily up to the first `>`.
 */
const TAG_RE = /<([!/]?[a-zA-Z][^>]*?)>/gs;

/**
 * Encode all visible text in an HTML document. Skips:
 *   - Anything inside SKIP_TAGS (script/style/code/pre/textarea/svg/math/noscript).
 *   - HTML attribute values (preserved by virtue of only encoding text segments
 *     between tags, never the tag interior).
 *   - HTML comments (the `<!-- ... -->` syntax matches as a "tag" so its
 *     contents are not in a text segment).
 *
 * Tag structure is preserved exactly.
 */
export function encodeHtml(html: string, mapping: Mapping): string {
  const out: string[] = [];
  let inSkip = 0;
  let last = 0;

  // Reset regex state on each call (TAG_RE is a module-level RegExp with /g).
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(html)) !== null) {
    const segment = html.slice(last, match.index);
    out.push(inSkip === 0 ? encode(segment, mapping) : segment);
    out.push(match[0]);

    // Track skip-tag depth.
    const tagBody = match[1] ?? "";
    const tagMatch = /^(\/?)([a-zA-Z]+)/.exec(tagBody);
    if (tagMatch) {
      const closing = tagMatch[1] === "/";
      const name = tagMatch[2]?.toLowerCase() ?? "";
      if (SKIP_TAGS.has(name)) {
        if (closing && inSkip > 0) inSkip--;
        else if (!closing && !tagBody.trimEnd().endsWith("/")) inSkip++;
      }
    }
    last = match.index + match[0].length;
  }

  const tail = html.slice(last);
  out.push(inSkip === 0 ? encode(tail, mapping) : tail);
  return out.join("");
}

/**
 * Decode an HTML document. Same operation as encode (mapping is bidirectional)
 * but exposed separately for call-site clarity.
 */
export function decodeHtml(html: string, mapping: Mapping): string {
  return encodeHtml(html, mapping);
}
