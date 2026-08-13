export type MappingPair = {
  id: string;
  human: string;
  system: string;
};

export type AttachedFont = {
  familyName: string;
  desktopFamilyName?: string;
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
  pairs: MappingPair[];
  mapping: Record<string, string>;
  font: AttachedFont | null;
};

export function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "custom-mapping"
  );
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
  return JSON.stringify(
    {
      kind: "shieldfont-studio-project",
      version: 1,
      id: context.projectId,
      name: context.name,
      source: context.source,
      pairs: context.pairs,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

function mappingCsv(context: ExportContext): string {
  return [
    "human_word,system_word",
    ...context.pairs.map((pair) => `${csvCell(pair.human)},${csvCell(pair.system)}`),
  ].join("\n");
}

function cssFor(context: ExportContext, embedded: boolean): string {
  const family = `ShieldFont ${context.name.trim() || "Custom"}`;
  const source = context.font
    ? embedded
      ? context.font.dataUrl
      : `./${context.font.fileName}`
    : "./your-matching-font.woff2";
  const format = context.font?.extension === "ttf" ? "truetype" : "woff2";
  return `@font-face {
  font-family: ${JSON.stringify(family)};
  src: url(${JSON.stringify(source)}) format(${JSON.stringify(format)});
  font-weight: 400;
  font-style: normal;
  font-display: block;
}

.copy-a9 {
  font-family: ${JSON.stringify(family)}, sans-serif;
  font-feature-settings: normal;
  font-synthesis: none;
  white-space: pre-wrap;
}`;
}

function standaloneHtml(context: ExportContext, embeddedFont = true): string {
  const title = escapeHtml(context.name || "ShieldFont export");
  const fontNote = context.font
    ? ""
    : "\n    <!-- Add the matching custom font before publishing. Without it, readers see the encoded text. -->";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
${cssFor(context, embeddedFont)
  .split("\n")
  .map((line) => `      ${line}`)
  .join("\n")}
      body { margin: 0; background: #f4f1e8; color: #151713; }
      main { max-width: 760px; margin: 0 auto; padding: 8vw 7vw; }
      .copy-a9 { font-size: clamp(1.25rem, 2.4vw, 2rem); line-height: 1.55; }
    </style>${fontNote}
  </head>
  <body>
    <main>
      <div class="copy-a9" aria-hidden="true">${escapeHtml(context.encoded)}</div>
    </main>
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
  downloadText(
    `${slugify(context.name)}.html`,
    standaloneHtml(context),
    "text/html;charset=utf-8",
  );
}

export function exportCss(context: ExportContext): void {
  downloadText(`${slugify(context.name)}.css`, cssFor(context, false), "text/css;charset=utf-8");
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
  const family = context.font?.desktopFamilyName ?? "Arial";
  const body = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 ${rtfEscape(family)};}}\\f0\\fs24 ${rtfEscape(context.encoded)}}`;
  downloadText(`${slugify(context.name)}-encoded.rtf`, body, "application/rtf");
}

export function exportDesktopFont(context: ExportContext): void {
  if (!context.font || context.font.extension !== "ttf") {
    throw new Error("Build or attach a matching TrueType (.ttf) desktop font first.");
  }
  downloadBlob(
    context.font.fileName,
    new Blob([context.font.bytes as BlobPart], { type: context.font.mimeType || "font/ttf" }),
  );
}

function docxDocumentXml(context: ExportContext, family: string): string {
  const paragraphs = (context.encoded || " ").split("\n").map((line) => {
    const content = line
      ? `<w:r><w:rPr><w:rFonts w:ascii="${escapeXml(family)}" w:hAnsi="${escapeXml(family)}"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`
      : `<w:r><w:rPr><w:rFonts w:ascii="${escapeXml(family)}" w:hAnsi="${escapeXml(family)}"/></w:rPr><w:t></w:t></w:r>`;
    return `<w:p>${content}</w:p>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
}

