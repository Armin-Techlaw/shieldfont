import { encodeSegments } from "@shieldfont/core";

export type DocumentSettings = {
  pageSize: "a4" | "letter";
  orientation: "portrait" | "landscape";
  margin: "normal" | "narrow" | "wide";
  bodyFont: string;
  bodySize: number;
  lineHeight: number;
};

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  pageSize: "a4",
  orientation: "portrait",
  margin: "normal",
  bodyFont: "Arimo",
  bodySize: 12,
  lineHeight: 1.5,
};

const DOCUMENT_FONTS = new Set(["Arimo", "Tinos", "Arial", "Times New Roman", "Georgia", "Helvetica"]);
const DOCUMENT_SIZES = [9, 10, 12, 14, 18, 24, 32];
const LINE_HEIGHTS = [1, 1.15, 1.5, 2];

export function normalizeDocumentSettings(value?: Partial<DocumentSettings>): DocumentSettings {
  const bodySize = Number(value?.bodySize);
  const lineHeight = Number(value?.lineHeight);
  return {
    pageSize: value?.pageSize === "letter" ? "letter" : "a4",
    orientation: value?.orientation === "landscape" ? "landscape" : "portrait",
    margin: value?.margin === "narrow" || value?.margin === "wide" ? value.margin : "normal",
    bodyFont: value?.bodyFont && DOCUMENT_FONTS.has(value.bodyFont) ? value.bodyFont : DEFAULT_DOCUMENT_SETTINGS.bodyFont,
    bodySize: DOCUMENT_SIZES.includes(bodySize) ? bodySize : DEFAULT_DOCUMENT_SETTINGS.bodySize,
    lineHeight: LINE_HEIGHTS.includes(lineHeight) ? lineHeight : DEFAULT_DOCUMENT_SETTINGS.lineHeight,
  };
}

export type RichDocumentSnapshot = {
  source: string;
  encoded: string;
  encodedHtml: string;
  swapped: number;
  tokenCount: number;
  protectedTokenCount: number;
};

const BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "FIGCAPTION", "FIGURE",
  "FOOTER", "H1", "H2", "H3", "H4", "HEADER", "HR", "LI", "MAIN", "NAV",
  "OL", "P", "SECTION", "TABLE", "TR", "UL",
]);

const ALLOWED_TAGS = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "FONT", "H1", "H2", "H3", "H4",
  "HR", "I", "IMG", "LI", "OL", "P", "S", "SPAN", "STRIKE", "STRONG", "SUB",
  "SUP", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "U", "UL",
]);

