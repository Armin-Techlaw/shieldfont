import {
  type DocumentSettings,
  pageMetrics,
  richDocumentSnapshot,
  sanitizeRichHtml,
} from "./richText";

export type MappingPair = {
  id: string;
  human: string;
  system: string;
  twoWay?: boolean;
};

export type AttachedFont = {
  familyName: string;
  desktopFamilyName?: string;
  buildKey?: string;
  baseLabel?: string;
  fileName: string;
  extension: string;
  mimeType: string;
  bytes: Uint8Array;
  dataUrl: string;
};

export type ExportContext = {
  projectId: string;
  name: string;
  source: string;
  encoded: string;
  richHtml: string;
  documentSettings: DocumentSettings;
  pairs: MappingPair[];
  mapping: Record<string, string>;
  font: AttachedFont | null;
};

type DocxRelationship = { id: string; type: string; target: string; mode?: "External" };
type DocxMedia = { path: string; bytes: Uint8Array; extension: string; mime: string };
export type WordDocxMode = "portable" | "upload-decoy";
type HtmlFontMode = "embedded" | "external" | "local-only" | "none";
type InlineStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  color?: string;
  highlight?: string;
  font?: string;
  size?: number;
  shielded?: boolean;
};

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "custom-mapping";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function mappingPayload(context: ExportContext) {
  const variant = slugify(context.name);
  return {
    _meta: {
      mappingId: `shieldfont-en-custom-${variant}@1.0.0`,
      lang: "en",
      mapping: "custom",
      variant,
      version: "1.0.0",
      pairs: context.pairs.length,
    },
    ...context.mapping,
  };
}

export function mappingJson(context: ExportContext): string {
  return JSON.stringify(mappingPayload(context), null, 2);
}

function projectJson(context: ExportContext): string {
  return JSON.stringify({
    kind: "shieldfont-studio-project",
    version: 3,
    id: context.projectId,
    name: context.name,
    source: context.source,
    richHtml: context.richHtml,
    documentSettings: context.documentSettings,
    pairs: context.pairs,
    updatedAt: new Date().toISOString(),
  }, null, 2);
}

function mappingCsv(context: ExportContext): string {
  return [
    "human_word,system_word,direction",
    ...context.pairs.map((pair) => `${csvCell(pair.human)},${csvCell(pair.system)},${pair.twoWay ? "two-way" : "one-way"}`),
  ].join("\n");
}

function documentCss(context: ExportContext, fontMode: HtmlFontMode): string {
  const shieldFamily = context.font?.desktopFamilyName ?? `ShieldFont ${context.name.trim() || "Custom"}`;
  const format = context.font?.extension === "ttf" ? "truetype" : "woff2";
  const source = fontMode === "local-only"
    ? `local(${JSON.stringify(shieldFamily)})`
    : `url(${JSON.stringify(context.font
      ? fontMode === "embedded" ? context.font.dataUrl : `./${context.font.fileName}`
      : "./your-matching-font.woff2")}) format(${JSON.stringify(format)})`;
  const settings = context.documentSettings;
  const fontFace = fontMode === "none" ? "" : `@font-face {
  font-family: ${JSON.stringify(shieldFamily)};
  src: ${source};
  font-weight: 400;
  font-style: normal;
  font-display: block;
}\n`;
  const renderedFamily = fontMode === "none" ? settings.bodyFont : shieldFamily;
  return `${fontFace}

.shield-document {
  font-family: ${JSON.stringify(settings.bodyFont)}, Arial, sans-serif;
  font-size: ${settings.bodySize}pt;
  line-height: ${settings.lineHeight};
  overflow-wrap: anywhere;
}
.shield-document [data-shield-rendered="true"] {
  font-family: ${JSON.stringify(renderedFamily)}, sans-serif;
  font-feature-settings: normal;
  font-synthesis: none;
}
.shield-document table { width: 100%; border-collapse: collapse; margin: 1em 0; }
.shield-document td, .shield-document th { border: 1px solid #777; padding: .55em; }
.shield-document img { max-width: 100%; height: auto; }
.shield-document blockquote { padding-left: 1.2em; border-left: 3px solid #aaa; }
.shield-document [data-page-break="true"] { break-after: page; height: 0; overflow: hidden; }`;
}