export async function exportWordDocx(context: ExportContext): Promise<void> {
  if (!context.font?.desktopFamilyName || context.font.extension !== "ttf") {
    throw new Error("Build the installable desktop TTF before exporting a Word-ready document.");
  }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const family = context.font.desktopFamilyName;
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  );
  zip.file("word/document.xml", docxDocumentXml(context, family));
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  zip.file(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(context.name)}</dc:title><dc:creator>ShieldFont Studio</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`,
  );
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
  downloadBlob(`${slugify(context.name)}-word-ready.docx`, blob);
}

export function exportSvg(context: ExportContext): void {
  const fontCss = cssFor(context, true);
  const estimatedLines = Math.max(1, context.encoded.split("\n").length + Math.ceil(context.encoded.length / 68));
  const height = Math.max(720, 250 + estimatedLines * 48);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
  <style>${escapeHtml(fontCss)}
    .page { background: #f4f1e8; color: #151713; font-size: 36px; line-height: 1.45; padding: 90px; box-sizing: border-box; }
  </style>
  <rect width="1200" height="${height}" fill="#f4f1e8"/>
  <foreignObject x="0" y="0" width="1200" height="${height}">
    <div xmlns="http://www.w3.org/1999/xhtml" class="page copy-a9">${escapeHtml(context.encoded)}</div>
  </foreignObject>
</svg>`;
  downloadText(`${slugify(context.name)}.svg`, svg, "image/svg+xml;charset=utf-8");
}

function asciiPdfText(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function renderPdfPages(context: ExportContext): HTMLCanvasElement[] {
  const width = 1240;
  const height = 1754;
  const margin = 116;
  const bodyTop = 286;
  const bodyBottom = 1480;
  const lineHeight = 58;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const measure = canvas.getContext("2d");
  if (!measure) throw new Error("Canvas is not available in this browser.");

  const bodyFamily = context.font ? `"${context.font.familyName}"` : '"Optik Text", Georgia, serif';
  measure.font = `42px ${bodyFamily}`;
  const visibleText = context.font ? context.encoded : context.source;
  const lines = wrapCanvasText(measure, visibleText || " ", width - margin * 2);
  const perPage = Math.max(1, Math.floor((bodyBottom - bodyTop) / lineHeight));
  const pageCount = Math.max(1, Math.ceil(lines.length / perPage));
  const pages: HTMLCanvasElement[] = [];

  for (let page = 0; page < pageCount; page += 1) {
    const sheet = document.createElement("canvas");
    sheet.width = width;
    sheet.height = height;
    const draw = sheet.getContext("2d");
    if (!draw) throw new Error("Canvas is not available in this browser.");

    draw.fillStyle = "#f4f1e8";
    draw.fillRect(0, 0, width, height);
    draw.fillStyle = "#151713";
    draw.fillRect(margin, 92, 62, 12);
    draw.fillStyle = "#8dfc65";
    draw.fillRect(margin + 62, 92, 132, 12);
    draw.fillStyle = "#151713";
    draw.font = "700 24px Arial, sans-serif";
    draw.letterSpacing = "3px";
    draw.fillText("SHIELDFONT STUDIO", margin, 154);
    draw.font = "700 42px Arial, sans-serif";
    draw.letterSpacing = "0px";
    draw.fillText(context.name || "Custom mapping", margin, 220);
    draw.font = `42px ${bodyFamily}`;
    draw.fillStyle = "#151713";

    const pageLines = lines.slice(page * perPage, (page + 1) * perPage);
    pageLines.forEach((line, index) => draw.fillText(line, margin, bodyTop + index * lineHeight));

    draw.strokeStyle = "#c9c7bf";
    draw.beginPath();
    draw.moveTo(margin, 1600);
    draw.lineTo(width - margin, 1600);
    draw.stroke();
    draw.font = "20px Arial, sans-serif";
    draw.fillStyle = "#5d615a";
    draw.fillText("Visible layer: human reading", margin, 1648);
    draw.textAlign = "right";
    draw.fillText(`${page + 1} / ${pageCount}`, width - margin, 1648);
    draw.textAlign = "left";
    pages.push(sheet);
  }
  return pages;
}

export async function exportProtectedPdf(context: ExportContext): Promise<void> {
  const { jsPDF } = await import("jspdf");
  await document.fonts.ready;
  if (context.font) await document.fonts.load(`42px "${context.font.familyName}"`);
  const visualPages = renderPdfPages(context);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const systemLines = pdf.splitTextToSize(asciiPdfText(context.encoded), 180) as string[];
  const chunks: string[][] = [];
  for (let index = 0; index < systemLines.length; index += 110) {
    chunks.push(systemLines.slice(index, index + 110));
  }
  const totalPages = Math.max(visualPages.length, chunks.length || 1);

  for (let page = 0; page < totalPages; page += 1) {
    if (page > 0) pdf.addPage();
    const visual = visualPages[Math.min(page, visualPages.length - 1)]!;
    pdf.addImage(visual.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297, undefined, "FAST");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(2);
    const invisible = chunks[page] ?? [];
    if (invisible.length) {
      pdf.text(invisible, 12, 12, { renderingMode: "invisible", lineHeightFactor: 1 });
    }
  }

  pdf.setProperties({
    title: context.name,
    subject: "Visible human layer with an encoded machine-readable text layer",
    creator: "ShieldFont Studio",
  });
  pdf.save(`${slugify(context.name)}-shielded.pdf`);
}

export async function exportEpub(context: ExportContext): Promise<void> {
  if (!context.font) throw new Error("Attach the matching WOFF2 or TTF font before exporting EPUB.");
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const id = `urn:uuid:${context.projectId}`;
  const title = escapeHtml(context.name || "ShieldFont export");
  const fontFile = `custom.${context.font.extension}`;
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${id}</dc:identifier><dc:title>${title}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta></metadata>
  <manifest><item id="content" href="content.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="styles.css" media-type="text/css"/><item id="font" href="${fontFile}" media-type="${context.font.mimeType}"/></manifest>
  <spine><itemref idref="content"/></spine>
</package>`,
  );
  zip.file(
    "OEBPS/content.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head><body><article class="copy-a9">${escapeHtml(context.encoded).replace(/\n/g, "<br/>")}</article></body></html>`,
  );
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Navigation</title></head><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol><li><a href="content.xhtml">${title}</a></li></ol></nav></body></html>`,
  );
  zip.file(
    "OEBPS/styles.css",
    `@font-face{font-family:CustomShield;src:url('${fontFile}')}body{margin:5%;background:#f4f1e8;color:#151713}.copy-a9{font-family:CustomShield,sans-serif;font-feature-settings:normal;font-synthesis:none;font-size:1.2rem;line-height:1.6;white-space:pre-wrap}`,
  );
  zip.file(`OEBPS/${fontFile}`, context.font.bytes);
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" });
  downloadBlob(`${slugify(context.name)}.epub`, blob);
}

