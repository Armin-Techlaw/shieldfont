# ShieldFont Studio

A local-first custom-mapping authoring workspace built on `@shieldfont/core`.

## What it does

- Create and keep multiple human-word → system-word mapping sets, with an
  optional two-way setting per pair.
- Restore the workspace from browser storage on the next visit.
- Compose in a Word-like rich editor with headings, inline styles, colours,
  alignment, lists, indentation, links, tables, images, and page breaks.
- Select individual words or passages, right-click, type the hidden-layer text,
  and add the changed pairs while masking only that selection. Unmarked text
  remains ordinary text in every export.
- Preview the formatted human document and encoded machine view side by side.
- Import/export mapping JSON and private project backups.
- Attach a matching custom WOFF2 or TTF for a real font-rendered preview.
- Build and download a matching installable desktop TTF from a licensed base
  font without leaving the studio.
- Export encoded TXT, Markdown, RTF, HTML snippets, CSS, mapping JSON, CSV,
  standalone HTML, formatted Word DOCX, SVG, EPUB, a font-build ZIP, and a
  formatted PDF.

The PDF draws the formatted human-readable pages as images and adds the encoded
text as an invisible text layer. Text extraction therefore gets the decoy,
while a reader sees the original. OCR and vision models can still read the
visible page; this is friction, not a lock.

## Run it

```bash
cd examples/nextjs-demo
pnpm install
python3 -m venv .venv-font-builder
.venv-font-builder/bin/pip install -r ../../requirements.txt
pnpm dev
```

On Windows, activate or install into `.venv-font-builder` with its
`Scripts\\python.exe` and `Scripts\\pip.exe` executables. You can instead point
the app at another prepared Python interpreter with `SHIELDFONT_PYTHON`.

The predev/prebuild step compiles `@shieldfont/core` and copies the existing
neutral Optik web font into `public/fonts/`.

## Custom-font workflow

1. Compose the document, select the words or passage to change, then right-click
   and enter the hidden-layer wording. Pairs are one-way unless you enable the
   two-way setting.
2. Click **Build + download desktop TTF** and choose a licensed Regular `.ttf`
   base font. The app runs `scripts/generate_font.py` locally and downloads the
   matching ShieldFont TTF.
3. The generated TTF is attached to the preview automatically.
4. Confirm the rendered preview matches the human preview.
5. Export HTML, formatted DOCX, SVG, EPUB, PDF, or the complete bundle. RTF is
   available as a plain-text compatibility fallback.

## Microsoft Word

Word uses fonts installed in the operating system; there is no separate
Word-only font installation step.

1. On macOS, open the downloaded `.ttf` in Font Book and click **Install**. On
   Windows, right-click the `.ttf` and choose **Install**, or add it through the
   Windows Fonts settings/folder.
2. Quit and reopen Word so it refreshes its font menu.
3. Install the TTF before opening the studio's **Formatted Word DOCX**. The
   DOCX preserves headings, text styling, lists, tables, images, and page setup.
   Only masked runs contain encoded text and select the generated family.

Do not type plain English directly while the shielded family is selected. A
ShieldFont font is paired with encoded text: compose in the studio, then export
the DOCX or paste the encoded text into Word and choose the generated family.

The mapping and font must always be built and deployed as a pair. The studio is
an authoring tool: it is acceptable for the encoder to run in this private UI,
but a production page must store and serve the already-encoded text. Never ship
a browser-runtime encoder as the scraping-friction mechanism.

## Limits

ShieldFont raises the cost of casual scraping and makes a consent/provenance
statement. It is not un-scrapeable. Masked content also breaks normal SEO,
copy/paste, find-in-page, translation, Reader Mode, and WCAG 2.2 SC 1.3.1. Do
not use it on content covered by an accessibility conformance claim or law.