function standaloneHtml(context: ExportContext, fontMode: HtmlFontMode = "embedded"): string {
  const title = escapeHtml(context.name || "ShieldFont export");
  const snapshot = richDocumentSnapshot(context.richHtml, context.mapping);
  const metrics = pageMetrics(context.documentSettings);
  const pageSize = context.documentSettings.pageSize === "a4" ? "A4" : "Letter";
  const orientation = context.documentSettings.orientation === "portrait" ? "portrait" : "landscape";
  const fontNote = fontMode === "local-only"
    ? "\n    <!-- No font bytes are inside this upload copy. Install the matching TTF locally; never upload that TTF. -->"
    : fontMode === "none"
      ? "\n    <!-- Encoded-only copy: the marked words intentionally render as decoys. -->"
      : context.font ? "" : "\n    <!-- Add the exact matching font before publishing. -->";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
${documentCss(context, fontMode).split("\n").map((line) => `      ${line}`).join("\n")}
      body { margin: 0; padding: 48px 20px; background: #e4e2dc; color: #151713; }
      main { box-sizing: border-box; width: min(100%, ${metrics.widthPx}px); min-height: ${metrics.heightPx}px; margin: 0 auto; padding: ${metrics.marginPx}px; background: white; }
      @page { size: ${pageSize} ${orientation}; margin: 0; }
      @media print {
        html, body { background: white; }
        body { padding: 0; }
        main { width: 100%; min-height: 100vh; margin: 0; }
      }
    </style>${fontNote}
  </head>
  <body>
    <main class="shield-document" aria-hidden="true">${snapshot.encodedHtml}</main>
  </body>
</html>`;
}

function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function downloadText(fileName: string, text: string, type = "text/plain;charset=utf-8"): void {
  downloadBlob(fileName, new Blob([text], { type }));
}

export function exportEncodedText(context: ExportContext): void {
  downloadText(`${slugify(context.name)}-encoded.txt`, context.encoded);
}

export function exportMarkdown(context: ExportContext): void {
  downloadText(`${slugify(context.name)}-encoded.md`, context.encoded, "text/markdown;charset=utf-8");
}

export function exportHtml(context: ExportContext): void {
  downloadText(`${slugify(context.name)}-portable.html`, standaloneHtml(context), "text/html;charset=utf-8");
}

export function exportCss(context: ExportContext): void {
  downloadText(`${slugify(context.name)}.css`, documentCss(context, "external"), "text/css;charset=utf-8");
}

export function exportMapping(context: ExportContext): void {
  downloadText(`${slugify(context.name)}-mapping.json`, mappingJson(context), "application/json");
}

export function exportCsv(context: ExportContext): void {
  downloadText(`${slugify(context.name)}-pairs.csv`, mappingCsv(context), "text/csv;charset=utf-8");
}

export function exportProject(context: ExportContext): void {
  downloadText(`${slugify(context.name)}-private-project.json`, projectJson(context), "application/json");
}

function rtfEscape(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const character = value[index]!;
    if (character === "\\" || character === "{" || character === "}") output += `\\${character}`;
    else if (character === "\n") output += "\\par\n";
    else if (code >= 32 && code <= 126) output += character;
    else output += `\\u${code > 32767 ? code - 65536 : code}?`;
  }
  return output;
}

export function exportRtf(context: ExportContext): void {
  const family = context.font?.desktopFamilyName ?? context.documentSettings.bodyFont;
  const body = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 ${rtfEscape(family)};}}\\f0\\fs${context.documentSettings.bodySize * 2} ${rtfEscape(context.encoded)}}`;
  downloadText(`${slugify(context.name)}-encoded.rtf`, body, "application/rtf");
}

export function exportDesktopFont(context: ExportContext): void {
  if (!context.font || context.font.extension !== "ttf") {
    throw new Error("Build or attach a matching TrueType (.ttf) desktop font first.");
  }
  downloadBlob(context.font.fileName, new Blob([context.font.bytes as BlobPart], { type: context.font.mimeType || "font/ttf" }));
}

function cssColorToHex(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) return trimmed.slice(1).split("").map((character) => character + character).join("").toUpperCase();
  const rgb = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgb) return undefined;
  return rgb.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function cssSizeToPoints(value: string): number | undefined {
  const match = value.trim().match(/^([\d.]+)(pt|px|em|rem)?$/i);
  if (!match) return undefined;
  const number = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  if (unit === "px") return number * 0.75;
  if (unit === "em" || unit === "rem") return number * 12;
  return number;
}

