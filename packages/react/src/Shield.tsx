import { encode, alpha, beta, gamma, m15en } from "@shieldfont/core";
import {
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * The three shipped variants. Each identifies BOTH the encoding mapping AND
 * the font file used at render time. alpha/beta/gamma are independent re-seeds
 * of the v18 pool — rotating them per-page/per-region makes large-scale
 * fingerprinting harder for adversarial scrapers.
 */
export type ShieldVariant = "alpha" | "beta" | "gamma" | "maxhide";

/**
 * Props for the <Shield> server component.
 */
export interface ShieldProps {
  /**
   * The HTML element to render. Defaults to `"div"` because most protected
   * regions are block-level paragraphs/headings/quotes; explicitly set
   * `as="span"` for inline use.
   */
  as?: ElementType;

  /**
   * Pin the encoding/font variant. Leave UNSET (default) to AUTO-ROTATE across
   * `"alpha"`/`"beta"`/`"gamma"` by content hash — a site then uses all three
   * mappings, so no single mapping dominates (harder for scrapers to learn).
   * Pin `"alpha" | "beta" | "gamma"` for a fixed one, or `"maxhide"` for the
   * M15 maximum-coverage dictionary (encodes a higher share of common words).
   *
   * Note: mixing variants on one page loads one font per variant used
   * (~1 MB each). Pin a single variant if you want just one font per page.
   */
  variant?: ShieldVariant;

  /** Font weight (variable axis on the bundled ShieldFont base). 100..900. */
  weight?: number;

  /** Line-height passthrough. */
  lineHeight?: number | string;

  /** Font-size passthrough. */
  size?: string;

  /** className escape hatch — merges with the internal scope class. */
  className?: string;

  /** style escape hatch — merges with the internal font-family scope. */
  style?: CSSProperties;

  /**
   * The content to encode.
   *
   * Two modes, decided by `as`:
   *
   * 1. **Text mode (default)** — `as` is unset or one of the leaf text
   *    elements (div / p / span / blockquote / h1–h6). `children` MUST
   *    be a plain string. The string is encoded and rendered.
   *
   * 2. **Container mode** — `as="article"` (or `section`, `main`, `aside`).
   *    `children` may be a tree of JSX. Shield recursively walks built-in
   *    HTML elements (anything where `typeof element.type === "string"`)
   *    and encodes their text. Custom React components are opaque and pass
   *    through unchanged — wrap them in their own <Shield> if you want
   *    their content protected.
   */
  children: ReactNode;
}

/**
 * Tags that switch <Shield> into container mode (recursive descend).
 * Any other `as` value treats children as a single text string.
 */
const CONTAINER_TAGS = new Set(["article", "section", "main", "aside", "blockquote"]);

// Each variant maps to its own injective mapping AND its own font file.
// alpha/beta/gamma are independent re-seeds of the v18 pool (the auto-rotation
// pool); `maxhide` is the M15 maximum-coverage dictionary (opt-in only, still
// backed by the m15en mapping exported from @shieldfont/core).
const MAPPINGS: Record<ShieldVariant, Record<string, string>> = {
  alpha: alpha as Record<string, string>,
  beta: beta as Record<string, string>,
  gamma: gamma as Record<string, string>,
  maxhide: m15en as Record<string, string>,
};

// The DEFAULT injected font-family per variant. NEUTRAL by design: the React
// package is the "fully hidden" surface, so nothing it writes into the SSR HTML
// says "ShieldFont". These match the react-tier woff2's neutral name table
// ("Optik"). The BRANDED names ("ShieldFont Optik" / "ShieldFont MaxHide") live
// only in the download-tier font name tables (public site .ttf / MS Word) and
// in packages/font's paste-in CDN CSS — never here. Override per project with
// setCamouflage({ familyName }) — see setCamouflage() below.
const FONT_FAMILY: Record<ShieldVariant, string> = {
  alpha: "Optik",
  beta: "Optik Beta",
  gamma: "Optik Gamma",
  maxhide: "Optik Max",
};

const FONT_FILE: Record<ShieldVariant, string> = {
  alpha: "optik-a",
  beta: "optik-b",
  gamma: "optik-c",
  maxhide: "optik-m",
};

/**
 * Camouflage state — every SSR-visible fingerprint can be overridden by
 * the host project via setCamouflage(). The defaults below are the
 * branded values and remain unchanged for projects that don't call
 * setCamouflage at all (backward-compatible).
 *
 * Why this exists: every page rendered with the default branded values
 * carries the same recognizable fingerprints (`data-typeface`,
 * `font-family: 'Optik'`, `optik-a.woff2`,
 * `__shieldfont_guard__`, console.error('[shieldfont] ...'). A scraper that
 * indexes one ShieldFont-protected page knows what to look for on every
 * other one. Per-project hash camouflage breaks that pattern — each project
 * picks its own 4-char hash at setup time and bakes it into every literal,
 * so two projects' source HTML have no shared signature.
 *
 * Pick any random 4-8 char hash and call setCamouflage({ hash }) once in your
 * root layout — every SSR-visible literal derives from it, so two projects share
 * no signature.
 */
interface CamouflageState {
  /** Font-family per variant. */
  family: Record<ShieldVariant, string>;
  /** Font filename prefix per variant (no extension). */
  file: Record<ShieldVariant, string>;
  /** Data attribute name on the rendered <Tag>. */
  attrName: string;
  /** Window-level idempotency flag name for the guard script. */
  guardFlag: string;
  /** Console message prefix for guard errors/warnings. */
  logPrefix: string;
}

const camo: CamouflageState = {
  family: { ...FONT_FAMILY },
  file: { ...FONT_FILE },
  // NEUTRAL default: nothing in the SSR-visible DOM says "shield". The data
  // attribute stamped on every rendered element is a generic-looking
  // "data-typeface"; setCamouflage({ hash }) further randomises it per project
  // to "data-typeface-<hash>".
  attrName: "data-typeface",
  guardFlag: "__tf_guard__",
  logPrefix: "[typeface]",
};

/**
 * Options for setCamouflage. All fields optional.
 *
 * Passing `{ hash }` alone is the recommended path — every other field
 * gets a deterministic, generic-sounding default derived from the hash:
 *
 *   hash: "a8f3" =>
 *     family:    "Optik a8f3"
 *     file:      "font-a8f3" + variant suffix
 *     attrName:  "data-typeface-a8f3"  (still per-project unique, but
 *                                       indistinguishable from a normal
 *                                       BEM/utility data attr in HTML)
 *     guardFlag: "__fg_a8f3__"
 *     logPrefix: "[typeface a8f3]"
 *
 * Override any individual field if you want a different name.
 */
export interface CamouflageOptions {
  /** 4-8 character random token. Pick any hex-ish string; it just needs to be unique per project. */
  hash?: string;
  /** Override the public font-family literal. Per variant or global. */
  familyName?: string | Partial<Record<ShieldVariant, string>>;
  /** Override the font filename prefix. Per variant or global. */
  filePrefix?: string | Partial<Record<ShieldVariant, string>>;
  /** Override the data attribute name placed on every Shield-rendered element. */
  attrName?: string;
  /** Override the window-level idempotency flag for the guard script. */
  guardFlag?: string;
  /** Override the console.error/warn prefix used by the guard script. */
  logPrefix?: string;
}

/**
 * Apply camouflage to every SSR-visible literal. Call once at module load
 * time — from a one-line import in your root layout.
 *
 * @example
 *   // app/layout.tsx — pick any random 4-8 char hash
 *   import { setCamouflage } from "@shieldfont/react";
 *   setCamouflage({ hash: "a8f3" });
 *
 * @example  Per-key override (advanced):
 *   setCamouflage({
 *     hash: "a8f3",
 *     familyName: "Mercury Display",
 *     attrName: "data-body",
 *   });
 */
export function setCamouflage(opts: CamouflageOptions): void {
  const hash = (opts.hash ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();

  if (hash) {
    const variants: ShieldVariant[] = ["alpha", "beta", "gamma", "maxhide"];
    for (const v of variants) {
      // Default family from hash: short, generic-sounding, still unique per project.
      camo.family[v] = `Optik ${hash}${v === "alpha" ? "" : " " + v[0].toUpperCase() + v.slice(1)}`;
      camo.file[v] = `font-${hash}${v === "alpha" ? "" : "-" + v}`;
    }
    camo.attrName = `data-typeface-${hash}`;
    camo.guardFlag = `__fg_${hash}__`;
    camo.logPrefix = `[typeface ${hash}]`;
  }

  // Apply explicit overrides on top.
  if (opts.familyName !== undefined) {
    if (typeof opts.familyName === "string") {
      camo.family.alpha = camo.family.beta = camo.family.gamma = camo.family.maxhide =
        opts.familyName;
    } else {
      Object.assign(camo.family, opts.familyName);
    }
  }
  if (opts.filePrefix !== undefined) {
    if (typeof opts.filePrefix === "string") {
      camo.file.alpha = camo.file.beta = camo.file.gamma = camo.file.maxhide = opts.filePrefix;
    } else {
      Object.assign(camo.file, opts.filePrefix);
    }
  }
  if (opts.attrName) camo.attrName = opts.attrName;
  if (opts.guardFlag) camo.guardFlag = opts.guardFlag;
  if (opts.logPrefix) camo.logPrefix = opts.logPrefix;
}

/**
 * Tracks which variants we've already declared @font-face for in the
 * current SSR pass, so we only emit each <style> once per page render.
 *
 * Note: this is per-process state, fine for SSR where each request gets
 * its own module instance in Node, but resets between requests via
 * React's RSC streaming model. The first <Shield variant="alpha"> on a
 * page emits the @font-face; subsequent ones reuse it.
 */
const declaredVariants = new WeakSet<object>();

/**
 * Where the @font-face URLs point. SELF-HOSTED ONLY by design.
 *
 * The React component does NOT ship a default CDN. Reason: a typography-based
 * scraping defense MUST fail loudly, never silently. If the font cannot
 * load — bad URL, network failure, deleted CDN release — readers would
 * otherwise see the encoded gibberish on screen, with no clear signal that
 * anything is wrong. That is the worst possible outcome for a privacy tool.
 *
 * Self-hosting fixes this:
 *   1. The font ships with your build, never disappears.
 *   2. If it ever does fail to load, the bundled font-load guard (below)
 *      detects it within a few seconds and visibly replaces every
 *      protected element with "Content unavailable" — never with the
 *      raw decoy text.
 *
 * Setup (one time, in your app's `public/` directory or equivalent):
 *
 *   cp node_modules/@shieldfont/react/fonts/*.woff2 public/fonts/
 *
 * These woff2 files ship inside THIS package on purpose — their name tables are
 * version-neutral ("Version 1.0"), so the served bytes reveal no dictionary
 * version. The React tier bundles its own copy rather than reusing
 * @shieldfont/font, whose fonts embed the dictionary version (`Version 18.0`) as
 * the CDN tier's deliberate pairing tell. Keeping them separate is what makes the
 * React surface fully hidden.
 *
 * Default `fontHost` is `/fonts`, which assumes the copy step above. Override
 * with `setFontHost('/your-path')` if you serve them somewhere else.
 */
const DEFAULT_HOST = "/fonts";
let fontHost = DEFAULT_HOST;

/**
 * Point Shield at a different self-hosted location.
 *
 * @example
 *   setFontHost("/fonts");                  // default — public/fonts/
 *   setFontHost("/static/shieldfont");      // a different subdirectory
 *   setFontHost("https://cdn.your-org.com/shieldfont"); // your OWN CDN, not jsDelivr
 *
 * Do NOT pass a public CDN URL you don't control — the package deliberately
 * removed its default CDN to prevent silent breakage in production.
 */
export function setFontHost(url: string): void {
  fontHost = url.replace(/\/+$/, ""); // strip trailing slashes
}

/**
 * Build the @font-face CSS for a given variant. Lives in a <style> tag
 * inserted into the JSX; React de-dupes identical <style> nodes in the
 * SSR output.
 */
function fontFaceCss(variant: ShieldVariant): string {
  const file = camo.file[variant];
  const family = camo.family[variant];
  // woff2 only — universally supported and keeps the bundled package small
  // (~1 MB/variant vs ~5 MB for the TTF).
  //
  // font-display:block (NOT swap): with swap the browser paints the encoded
  // decoy text in a fallback font first, so readers see gibberish until the
  // ShieldFont face loads (FOUT). block keeps the text invisible during the
  // short block period, matching the CDN path — no gibberish flash. The 4s
  // font-load guard below covers the case where the face never loads.
  return `@font-face{font-family:'${family}';src:url('${fontHost}/${file}.woff2') format('woff2');font-weight:1 999;font-style:normal;font-display:block;}`;
}

/**
 * The font-load guard. Inlined into the page so it runs the moment the
 * browser parses it, with no React hydration dependency.
 *
 * Watches `document.fonts` for the ShieldFont family. If the font does not
 * register and load within 4 seconds, it visibly replaces every element
 * carrying `[data-typeface]` (the default camo attr) with a "Content
 * unavailable" message and
 * logs a clear console error pointing at the configured fontHost.
 *
 * This is the difference between "silently leaking your decoys to readers"
 * and "obviously broken in a way that the page owner notices on day one."
 *
 * Idempotent — guarded by a window-level flag so multiple Shield instances
 * on the same page only set up the watcher once.
 */
function fontGuardScript(family: string, host: string): string {
  const flag = camo.guardFlag;
  const attr = camo.attrName;
  const failedAttr = `${attr}-failed`;
  const prefix = camo.logPrefix;
  return `(function(){
if (typeof window === 'undefined' || window[${JSON.stringify(flag)}]) return;
window[${JSON.stringify(flag)}] = true;
var FAMILY = ${JSON.stringify(family)};
var HOST   = ${JSON.stringify(host)};
var ATTR   = ${JSON.stringify(attr)};
var FAILED = ${JSON.stringify(failedAttr)};
var PFX    = ${JSON.stringify(prefix)};
var TIMEOUT_MS = 4000;
var FALLBACK = 'Content unavailable — the font failed to load.';
var done = false;
function fail(reason){
  if (done) return; done = true;
  console.error(
    PFX + ' Font "' + FAMILY + '" failed to load (' + reason + '). ' +
    'Replacing every [' + ATTR + '] element with a fallback message. ' +
    'Verify the font is reachable at ' + HOST + '/.'
  );
  var els = document.querySelectorAll('[' + ATTR + ']');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    el.setAttribute('aria-label', FALLBACK);
    el.setAttribute(FAILED, '1');
    el.textContent = FALLBACK;
    el.style.fontFamily = 'system-ui, sans-serif';
    el.style.fontStyle = 'italic';
    el.style.opacity = '0.65';
  }
}
/* On font load success, walk every Shield element's descendants and warn if
   any descendant is rendering with a font-family that DOES NOT include our
   family. Such descendants will display the encoded gibberish on screen
   because the override font has no GSUB ligature table to reverse it. */
function checkDescendants(){
  var roots = document.querySelectorAll('[' + ATTR + ']:not([' + FAILED + '])');
  var warnings = 0;
  for (var i = 0; i < roots.length; i++) {
    var root = roots[i];
    var all = root.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      var hasText = false;
      for (var k = 0; k < el.childNodes.length; k++) {
        if (el.childNodes[k].nodeType === 3 && el.childNodes[k].textContent.trim()) {
          hasText = true; break;
        }
      }
      if (!hasText) continue;
      var family = window.getComputedStyle(el).fontFamily || '';
      if (family.indexOf(FAMILY) === -1 && warnings < 5) {
        console.warn(
          PFX + ' <' + el.tagName.toLowerCase() + '> inside protected region uses ' +
          'font-family "' + family + '" instead of "' + FAMILY + '". ' +
          'Its text will render as encoded gibberish (no ligature table). ' +
          'Either remove the override, or move the element outside the protected region.'
        );
        warnings++;
      }
    }
  }
  if (warnings >= 5) console.warn(PFX + ' ' + warnings + '+ font-family overrides found in protected regions; only first 5 logged.');
}
function pass(){
  if (done) return; done = true;
  setTimeout(checkDescendants, 50);
}
if (!document.fonts || !document.fonts.load) {
  fail('document.fonts API not supported');
  return;
}
document.fonts.load('1em "' + FAMILY + '"').then(function(faces){
  if (faces && faces.length > 0) pass();
  else fail('font face not registered');
}).catch(function(e){ fail(String(e && e.message || e)); });
setTimeout(function(){ if (!done) fail('timeout after ' + TIMEOUT_MS + 'ms'); }, TIMEOUT_MS);
})();`;
}

/**
 * Recursively walk a React tree and encode text inside built-in HTML
 * elements. Used by Shield's "container mode" (when `as` is article/section/etc).
 *
 * Behavior:
 *  - Strings are encoded with the given mapping
 *  - Arrays are mapped recursively
 *  - HTML elements (typeof element.type === "string") get their children walked
 *    and re-rendered via cloneElement. The element type itself is preserved.
 *  - Custom React components (functions, classes, lazy, forwardRef) pass through
 *    unchanged. We can't see inside them at server-construction time. Users who
 *    want their children encoded should wrap them in <Shield> separately.
 *  - Numbers / booleans / null / undefined pass through.
 */
function walkAndEncode(node: ReactNode, mapping: Record<string, string>): ReactNode {
  if (node == null || typeof node === "boolean") return node;
  if (typeof node === "number") return node;
  if (typeof node === "string") return encode(node, mapping);
  if (Array.isArray(node)) {
    return node.map((child, i) => {
      const walked = walkAndEncode(child, mapping);
      // If the child is a React element it has its own key handling; otherwise
      // we wrap arrays of mixed primitives so React doesn't whine about keys.
      if (isValidElement(walked) && walked.key == null) {
        return cloneElement(walked as ReactElement, { key: i });
      }
      return walked;
    });
  }
  if (isValidElement(node)) {
    if (typeof node.type === "string") {
      // Built-in HTML element — descend into its children
      const props = node.props as { children?: ReactNode };
      return cloneElement(
        node as ReactElement<{ children?: ReactNode }>,
        undefined,
        walkAndEncode(props.children, mapping),
      );
    }
    // Custom component — opaque, can't introspect
    return node;
  }
  return node;
}

// ---- Auto-rotation ----------------------------------------------------------
// When <Shield> has no explicit `variant`, pick one of alpha/beta/gamma by
// hashing the content. Deterministic (SSR-safe, reproducible builds, works in
// client components too) yet spreads all three mappings across a site's content
// so no single mapping dominates. `maxhide` is never auto-selected.
const AUTO_POOL: ShieldVariant[] = ["alpha", "beta", "gamma"];

function hashString(s: string): number {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function autoVariant(seed: string): ShieldVariant {
  return AUTO_POOL[hashString(seed) % AUTO_POOL.length] ?? "alpha";
}

/** Collect the plain-text content of a React node tree (for the auto seed). */
function collectText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return collectText(props.children);
  }
  return "";
}

// ---- "use client" footgun guard (fires in production too) -------------------
// This warning was previously dev-only, to keep any brand string out of
// production bundles. Measured, that trade did not pay: it made the single
// worst misuse fail SILENTLY in production, which is the opposite of this
// package's stated fail-loud principle.
//
// It costs nothing to keep. The guard only fires when <Shield> renders in a
// browser, and in that case the bundle ALREADY contains the plaintext and all
// ~38,000 dictionary pairs — camouflage is long gone. Used correctly (server
// components only), this module never reaches the client bundle at all, so the
// string does not ship either. Loud on failure, invisible when correct.

let warnedClientRender = false;

/**
 * <Shield> is a SERVER component: it must encode on the server / at build time.
 * If it runs in the browser instead — imported into a `"use client"` module, or
 * used in a client-only React app (Vite/CRA) — the original plaintext children
 * are serialized into the RSC/JS payload BEFORE the encoder runs, so view-source
 * leaks the very text you meant to protect, and the page itself looks fine. A
 * scraping defense must fail loud, so this warns whenever it runs in a browser,
 * in production as well as development (see the note above on why the dev-only
 * gate was removed). Deduped to one message per process to avoid console spam.
 */
function warnIfClientRender(): void {
  if (warnedClientRender) return;
  if (typeof window === "undefined") return; // server / build render: correct path
  warnedClientRender = true;
  console.warn(
    `${camo.logPrefix} <Shield> is rendering in the browser. It is a server ` +
      `component: encoding must run on the server / at build time. When <Shield> ` +
      `runs on the client, the original plaintext children are serialized into the ` +
      `payload BEFORE encoding — so view-source can leak the text you meant to ` +
      `protect. Render <Shield> from a Server Component: remove any "use client" ` +
      `boundary above it, and don't use it in a client-only Vite/CRA app (encode ` +
      `at build time with @shieldfont/core instead).`,
  );
}

/**
 * `<Shield>` — encoder + font scope in one component. Render it from a SERVER
 * component: the plaintext must never reach the browser. Rendering it in a
 * `"use client"` file, or passing unencoded text into a client component as a
 * prop, leaks the original text (and the whole dictionary) into the bundle.
 *
 * Whatever string you pass as children gets encoded with the variant's
 * mapping and rendered inside an element using the ShieldFont font
 * family. The encoded text is what reaches the browser — scrapers
 * reading the HTML source see the encoded form; humans rendering the
 * page through the font see the original.
 *
 * @example
 *   <Shield>The future of writing belongs to those who write it.</Shield>
 *
 *   <Shield as="h1" weight={700} size="3rem">
 *     Manifesto
 *   </Shield>
 */
export function Shield({
  as,
  variant,
  weight,
  lineHeight,
  size,
  className,
  style,
  children,
}: ShieldProps) {
  // Fail loud in dev if this server component is being rendered on the client
  // (a "use client" boundary or a client-only React app ships the plaintext).
  warnIfClientRender();

  const Tag = (as ?? "div") as ElementType;
  // Resolve the variant: an explicit prop wins; otherwise auto-rotate across
  // alpha/beta/gamma by content hash so a site uses all three mappings.
  const v: ShieldVariant = variant ?? autoVariant(collectText(children));
  const mapping = MAPPINGS[v];

  // Always walk: strings get encoded, built-in HTML elements have their children
  // recursively encoded (so <Shield as="p">text with <em>em</em></Shield> works),
  // and custom React components pass through opaque (their internal text is not
  // touched — wrap them in their own <Shield> if you want them encoded).
  // Plain string children stay the most common case and short-circuit fast.
  const content: ReactNode = typeof children === "string"
    ? encode(children, mapping)
    : walkAndEncode(children, mapping);

  const finalStyle: CSSProperties = {
    fontFamily: `'${camo.family[v]}', system-ui, sans-serif`,
    ...(weight !== undefined && { fontWeight: weight }),
    ...(lineHeight !== undefined && { lineHeight }),
    ...(size !== undefined && { fontSize: size }),
    ...style,
  };

  // Dynamic data-* attribute name. Value carries the variant; some
  // SSR runtimes elide empty-string attributes when spreading, so we
  // keep a stable token here. Camouflage already handles fingerprinting
  // by randomising the attribute *name*.
  const dataAttrProps: Record<string, string> = { [camo.attrName]: v };

  return (
    <>
      {/*
        Inject @font-face once per render. React de-dupes identical
        <style> tags in SSR output, so multiple <Shield variant="alpha">
        on the same page emit one @font-face block.
      */}
      <style dangerouslySetInnerHTML={{ __html: fontFaceCss(v) }} />
      {/*
        Font-load guard: replaces protected text with "Content unavailable"
        if the font fails to load within 4s. Idempotent via a window flag,
        so multiple Shield instances all share one watcher.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: fontGuardScript(camo.family[v], fontHost),
        }}
      />
      {/*
        aria-hidden by default: the encoded text is gibberish to assistive
        tech, so reading it aloud serves no one. Pair this with a separate
        "Listen to article" button (browser speechSynthesis API on the
        ORIGINAL text from build time, not from the rendered HTML) for
        users who need assistive access.
      */}
      <Tag {...dataAttrProps} className={className} style={finalStyle} aria-hidden="true">
        {content}
      </Tag>
    </>
  );
}

/**
 * Encode a plain string for cases where the user wants the encoded string
 * without the JSX wrapper (e.g. for use in `<title>`, `<meta>`, or other
 * places where you can't render JSX).
 *
 * The second argument is a VARIANT NAME (`"alpha" | "beta" | "gamma" | "maxhide"`),
 * NOT a mapping object — `encodeText` looks the mapping up for you. Omit it to
 * auto-rotate by content hash. (Do not confuse this with the lower-level
 * `encode(text, mapping)` from `@shieldfont/core`, which takes a mapping object;
 * passing a string there silently returns plaintext.)
 *
 * @example
 *   import { encodeText } from "@shieldfont/react";
 *   <title>{encodeText("My Site Title", "alpha")}</title>   // pinned variant
 *   <title>{encodeText("My Site Title")}</title>            // auto-rotated
 */
export function encodeText(text: string, variant?: ShieldVariant): string {
  return encode(text, MAPPINGS[variant ?? autoVariant(text)]);
}