const DROP_WITH_CONTENT = new Set(["IFRAME", "OBJECT", "SCRIPT", "STYLE", "SVG", "VIDEO", "AUDIO"]);
const ALLOWED_STYLE_PROPERTIES = new Set([
  "background-color", "color", "font-family", "font-size", "font-style", "font-weight",
  "line-height", "margin-left", "text-align", "text-decoration", "text-indent",
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sourceToRichHtml(source: string): string {
  if (!source.trim()) return "<p><br></p>";
  return source
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function fallbackText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-4]|li|blockquote|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function sanitizeStyle(element: HTMLElement): void {
  const next: string[] = [];
  for (const property of ALLOWED_STYLE_PROPERTIES) {
    const value = element.style.getPropertyValue(property).trim();
    if (!value || /url\s*\(|expression\s*\(|javascript:/i.test(value)) continue;
    next.push(`${property}: ${value}`);
  }
  if (next.length) element.setAttribute("style", next.join("; "));
  else element.removeAttribute("style");
}

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  return null;
}

function safeImage(value: string): string | null {
  return /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value) ? value : null;
}

export function sanitizeRichHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const documentNode = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const elements = Array.from(documentNode.body.querySelectorAll("*"));

  for (const element of elements) {
    const tag = element.tagName;
    if (DROP_WITH_CONTENT.has(tag)) {
      element.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    const kept = new Map<string, string>();
    if (element instanceof HTMLElement) {
      sanitizeStyle(element);
      const style = element.getAttribute("style");
      if (style) kept.set("style", style);
    }
    if (element.getAttribute("data-shield") === "true") kept.set("data-shield", "true");
    if (element.getAttribute("data-page-break") === "true") kept.set("data-page-break", "true");
    if (tag === "A") {
      const href = safeHref(element.getAttribute("href") ?? "");
      if (href) kept.set("href", href);
    }
    if (tag === "IMG") {
      const src = safeImage(element.getAttribute("src") ?? "");
      if (!src) {
        element.remove();
        continue;
      }
      kept.set("src", src);
      for (const name of ["alt", "width", "height"]) {
        const value = element.getAttribute(name);
        if (value) kept.set(name, value.slice(0, 240));
      }
    }
    if (tag === "TD" || tag === "TH") {
      for (const name of ["colspan", "rowspan"]) {
        const value = element.getAttribute(name);
        if (value && /^\d{1,2}$/.test(value)) kept.set(name, value);
      }
    }
    if (tag === "FONT") {
      for (const name of ["face", "color", "size"]) {
        const value = element.getAttribute(name);
        if (value) kept.set(name, value.slice(0, 80));
      }
    }
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
    for (const [name, value] of kept) element.setAttribute(name, value);
  }
  return documentNode.body.innerHTML || "<p><br></p>";
}

function textWithBlocks(root: ParentNode): string {
  let output = "";
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      output += node.textContent ?? "";
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.getAttribute("data-page-break") === "true") {
      if (output && !output.endsWith("\n")) output += "\n";
      return;
    }
    if (node.tagName === "BR") {
      output += "\n";
      return;
    }
    if (node.tagName === "IMG") {
      const alt = node.getAttribute("alt");
      if (alt) output += `[${alt}]`;
      return;
    }
    const isBlock = BLOCK_TAGS.has(node.tagName);
    if (isBlock && output && !output.endsWith("\n")) output += "\n";
    for (const child of Array.from(node.childNodes)) visit(child);
    if (isBlock && !output.endsWith("\n")) output += "\n";
  };
  for (const child of Array.from(root.childNodes)) visit(child);
  return output.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function plainTextFromRichHtml(html: string): string {
  if (typeof DOMParser === "undefined") return fallbackText(html);
  const documentNode = new DOMParser().parseFromString(`<body>${sanitizeRichHtml(html)}</body>`, "text/html");
  return textWithBlocks(documentNode.body);
}

export function legacyDocumentSnapshot(source: string, mapping: Record<string, string>): RichDocumentSnapshot {
  const segments = encodeSegments(source, mapping);
  const encoded = segments.map((segment) => segment.encoded).join("");
  const swapped = segments.filter((segment) => segment.swapped).length;
  const tokenCount = segments.filter((segment) => segment.kind === "word" || segment.kind === "digit").length;
  return {
    source,
    encoded,
    encodedHtml: `<p data-shield="true">${escapeHtml(encoded).replace(/\n/g, "<br>")}</p>`,
    swapped,
    tokenCount,
    protectedTokenCount: tokenCount,
  };
}

export function richDocumentSnapshot(html: string, mapping: Record<string, string>): RichDocumentSnapshot {
  if (typeof DOMParser === "undefined") return legacyDocumentSnapshot(fallbackText(html), mapping);
  const sanitized = sanitizeRichHtml(html);
  const originalDocument = new DOMParser().parseFromString(`<body>${sanitized}</body>`, "text/html");
  const encodedDocument = new DOMParser().parseFromString(`<body>${sanitized}</body>`, "text/html");
  const source = textWithBlocks(originalDocument.body);
  let swapped = 0;
  let tokenCount = 0;
  let protectedTokenCount = 0;

  const walker = encodedDocument.createTreeWalker(encodedDocument.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const textNode of textNodes) {
    if (textNode.parentElement?.closest('[data-page-break="true"]')) continue;
    const protectedElement = textNode.parentElement?.closest('[data-shield="true"]');
    const segments = encodeSegments(textNode.data, mapping);
    tokenCount += segments.filter((segment) => segment.kind === "word" || segment.kind === "digit").length;
    if (!protectedElement) continue;
    protectedTokenCount += segments.filter((segment) => segment.kind === "word" || segment.kind === "digit").length;
    swapped += segments.filter((segment) => segment.swapped).length;
    textNode.data = segments.map((segment) => segment.encoded).join("");
    protectedElement.setAttribute("data-shield-rendered", "true");
  }

  return {
    source,
    encoded: textWithBlocks(encodedDocument.body),
    encodedHtml: encodedDocument.body.innerHTML,
    swapped,
    tokenCount,
    protectedTokenCount,
  };
}

export function protectMappedWords(html: string, mapping: Record<string, string>): string {
  if (typeof DOMParser === "undefined") return html;
  const documentNode = new DOMParser().parseFromString(`<body>${sanitizeRichHtml(html)}</body>`, "text/html");
  const walker = documentNode.createTreeWalker(documentNode.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    if (!textNode.parentElement?.closest('[data-shield="true"], [data-page-break="true"]')) nodes.push(textNode);
  }
  for (const textNode of nodes) {
    const segments = encodeSegments(textNode.data, mapping);
    if (!segments.some((segment) => segment.swapped)) continue;
    const fragment = documentNode.createDocumentFragment();
    for (const segment of segments) {
      if (!segment.original) continue;
      if (segment.swapped) {
        const span = documentNode.createElement("span");
        span.setAttribute("data-shield", "true");
        span.textContent = segment.original;
        fragment.appendChild(span);
      } else fragment.appendChild(documentNode.createTextNode(segment.original));
    }
    textNode.replaceWith(fragment);
  }
  return documentNode.body.innerHTML;
}

export function clearProtection(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const documentNode = new DOMParser().parseFromString(`<body>${sanitizeRichHtml(html)}</body>`, "text/html");
  for (const element of Array.from(documentNode.body.querySelectorAll('[data-shield="true"]'))) {
    element.replaceWith(...Array.from(element.childNodes));
  }
  return documentNode.body.innerHTML;
}

export function pageMetrics(settings: DocumentSettings) {
  const portrait = settings.pageSize === "a4"
    ? { widthPx: 794, heightPx: 1123, widthTwips: 11906, heightTwips: 16838 }
    : { widthPx: 816, heightPx: 1056, widthTwips: 12240, heightTwips: 15840 };
  const marginPx = settings.margin === "narrow" ? 48 : settings.margin === "wide" ? 144 : 96;
  const marginTwips = settings.margin === "narrow" ? 720 : settings.margin === "wide" ? 2160 : 1440;
  if (settings.orientation === "portrait") return { ...portrait, marginPx, marginTwips };
  return {
    widthPx: portrait.heightPx,
    heightPx: portrait.widthPx,
    widthTwips: portrait.heightTwips,
    heightTwips: portrait.widthTwips,
    marginPx,
    marginTwips,
  };
}