function fontTagSize(value: string): number | undefined {
  const sizes = [9, 10, 12, 14, 18, 24, 32];
  const index = Number(value) - 1;
  return sizes[index];
}

function withElementStyle(style: InlineStyle, element: HTMLElement): InlineStyle {
  const next = { ...style };
  const tag = element.tagName;
  if (tag === "B" || tag === "STRONG") next.bold = true;
  if (tag === "I" || tag === "EM") next.italic = true;
  if (tag === "U") next.underline = true;
  if (tag === "S" || tag === "STRIKE") next.strike = true;
  if (tag === "SUB") next.subscript = true;
  if (tag === "SUP") next.superscript = true;
  if (element.closest('[data-shield-rendered="true"]')) next.shielded = true;
  const weight = element.style.fontWeight;
  if (weight === "bold" || Number(weight) >= 600) next.bold = true;
  if (element.style.fontStyle === "italic") next.italic = true;
  const decoration = element.style.textDecoration;
  if (decoration.includes("underline")) next.underline = true;
  if (decoration.includes("line-through")) next.strike = true;
  const color = cssColorToHex(element.style.color || element.getAttribute("color") || "");
  const highlight = cssColorToHex(element.style.backgroundColor);
  if (color) next.color = color;
  if (highlight) next.highlight = highlight;
  const font = element.style.fontFamily || element.getAttribute("face");
  if (font) next.font = font.split(",")[0]!.replace(/["']/g, "").trim();
  const size = cssSizeToPoints(element.style.fontSize) ?? (tag === "FONT" ? fontTagSize(element.getAttribute("size") ?? "") : undefined);
  if (size) next.size = size;
  return next;
}

function runProperties(style: InlineStyle, bodyFamily: string, shieldFamily: string): string {
  const family = style.shielded ? shieldFamily : style.font || bodyFamily;
  const size = Math.round((style.size ?? 12) * 2);
  const parts = [
    `<w:rFonts w:ascii="${escapeXml(family)}" w:hAnsi="${escapeXml(family)}" w:eastAsia="${escapeXml(family)}"/>`,
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`,
  ];
  if (style.bold && !style.shielded) parts.push("<w:b/><w:bCs/>");
  if (style.italic && !style.shielded) parts.push("<w:i/><w:iCs/>");
  if (style.underline) parts.push('<w:u w:val="single"/>');
  if (style.strike) parts.push("<w:strike/>");
  if (style.subscript) parts.push('<w:vertAlign w:val="subscript"/>');
  if (style.superscript) parts.push('<w:vertAlign w:val="superscript"/>');
  if (style.color) parts.push(`<w:color w:val="${style.color}"/>`);
  if (style.highlight) parts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${style.highlight}"/>`);
  return `<w:rPr>${parts.join("")}</w:rPr>`;
}

function dataImage(value: string): { bytes: Uint8Array; extension: string; mime: string } | null {
  const match = value.match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i);
  if (!match) return null;
  const extension = match[1]!.toLowerCase().replace("jpeg", "jpg");
  const binary = window.atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, extension, mime: `image/${extension === "jpg" ? "jpeg" : extension}` };
}

