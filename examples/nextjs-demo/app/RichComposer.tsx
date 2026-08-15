"use client";

import { encodeSegments } from "@shieldfont/core";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  clearProtection,
  type DocumentSettings,
  pageMetrics,
  plainTextFromRichHtml,
  protectMappedWords,
  sanitizeRichHtml,
} from "./richText";

type RichComposerProps = {
  documentId: string;
  html: string;
  settings: DocumentSettings;
  mapping: Record<string, string>;
  onAddPairs: (pairs: Array<{ human: string; system: string; twoWay: boolean }>) => {
    ok: boolean;
    message: string;
  };
  onChange: (html: string, source: string) => void;
  onSettingsChange: (settings: DocumentSettings) => void;
  onNotice: (message: string) => void;
};

type MaskMenuState = {
  x: number;
  y: number;
  source: string;
  hidden: string;
  twoWay: boolean;
  error: string;
};

const FONT_SIZES = ["9", "10", "12", "14", "18", "24", "32"];
const FONT_FAMILIES = ["Arimo", "Tinos", "Arial", "Times New Roman", "Georgia", "Helvetica"];
const WORDS_PATTERN = /\p{L}+/gu;

function wordsIn(value: string): string[] {
  return value.normalize("NFC").match(WORDS_PATTERN) ?? [];
}

function mappedText(value: string, mapping: Record<string, string>): string {
  return encodeSegments(value, mapping).map((segment) => segment.encoded).join("");
}

function unwrap(element: Element): void {
  element.replaceWith(...Array.from(element.childNodes));
}

function placeCaretOutsideMask(mask: Element, before: boolean): Range | null {
  const parent = mask.parentNode;
  if (!parent) return null;
  let boundary = before ? mask.previousSibling : mask.nextSibling;
  let offset: number;
  if (boundary?.nodeType === Node.TEXT_NODE) {
    offset = before ? (boundary.textContent?.length ?? 0) : 0;
  } else {
    boundary = document.createTextNode("");
    parent.insertBefore(boundary, before ? mask : mask.nextSibling);
    offset = 0;
  }

  const range = document.createRange();
  range.setStart(boundary, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return range;
}

type MaskBoundary = { mask: Element; before: boolean };

function moveCaretOutsideMaskAtBoundary(editor: HTMLDivElement): MaskBoundary | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !editor.contains(range.commonAncestorContainer)) return null;

  const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement;
  const mask = anchor?.closest('[data-shield="true"]');
  if (!mask || !editor.contains(mask)) return null;

  const prefix = document.createRange();
  prefix.selectNodeContents(mask);
  try {
    prefix.setEnd(range.startContainer, range.startOffset);
  } catch {
    return null;
  }
  const offset = prefix.toString().length;
  const length = mask.textContent?.length ?? 0;
  if (offset !== 0 && offset !== length) return null;

  const before = offset === 0;
  return placeCaretOutsideMask(mask, before) ? { mask, before } : null;
}

function ToolButton({
  label,
  title,
  active,
  onRun,
}: {
  label: string;
  title: string;
  active?: boolean;
  onRun: () => void;
}) {
  return (
    <button
      className={active ? "editor-tool editor-tool--active" : "editor-tool"}
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRun}
    >
      {label}
    </button>
  );
}