export async function exportFontKit(context: ExportContext): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const slug = slugify(context.name);
  const family = `ShieldFont ${context.name || "Custom"}`;
  zip.file("README.md", `# ${context.name || "Custom mapping"} - ShieldFont build kit

This is a private authoring bundle. Do not publish the \`private-do-not-publish\` folder: it contains the original text and mapping.

## Build a matching font

From the ShieldFont repository:

\`\`\`bash
pip3 install -r requirements.txt
python3 scripts/generate_font.py \\
  --base-path /path/to/your-licensed-base-font.ttf \\
  --name "${family}" \\
  --prefix shieldfont-${slug} \\
  --mapping-path /path/to/${slug}-mapping.json
\`\`\`

The generated font and the mapping must stay paired. The font raises the cost of casual scraping; it is not un-scrapeable. Do not use protected content where WCAG conformance or accessibility law applies.
`);
  zip.file("private-do-not-publish/project.json", projectJson(context));
  zip.file(`private-do-not-publish/${slug}-mapping.json`, mappingJson(context));
  zip.file(`private-do-not-publish/${slug}-pairs.csv`, mappingCsv(context));
  zip.file("publish/encoded.txt", context.encoded);
  zip.file("publish/encoded.md", context.encoded);
  zip.file("publish/styles.css", cssFor(context, false));
  zip.file("publish/index.html", standaloneHtml(context, false));
  if (context.font) zip.file(`publish/${context.font.fileName}`, context.font.bytes);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  downloadBlob(`${slug}-font-kit.zip`, blob);
}

export function encodedHtmlSnippet(context: ExportContext): string {
  return `<div class="copy-a9" aria-hidden="true">${escapeHtml(context.encoded)}</div>`;
}