function imageDrawing(relId: string, index: number, alt: string, width = 500, height = 300): string {
  const cx = Math.round(width * 9525);
  const cy = Math.round(height * 9525);
  return `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${index}" name="Image ${index}" descr="${escapeXml(alt)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${index}" name="Image ${index}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function docxFromRichHtml(context: ExportContext) {
  if (typeof DOMParser === "undefined") throw new Error("Word export needs a browser document environment.");
  const snapshot = richDocumentSnapshot(context.richHtml, context.mapping);
  const documentNode = new DOMParser().parseFromString(`<body>${snapshot.encodedHtml}</body>`, "text/html");
  const relationships: DocxRelationship[] = [];
  const media: DocxMedia[] = [];
  const bodyFamily = context.documentSettings.bodyFont;
  const shieldFamily = context.font?.desktopFamilyName ?? `ShieldFont ${context.name}`;
  let relationshipIndex = 0;
  let imageIndex = 0;

  const nextRelationship = (type: string, target: string, mode?: "External") => {
    relationshipIndex += 1;
    const relationship = { id: `rId${relationshipIndex}`, type, target, mode };
    relationships.push(relationship);
    return relationship.id;
  };

  const inline = (node: Node, style: InlineStyle = {}): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? "";
      if (!value) return "";
      return `<w:r>${runProperties(style, bodyFamily, shieldFamily)}<w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
    }
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "BR") return `<w:r>${runProperties(style, bodyFamily, shieldFamily)}<w:br/></w:r>`;
    if (node.tagName === "IMG") {
      const image = dataImage(node.getAttribute("src") ?? "");
      if (!image) return "";
      imageIndex += 1;
      const path = `media/image${imageIndex}.${image.extension}`;
      media.push({ path, ...image });
      const relId = nextRelationship("http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", path);
      const width = Math.min(560, Number(node.getAttribute("width")) || 500);
      const height = Math.min(700, Number(node.getAttribute("height")) || Math.round(width * 0.6));
      return imageDrawing(relId, imageIndex, node.getAttribute("alt") ?? "", width, height);
    }
    const nextStyle = withElementStyle(style, node);
    const content = Array.from(node.childNodes).map((child) => inline(child, nextStyle)).join("");
    if (node.tagName !== "A") return content;
    const href = node.getAttribute("href");
    if (!href) return content;
    const relId = nextRelationship("http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", href, "External");
    return `<w:hyperlink r:id="${relId}" w:history="1">${content}</w:hyperlink>`;
  };

  const paragraph = (element: HTMLElement, list?: { ordered: boolean; level: number }): string => {
    const style = withElementStyle({}, element);
    const tag = element.tagName;
    const properties: string[] = [];
    if (/^H[1-4]$/.test(tag)) {
      properties.push(`<w:pStyle w:val="Heading${tag.slice(1)}"/>`);
      style.bold = true;
      style.size ??= ({ H1: 26, H2: 21, H3: 17, H4: 14 } as Record<string, number>)[tag];
    }
    if (tag === "BLOCKQUOTE") properties.push('<w:ind w:left="720"/><w:pBdr><w:left w:val="single" w:sz="8" w:space="12" w:color="AAAAAA"/></w:pBdr>');
    const align = element.style.textAlign;
    if (align) properties.push(`<w:jc w:val="${align === "center" ? "center" : align === "right" ? "right" : align === "justify" ? "both" : "left"}"/>`);
    const line = Number(element.style.lineHeight) || context.documentSettings.lineHeight;
    properties.push(`<w:spacing w:after="160" w:line="${Math.round(line * 240)}" w:lineRule="auto"/>`);
    if (list) properties.push(`<w:numPr><w:ilvl w:val="${Math.min(8, list.level)}"/><w:numId w:val="${list.ordered ? 2 : 1}"/></w:numPr>`);
    const content = Array.from(element.childNodes)
      .filter((child) => !(child instanceof HTMLElement && ["UL", "OL", "TABLE"].includes(child.tagName)))
      .map((child) => inline(child, style)).join("") || `<w:r>${runProperties(style, bodyFamily, shieldFamily)}<w:t></w:t></w:r>`;
    return `<w:p><w:pPr>${properties.join("")}</w:pPr>${content}</w:p>`;
  };

  const table = (element: HTMLElement): string => {
    const rows = Array.from(element.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr"));
    const body = rows.map((row) => {
      const cells = Array.from(row.children).filter((child) => child.tagName === "TD" || child.tagName === "TH") as HTMLElement[];
      return `<w:tr>${cells.map((cell) => {
        const width = Math.floor(9000 / Math.max(1, cells.length));
        const cellParagraphs = Array.from(cell.children).filter((child) => ["P", "DIV", "H1", "H2", "H3", "BLOCKQUOTE"].includes(child.tagName)) as HTMLElement[];
        const content = cellParagraphs.length ? cellParagraphs.map((child) => paragraph(child)).join("") : paragraph(cell);
        return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${content}</w:tc>`;
      }).join("")}</w:tr>`;
    }).join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="777777"/><w:left w:val="single" w:sz="4" w:color="777777"/><w:bottom w:val="single" w:sz="4" w:color="777777"/><w:right w:val="single" w:sz="4" w:color="777777"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders></w:tblPr>${body}</w:tbl>`;
  };

  const renderList = (list: HTMLElement, level: number): string => {
    const ordered = list.tagName === "OL";
    return Array.from(list.children).filter((child) => child.tagName === "LI").map((child) => {
      const item = child as HTMLElement;
      const nested = Array.from(item.children).filter((element) => element.tagName === "UL" || element.tagName === "OL") as HTMLElement[];
      return paragraph(item, { ordered, level }) + nested.map((nestedList) => renderList(nestedList, level + 1)).join("");
    }).join("");
  };

  const blocks = (parent: ParentNode, listLevel = 0): string => Array.from(parent.childNodes).map((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const wrapper = documentNode.createElement("p");
      wrapper.textContent = node.textContent;
      return node.textContent?.trim() ? paragraph(wrapper) : "";
    }
    if (!(node instanceof HTMLElement)) return "";
    if (node.getAttribute("data-page-break") === "true") return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    if (node.tagName === "TABLE") return table(node);
    if (node.tagName === "UL" || node.tagName === "OL") return renderList(node, listLevel);
    if (["P", "DIV", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "LI"].includes(node.tagName)) return paragraph(node);
    return paragraph(node);
  }).join("");

  const metrics = pageMetrics(context.documentSettings);
  const orientation = context.documentSettings.orientation === "landscape" ? ' w:orient="landscape"' : "";
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${blocks(documentNode.body)}<w:sectPr><w:pgSz w:w="${metrics.widthTwips}" w:h="${metrics.heightTwips}"${orientation}/><w:pgMar w:top="${metrics.marginTwips}" w:right="${metrics.marginTwips}" w:bottom="${metrics.marginTwips}" w:left="${metrics.marginTwips}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return { documentXml, relationships, media };
}