export function RichComposer({
  documentId,
  html,
  settings,
  mapping,
  onAddPairs,
  onChange,
  onSettingsChange,
  onNotice,
}: RichComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const hiddenInputRef = useRef<HTMLTextAreaElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const maskBoundaryRef = useRef<{ boundary: MaskBoundary; text: string; html: string } | null>(null);
  const [maskMenu, setMaskMenu] = useState<MaskMenuState | null>(null);
  const maskMenuOpen = maskMenu !== null;
  const htmlRef = useRef(html);
  htmlRef.current = html;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const safeHtml = sanitizeRichHtml(htmlRef.current);
    editor.innerHTML = safeHtml;
  }, [documentId]);

  useEffect(() => {
    if (!maskMenuOpen) return;
    hiddenInputRef.current?.focus();
    hiddenInputRef.current?.select();
  }, [maskMenuOpen]);

  const metrics = pageMetrics(settings);
  const pageStyle = {
    width: `${metrics.widthPx}px`,
    minHeight: `${metrics.heightPx}px`,
    padding: `${metrics.marginPx}px`,
    fontFamily: settings.bodyFont,
    fontSize: `${settings.bodySize}pt`,
    lineHeight: String(settings.lineHeight),
  };

  function rememberSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
  }

  function restoreSelection(): Range | null {
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return null;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return range;
  }

  function syncEditor() {
    const editor = editorRef.current;
    if (!editor) return;
    const safeHtml = sanitizeRichHtml(editor.innerHTML);
    onChange(safeHtml, plainTextFromRichHtml(safeHtml));
  }

  function stageMaskBoundaryInsertion(editor: HTMLDivElement): boolean {
    const boundary = moveCaretOutsideMaskAtBoundary(editor);
    maskBoundaryRef.current = boundary ? {
      boundary,
      text: boundary.mask.textContent ?? "",
      html: boundary.mask.innerHTML,
    } : null;
    return Boolean(boundary);
  }

  function repairMaskBoundaryInsertion(editor: HTMLDivElement) {
    const pending = maskBoundaryRef.current;
    maskBoundaryRef.current = null;
    if (!pending || !editor.contains(pending.boundary.mask)) return;
    const current = pending.boundary.mask.textContent ?? "";
    if (current === pending.text) return;

    const inserted = pending.boundary.before && current.endsWith(pending.text)
      ? current.slice(0, current.length - pending.text.length)
      : !pending.boundary.before && current.startsWith(pending.text)
        ? current.slice(pending.text.length)
        : "";
    if (!inserted) return;

    pending.boundary.mask.innerHTML = pending.html;
    const textNode = document.createTextNode(inserted);
    const parent = pending.boundary.mask.parentNode;
    if (!parent) return;
    parent.insertBefore(textNode, pending.boundary.before ? pending.boundary.mask : pending.boundary.mask.nextSibling);
    const caret = document.createRange();
    caret.setStart(textNode, inserted.length);
    caret.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(caret);
  }

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, value);
    rememberSelection();
    syncEditor();
  }

  function insertHtml(value: string) {
    runCommand("insertHTML", value);
  }

  function protectRange(editor: HTMLDivElement, range: Range): { wrapped: number; last: HTMLSpanElement | null } {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.data && range.intersectsNode(node)) nodes.push(node);
    }
    let wrapped = 0;
    let last: HTMLSpanElement | null = null;
    for (const node of nodes.reverse()) {
      if (node.parentElement?.closest('[data-shield="true"]')) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.data.length;
      if (start >= end) continue;
      const selected = node.splitText(start);
      selected.splitText(end - start);
      const span = document.createElement("span");
      span.setAttribute("data-shield", "true");
      selected.replaceWith(span);
      span.appendChild(selected);
      if (!last) last = span;
      wrapped += 1;
    }
    return { wrapped, last };
  }

  function protectSelection() {
    const editor = editorRef.current;
    const range = restoreSelection();
    if (!editor || !range || range.collapsed) {
      onNotice("Select the words you want to mask, then choose Mask selection.");
      return;
    }
    const { wrapped, last } = protectRange(editor, range);
    if (last) {
      const caret = placeCaretOutsideMask(last, false);
      if (caret) savedRangeRef.current = caret.cloneRange();
    }
    syncEditor();
    onNotice(wrapped ? "Selection marked for masking." : "That selection was already masked.");
  }

  function openMaskMenu(event: ReactMouseEvent<HTMLDivElement>) {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return;

    const source = range.toString().normalize("NFC");
    if (!wordsIn(source).length) return;
    event.preventDefault();
    savedRangeRef.current = range.cloneRange();
    setMaskMenu({
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - 390)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - 330)),
      source,
      hidden: mappedText(source, mapping),
      twoWay: false,
      error: "",
    });
  }

  function applyHiddenText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!maskMenu) return;
    const editor = editorRef.current;
    const range = restoreSelection();
    if (!editor || !range || range.collapsed) {
      setMaskMenu((current) => current ? { ...current, error: "The selection is no longer available. Select it again." } : current);
      return;
    }

    const sourceWords = wordsIn(maskMenu.source);
    const hiddenWords = wordsIn(maskMenu.hidden);
    if (sourceWords.length !== hiddenWords.length) {
      setMaskMenu((current) => current ? {
        ...current,
        error: `Enter ${sourceWords.length} hidden word${sourceWords.length === 1 ? "" : "s"}; ${hiddenWords.length} found.`,
      } : current);
      return;
    }

    const drafts = sourceWords.flatMap((human, index) => {
      const system = hiddenWords[index]!;
      if (human.toLocaleLowerCase("en") === system.toLocaleLowerCase("en")) return [];
      return [{ human, system, twoWay: maskMenu.twoWay }];
    });
    if (!drafts.length) {
      setMaskMenu((current) => current ? { ...current, error: "Change at least one word in the hidden text." } : current);
      return;
    }

    const result = onAddPairs(drafts);
    if (!result.ok) {
      setMaskMenu((current) => current ? { ...current, error: result.message } : current);
      return;
    }

    const { wrapped } = protectRange(editor, range);
    syncEditor();
    window.getSelection()?.removeAllRanges();
    savedRangeRef.current = null;
    setMaskMenu(null);
    onNotice(`${result.message}. ${wrapped ? "Only the selected text was marked for masking." : "The selected text was already marked for masking."}`);
  }

  function unprotectSelection() {
    const editor = editorRef.current;
    const range = restoreSelection();
    if (!editor || !range) {
      onNotice("Place the cursor in masked text, or select it, then choose Unmask.");
      return;
    }
    const targets = new Set<Element>();
    const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer as Element
      : range.startContainer.parentElement;
    const closest = anchor?.closest('[data-shield="true"]');
    if (closest && editor.contains(closest)) targets.add(closest);
    for (const element of Array.from(editor.querySelectorAll('[data-shield="true"]'))) {
      if (!range.collapsed && range.intersectsNode(element)) targets.add(element);
    }
    for (const element of targets) unwrap(element);
    syncEditor();
    onNotice(targets.size ? "Selected text will export normally." : "No masked text was selected.");
  }

  function maskMappedWords() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = protectMappedWords(editor.innerHTML, mapping);
    syncEditor();
    onNotice("Every mapped word in the document is now marked for masking.");
  }

  function unmaskAll() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = clearProtection(editor.innerHTML);
    syncEditor();
    onNotice("All masking marks were removed. Formatting was kept.");
  }

  function addLink() {
    const href = window.prompt("Paste an https:// link or mailto: address");
    if (!href) return;
    if (!/^(https?:|mailto:)/i.test(href.trim())) {
      onNotice("Links must begin with https://, http://, or mailto:.");
      return;
    }
    runCommand("createLink", href.trim());
  }

  async function insertImage(file: File) {
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type) || file.size > 4_000_000) {
      onNotice("Choose a PNG, JPEG, GIF, or WebP image under 4 MB.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const alt = window.prompt("Short image description (optional)") ?? "";
    insertHtml(`<p><img src="${dataUrl}" alt="${alt.replace(/[<>\"]/g, "")}"></p>`);
    onNotice("Image inserted. Large images are fitted to the page when exported.");
  }

  function updateSettings(patch: Partial<DocumentSettings>) {
    onSettingsChange({ ...settings, ...patch });
  }

  return (
    <div className="rich-composer">
      <div className="editor-toolbar" role="toolbar" aria-label="Document formatting">
        <div className="editor-toolbar__group">
          <select
            aria-label="Paragraph style"
            defaultValue="p"
            onMouseDown={rememberSelection}
            onChange={(event) => runCommand("formatBlock", event.target.value)}
          >
            <option value="p">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="blockquote">Quote</option>
          </select>
          <select
            aria-label="Font family"
            value={settings.bodyFont}
            onMouseDown={rememberSelection}
            onChange={(event) => {
              updateSettings({ bodyFont: event.target.value });
              runCommand("fontName", event.target.value);
            }}
          >
            {FONT_FAMILIES.map((family) => <option value={family} key={family}>{family}</option>)}
          </select>
          <select
            aria-label="Font size"
            value={String(settings.bodySize)}
            onMouseDown={rememberSelection}
            onChange={(event) => {
              const index = FONT_SIZES.indexOf(event.target.value);
              updateSettings({ bodySize: Number(event.target.value) });
              runCommand("fontSize", String(index + 1));
            }}
          >
            {FONT_SIZES.map((size) => <option value={size} key={size}>{size} pt</option>)}
          </select>
        </div>

        <div className="editor-toolbar__group">
          <ToolButton label="B" title="Bold" onRun={() => runCommand("bold")} />
          <ToolButton label="I" title="Italic" onRun={() => runCommand("italic")} />
          <ToolButton label="U" title="Underline" onRun={() => runCommand("underline")} />
          <ToolButton label="S" title="Strikethrough" onRun={() => runCommand("strikeThrough")} />
          <ToolButton label="x₂" title="Subscript" onRun={() => runCommand("subscript")} />
          <ToolButton label="x²" title="Superscript" onRun={() => runCommand("superscript")} />
          <label className="editor-color" title="Text colour">
            <span>A</span>
            <input aria-label="Text colour" type="color" defaultValue="#151713" onMouseDown={rememberSelection} onChange={(event) => runCommand("foreColor", event.target.value)} />
          </label>
          <label className="editor-color editor-color--highlight" title="Highlight colour">
            <span>H</span>
            <input aria-label="Highlight colour" type="color" defaultValue="#fff19a" onMouseDown={rememberSelection} onChange={(event) => runCommand("hiliteColor", event.target.value)} />
          </label>
        </div>

        <div className="editor-toolbar__group">
          <ToolButton label="≡L" title="Align left" onRun={() => runCommand("justifyLeft")} />
          <ToolButton label="≡C" title="Align centre" onRun={() => runCommand("justifyCenter")} />
          <ToolButton label="≡R" title="Align right" onRun={() => runCommand("justifyRight")} />
          <ToolButton label="≡J" title="Justify" onRun={() => runCommand("justifyFull")} />
          <ToolButton label="• List" title="Bulleted list" onRun={() => runCommand("insertUnorderedList")} />
          <ToolButton label="1. List" title="Numbered list" onRun={() => runCommand("insertOrderedList")} />
          <ToolButton label="←" title="Decrease indent" onRun={() => runCommand("outdent")} />
          <ToolButton label="→" title="Increase indent" onRun={() => runCommand("indent")} />
        </div>

        <div className="editor-toolbar__group">
          <ToolButton label="Link" title="Add link to selected text" onRun={addLink} />
          <ToolButton label="Table" title="Insert a 2 by 2 table" onRun={() => insertHtml("<table><tbody><tr><td>Cell</td><td>Cell</td></tr><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p><br></p>")} />
          <ToolButton label="Image" title="Insert an image" onRun={() => imageInputRef.current?.click()} />
          <ToolButton label="Page break" title="Insert a page break" onRun={() => insertHtml('<div data-page-break="true"><span>Page break</span></div><p><br></p>')} />
          <ToolButton label="Undo" title="Undo" onRun={() => runCommand("undo")} />
          <ToolButton label="Redo" title="Redo" onRun={() => runCommand("redo")} />
          <ToolButton label="Clear format" title="Remove formatting from selection" onRun={() => runCommand("removeFormat")} />
        </div>

        <div className="editor-toolbar__group editor-toolbar__group--masking">
          <ToolButton label="Mask selection" title="Encode the selected text when exported" onRun={protectSelection} />
          <ToolButton label="Unmask" title="Keep selected text as ordinary text when exported" onRun={unprotectSelection} />
          <ToolButton label="Mask mapped words" title="Mask every word that appears in the custom mapping" onRun={maskMappedWords} />
          <ToolButton label="Clear masking" title="Remove all masking marks" onRun={unmaskAll} />
        </div>
      </div>

      <input
        ref={imageInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void insertImage(file);
          event.target.value = "";
        }}
      />

      <div className="page-settings" aria-label="Page settings">
        <label>Page
          <select value={settings.pageSize} onChange={(event) => updateSettings({ pageSize: event.target.value as DocumentSettings["pageSize"] })}>
            <option value="a4">A4</option><option value="letter">US Letter</option>
          </select>
        </label>
        <label>Layout
          <select value={settings.orientation} onChange={(event) => updateSettings({ orientation: event.target.value as DocumentSettings["orientation"] })}>
            <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
          </select>
        </label>
        <label>Margins
          <select value={settings.margin} onChange={(event) => updateSettings({ margin: event.target.value as DocumentSettings["margin"] })}>
            <option value="normal">Normal</option><option value="narrow">Narrow</option><option value="wide">Wide</option>
          </select>
        </label>
        <label>Spacing
          <select value={String(settings.lineHeight)} onChange={(event) => updateSettings({ lineHeight: Number(event.target.value) })}>
            <option value="1">Single</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">Double</option>
          </select>
        </label>
      </div>

      <div className="editor-stage">
        <div
          ref={editorRef}
          className="document-page"
          style={pageStyle}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Document content"
          spellCheck
          onInput={(event) => {
            repairMaskBoundaryInsertion(event.currentTarget);
            syncEditor();
          }}
          onKeyDown={(event) => {
            if (!event.nativeEvent.isComposing && !event.metaKey && !event.ctrlKey && !event.altKey
              && (event.key.length === 1 || event.key === "Enter")) {
              stageMaskBoundaryInsertion(event.currentTarget);
            }
            rememberSelection();
          }}
          onCompositionStart={(event) => stageMaskBoundaryInsertion(event.currentTarget)}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onContextMenu={openMaskMenu}
          onFocus={rememberSelection}
          onBlur={syncEditor}
          onPaste={(event) => {
            event.preventDefault();
            if (stageMaskBoundaryInsertion(event.currentTarget)) rememberSelection();
            const rich = event.clipboardData.getData("text/html");
            const plain = event.clipboardData.getData("text/plain");
            insertHtml(rich ? sanitizeRichHtml(rich) : plain.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>"));
          }}
        />
      </div>

      {maskMenu ? (
        <div
          className="mask-menu-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setMaskMenu(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMaskMenu(null);
          }}
        >
          <form
            className="mask-menu"
            style={{ left: `${maskMenu.x}px`, top: `${maskMenu.y}px` }}
            role="dialog"
            aria-labelledby="mask-menu-title"
            onSubmit={applyHiddenText}
            onContextMenu={(event) => event.preventDefault()}
          >
            <header>
              <strong id="mask-menu-title">Set hidden-layer text</strong>
              <button type="button" aria-label="Close hidden text menu" onClick={() => setMaskMenu(null)}>×</button>
            </header>
            <p className="mask-menu__selection" title={maskMenu.source}>Selected: “{maskMenu.source}”</p>
            <label className="mask-menu__field">
              <span>Hidden layer reads</span>
              <textarea
                ref={hiddenInputRef}
                rows={2}
                value={maskMenu.hidden}
                spellCheck
                onChange={(event) => setMaskMenu((current) => current ? { ...current, hidden: event.target.value, error: "" } : current)}
              />
            </label>
            <p className="mask-menu__hint">Keep the same number of words. Spacing and punctuation stay as selected.</p>
            <label className="mask-menu__toggle">
              <input
                type="checkbox"
                checked={maskMenu.twoWay}
                onChange={(event) => setMaskMenu((current) => current ? { ...current, twoWay: event.target.checked } : current)}
              />
              <span>Also use these pairs in reverse</span>
            </label>
            {maskMenu.error ? <p className="mask-menu__error" role="alert">{maskMenu.error}</p> : null}
            <footer>
              <button type="button" onClick={() => setMaskMenu(null)}>Cancel</button>
              <button className="mask-menu__apply" type="submit">Add pairs + mask selection</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