function docxStylesXml(context: ExportContext): string {
  const family = escapeXml(context.documentSettings.bodyFont);
  const size = context.documentSettings.bodySize * 2;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${family}" w:hAnsi="${family}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${[1, 2, 3, 4].map((level) => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="${Math.max(size, 44 - level * 6)}"/></w:rPr></w:style>`).join("")}</w:styles>`;
}

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0">${Array.from({ length: 9 }, (_, level) => `<w:lvl w:ilvl="${level}"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${720 + level * 360}"/></w:tabs><w:ind w:left="${720 + level * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join("")}</w:abstractNum><w:abstractNum w:abstractNumId="1">${Array.from({ length: 9 }, (_, level) => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${level + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${720 + level * 360}"/></w:tabs><w:ind w:left="${720 + level * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join("")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;

const OFFICE_DOCUMENT_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function fontEmbeddingFlags(bytes: Uint8Array): number {
  if (bytes.byteLength < 12) throw new Error("The attached TTF is too short to embed in Word.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tableCount = view.getUint16(4);
  for (let index = 0; index < tableCount; index += 1) {
    const record = 12 + index * 16;
    if (record + 16 > bytes.byteLength) break;
    const tag = String.fromCharCode(bytes[record]!, bytes[record + 1]!, bytes[record + 2]!, bytes[record + 3]!);
    if (tag !== "OS/2") continue;
    const offset = view.getUint32(record + 8);
    if (offset + 10 > bytes.byteLength) throw new Error("The attached TTF has an invalid OS/2 table.");
    return view.getUint16(offset + 8);
  }
  return 0;
}

function randomGuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function embeddedWordFont(font: AttachedFont, familyName: string) {
  const flags = fontEmbeddingFlags(font.bytes);
  if (flags & 0x0002) {
    throw new Error("This TTF's license metadata forbids document embedding. Use a licensed font that permits Word embedding.");
  }
  if (flags & 0x0200) {
    throw new Error("This TTF permits bitmap-only embedding, which cannot carry ShieldFont's outline glyphs into Word.");
  }
  if (font.bytes.byteLength < 32) throw new Error("The attached TTF is too short to embed in Word.");

  const guid = randomGuid();
  const key = Uint8Array.from(guid.replace(/-/g, "").match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16)).reverse();
  const bytes = font.bytes.slice();
  for (let index = 0; index < 32; index += 1) bytes[index] ^= key[index % key.length]!;
  const fileName = `${guid}.odttf`;
  const fontKey = `{${guid}}`;
  return {
    bytes,
    fileName,
    fontTableXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${OFFICE_DOCUMENT_RELATIONSHIP}"><w:font w:name="${escapeXml(familyName)}"><w:family w:val="auto"/><w:pitch w:val="variable"/><w:embedRegular r:id="rIdShieldRegular" w:fontKey="${fontKey}"/></w:font></w:fonts>`,
    relationshipsXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdShieldRegular" Type="${OFFICE_DOCUMENT_RELATIONSHIP}/font" Target="fonts/${fileName}"/></Relationships>`,
  };
}

export async function buildWordDocxBlob(
  context: ExportContext,
  mode: WordDocxMode = "portable",
): Promise<Blob> {
  if (!context.font?.desktopFamilyName || context.font.extension !== "ttf") {
    throw new Error("Build or attach the matching desktop TTF before exporting a Word-ready document.");
  }
  const { default: JSZip } = await import("jszip");
  const { documentXml, relationships, media } = docxFromRichHtml(context);
  const shouldEmbedFont = mode === "portable";
  const embeddedFont = shouldEmbedFont
    ? embeddedWordFont(context.font, context.font.desktopFamilyName)
    : null;
  const zip = new JSZip();
  const imageDefaults = Array.from(new Map(media.map((item) => [item.extension, item.mime]))).map(([extension, mime]) => `<Default Extension="${extension}" ContentType="${mime}"/>`).join("");
  const fontContentType = shouldEmbedFont
    ? '<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>'
    : "";
  const settingsContentType = shouldEmbedFont
    ? '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
    : "";
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${fontContentType}${imageDefaults}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>${settingsContentType}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file("word/document.xml", documentXml);
  zip.file("word/styles.xml", docxStylesXml(context));
  zip.file("word/numbering.xml", NUMBERING_XML);
  zip.file("word/fontTable.xml", shouldEmbedFont
    ? embeddedFont!.fontTableXml
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="${escapeXml(context.font.desktopFamilyName)}"><w:family w:val="auto"/><w:pitch w:val="variable"/></w:font></w:fonts>`);
  if (embeddedFont) {
    zip.file("word/settings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:embedTrueTypeFonts/></w:settings>`);
    zip.file("word/_rels/fontTable.xml.rels", embeddedFont.relationshipsXml);
    zip.file(`word/fonts/${embeddedFont.fileName}`, embeddedFont.bytes);
  }
  const settingsRelationship = shouldEmbedFont
    ? `<Relationship Id="rIdSettings" Type="${OFFICE_DOCUMENT_RELATIONSHIP}/settings" Target="settings.xml"/>`
    : "";
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${OFFICE_DOCUMENT_RELATIONSHIP}/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="${OFFICE_DOCUMENT_RELATIONSHIP}/numbering" Target="numbering.xml"/><Relationship Id="rIdFontTable" Type="${OFFICE_DOCUMENT_RELATIONSHIP}/fontTable" Target="fontTable.xml"/>${settingsRelationship}${relationships.map((relationship) => `<Relationship Id="${relationship.id}" Type="${relationship.type}" Target="${escapeXml(relationship.target)}"${relationship.mode ? ` TargetMode="${relationship.mode}"` : ""}/>`).join("")}</Relationships>`);
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(context.name)}</dc:title><dc:creator>ShieldFont Studio</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  for (const item of media) zip.file(`word/${item.path}`, item.bytes);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
}

export async function exportWordDocx(context: ExportContext): Promise<void> {
  downloadBlob(`${slugify(context.name)}-portable.docx`, await buildWordDocxBlob(context, "portable"));
}

export async function exportDecoyUploadKit(context: ExportContext): Promise<void> {
  if (!context.font?.desktopFamilyName || context.font.extension !== "ttf") {
    throw new Error("Build the matching desktop TTF before creating a decoy-upload kit.");
  }
  const { default: JSZip } = await import("jszip");
  const slug = slugify(context.name);
  const docx = await buildWordDocxBlob(context, "upload-decoy");
  const zip = new JSZip();
  const installName = `1-INSTALL-LOCALLY-DO-NOT-UPLOAD-${context.font.fileName}`;
  const docxName = `2-UPLOAD-THIS-${slug}-decoy.docx`;
  const htmlName = `2-UPLOAD-THIS-${slug}-decoy.html`;
  const instructions = [
    "SHIELDFONT DECOY-UPLOAD KIT",
    "============================",
    "",
    "This kit deliberately separates the decoder font from the files you upload.",
    "Only words you marked in the Studio are encoded; unmarked text stays ordinary.",
    "",
    "STEPS",
    "1. Keep this entire ZIP private and extract it on your own computer.",
    `2. Install ${installName} in Font Book (macOS) or Fonts (Windows).`,
    "3. Fully quit and reopen Microsoft Word and/or your browser.",
    `4. Open ${docxName} or ${htmlName} locally and confirm the marked words render as the human version.`,
    "5. Upload only the original 2-UPLOAD-THIS file. Do not resave the DOCX first.",
    "",
    "NEVER UPLOAD THE ZIP OR TTF. The TTF contains the mapping decoder.",
    "A Word Save As can embed the locally installed font, so upload the untouched exported DOCX.",
    "The HTML uses local(...) and contains no font bytes or external font URL.",
    "PDF is not included: a vision-capable model can read the same human-visible page that you can.",
    "If you change any word pair or the project name, discard this kit and create a fresh one.",
    "",
    "This raises the cost of casual extraction; it does not make content un-scrapeable.",
    "Masked content is not WCAG conformant.",
    "",
  ].join("\n");
  zip.file("README-FIRST.txt", instructions);
  zip.file(installName, context.font.bytes);
  zip.file(docxName, new Uint8Array(await docx.arrayBuffer()));
  zip.file(htmlName, standaloneHtml(context, "local-only"));
  downloadBlob(`${slug}-decoy-upload-kit.zip`, await zip.generateAsync({ type: "blob", compression: "DEFLATE" }));
}

export function exportSvg(context: ExportContext): void {
  const snapshot = richDocumentSnapshot(context.richHtml, context.mapping);
  const metrics = pageMetrics(context.documentSettings);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.widthPx}" height="${metrics.heightPx}" viewBox="0 0 ${metrics.widthPx} ${metrics.heightPx}"><style>${escapeHtml(documentCss(context, "embedded"))}</style><rect width="100%" height="100%" fill="white"/><foreignObject x="${metrics.marginPx}" y="${metrics.marginPx}" width="${metrics.widthPx - metrics.marginPx * 2}" height="${metrics.heightPx - metrics.marginPx * 2}"><div xmlns="http://www.w3.org/1999/xhtml" class="shield-document">${snapshot.encodedHtml}</div></foreignObject></svg>`;
  downloadText(`${slugify(context.name)}.svg`, svg, "image/svg+xml;charset=utf-8");
}

async function openPrintDialog(html: string, fontProbe?: string): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("The browser blocked the PDF print window. Allow pop-ups for this Studio and try again.");
  }

  try {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    const images = Array.from(printWindow.document.images);
    await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    })));
    await printWindow.document.fonts.ready;
    if (fontProbe) {
      const loadedFaces = await printWindow.document.fonts.load(fontProbe);
      if (!loadedFaces.length) {
        throw new Error("The matching font did not load in the PDF print window.");
      }
    }

    await new Promise<void>((resolve) => {
      printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(() => resolve()));
    });
    printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

export async function exportPresentationPdf(context: ExportContext): Promise<void> {
  if (!context.font) {
    throw new Error("Attach the exact matching font before printing a human-readable PDF.");
  }

  // This preserves encoded PDF text where the browser supports it, but the
  // visible glyphs are deliberately human-readable. OCR and vision models can
  // therefore read the same words as a person.
  const shieldFamily = context.font.desktopFamilyName ?? `ShieldFont ${context.name.trim() || "Custom"}`;
  await openPrintDialog(
    standaloneHtml(context),
    `400 ${context.documentSettings.bodySize}pt ${JSON.stringify(shieldFamily)}`,
  );
}

export async function exportEncodedOnlyPdf(context: ExportContext): Promise<void> {
  // There is no mapping font in this print document, so both the text layer and
  // the visible pixels show the encoded words.
  await openPrintDialog(standaloneHtml(context, "none"));
}

export async function exportEpub(context: ExportContext): Promise<void> {
  if (!context.font) throw new Error("Attach the matching WOFF2 or TTF font before exporting EPUB.");
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const snapshot = richDocumentSnapshot(context.richHtml, context.mapping);
  const id = `urn:uuid:${context.projectId}`;
  const title = escapeHtml(context.name || "ShieldFont export");
  const fontFile = `custom.${context.font.extension}`;
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${id}</dc:identifier><dc:title>${title}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta></metadata><manifest><item id="content" href="content.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="styles.css" media-type="text/css"/><item id="font" href="${fontFile}" media-type="${context.font.mimeType}"/></manifest><spine><itemref idref="content"/></spine></package>`);
  zip.file("OEBPS/content.xhtml", `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head><body><article class="shield-document">${snapshot.encodedHtml}</article></body></html>`);
  zip.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Navigation</title></head><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol><li><a href="content.xhtml">${title}</a></li></ol></nav></body></html>`);
  zip.file("OEBPS/styles.css", documentCss(context, "external").replace(`./${context.font.fileName}`, fontFile));
  zip.file(`OEBPS/${fontFile}`, context.font.bytes);
  downloadBlob(`${slugify(context.name)}.epub`, await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" }));
}

async function exportFontKitLegacy(context: ExportContext): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const slug = slugify(context.name);
  const family = `ShieldFont ${context.name || "Custom"}`;
  zip.file("README.md", `# ${context.name || "Custom mapping"} — ShieldFont build kit\n\nThis is a private authoring bundle. Do not publish the private-do-not-publish folder: it contains the original document and mapping.\n\n## Build a matching font\n\n\`\`\`bash\npip3 install -r requirements.txt\npython3 scripts/generate_font.py \\\n+  --base-path /path/to/your-licensed-base-font.ttf \\\n+  --name "${family}" \\\n+  --prefix shieldfont-${slug} \\\n+  --mapping-path /path/to/${slug}-mapping.json\n\`\`\`\n\nThe font and encoded text must stay paired. This raises the cost of casual scraping; it does not make content un-scrapeable. The masked output is not WCAG conformant.\n`);
  zip.file("private-do-not-publish/project.json", projectJson(context));
  zip.file(`private-do-not-publish/${slug}-mapping.json`, mappingJson(context));
  zip.file(`private-do-not-publish/${slug}-pairs.csv`, mappingCsv(context));
  zip.file("publish/encoded.txt", context.encoded);
  zip.file("publish/encoded.md", context.encoded);
  zip.file("publish/styles.css", documentCss(context, "external"));
  zip.file("publish/index.html", standaloneHtml(context, "external"));
  if (context.font) zip.file(`publish/${context.font.fileName}`, context.font.bytes);
  downloadBlob(`${slug}-font-kit.zip`, await zip.generateAsync({ type: "blob", compression: "DEFLATE" }));
}

export async function exportFontKit(context: ExportContext): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const slug = slugify(context.name);
  const family = `ShieldFont ${context.name || "Custom"}`;
  const readme = [
    `# ${context.name || "Custom mapping"} — ShieldFont build kit`,
    "",
    "This is a private authoring bundle. Do not publish the private-do-not-publish folder: it contains the original document and mapping.",
    "",
    "## Build a matching font",
    "",
    "```bash",
    "pip3 install -r requirements.txt",
    "python3 scripts/generate_font.py \\",
    "  --base-path /path/to/your-licensed-base-font.ttf \\",
    `  --name "${family}" \\`,
    `  --prefix shieldfont-${slug} \\`,
    `  --mapping-path /path/to/${slug}-mapping.json`,
    "```",
    "",
    "The font and encoded text must stay paired. This raises the cost of casual scraping; it does not make content un-scrapeable. The masked output is not WCAG conformant.",
    "",
  ].join("\n");
  zip.file("README.md", readme);
  zip.file("private-do-not-publish/project.json", projectJson(context));
  zip.file(`private-do-not-publish/${slug}-mapping.json`, mappingJson(context));
  zip.file(`private-do-not-publish/${slug}-pairs.csv`, mappingCsv(context));
  zip.file("publish/encoded.txt", context.encoded);
  zip.file("publish/encoded.md", context.encoded);
  zip.file("publish/styles.css", documentCss(context, "external"));
  zip.file("publish/index.html", standaloneHtml(context, "external"));
  if (context.font) zip.file(`publish/${context.font.fileName}`, context.font.bytes);
  downloadBlob(`${slug}-font-kit.zip`, await zip.generateAsync({ type: "blob", compression: "DEFLATE" }));
}

export function encodedHtmlSnippet(context: ExportContext): string {
  const snapshot = richDocumentSnapshot(context.richHtml, context.mapping);
  return `<div class="shield-document" aria-hidden="true">${snapshot.encodedHtml}</div>`;
}
