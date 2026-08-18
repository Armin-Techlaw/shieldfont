# ShieldFont Studio

A local-first custom-mapping authoring workspace built on `@shieldfont/core`.

## What it does

- Create and keep multiple human-word → system-word mapping sets, with an
  optional two-way setting per pair.
- Restore the workspace from browser storage on the next visit.
- Compose in a Word-like rich editor with headings, inline styles, colours,
  alignment, lists, indentation, links, tables, images, and page breaks.
- Select individual words or passages, right-click, type the hidden-layer text,
  and add the changed pairs. Common words are skipped by default; if the hidden
  text is longer, masking continues through the next eligible words unless you
  choose to stay inside the selection. Unmarked text remains ordinary text in
  every export.
- Preview the formatted human document and encoded machine view side by side.
- Import/export mapping JSON and private project backups.
- Build and attach a mapping-specific desktop TTF automatically from the
  included Arimo Regular base font.
- Optionally build from another licensed base TTF or attach a previously built
  matching ShieldFont for preview.
- Export encoded TXT, Markdown, RTF, HTML snippets, CSS, mapping JSON, CSV,
  portable HTML and Word files, SVG, EPUB, a decoy-upload kit, a font-build
  ZIP, and a formatted PDF.

Portable HTML, DOCX, EPUB, SVG, and PDF output is designed to preserve the human
view. When a file contains the mapping-specific font, it also contains the
decoder: a renderer, OCR pipeline, vision model, or font inspector can recover
the human-facing words. Use the **Decoy-upload kit** when the uploaded file
itself should omit that font. PDF is presentation-only for this purpose because
a vision-capable model can read the same human-visible page that a person can.

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

The predev/prebuild step compiles `@shieldfont/core`, copies the existing
neutral Optik web font into `public/fonts/`, and publishes the bundled Arimo
source font used by the local builder.

## Custom-font workflow

1. Compose the document, select the words or passage to change, then right-click
   and enter the hidden-layer wording. Pairs are one-way unless you enable the
   two-way setting.
2. For a direct font download, click **Build + download matching Arimo TTF**.
   For a formatted export, you can skip this step: the export builds the same
   mapping-specific Arimo TTF automatically.
3. The generated TTF is attached to the preview automatically. **Do not attach
   the raw `Arimo-VariableFont_wght.ttf` as an existing ShieldFont.** It is only
   the source face and has no mapping ligatures, so it displays the encoded
   words.
4. Confirm the rendered preview matches the human preview.
5. Choose the export for the actual goal: use **Decoy-upload kit** for a DOCX or
   HTML model upload; use the portable exports for convenient human-readable
   sharing. For PDF, choose **Presentation PDF**, then **Save as PDF** in the
   browser dialog. RTF is a plain-text compatibility fallback.

## Decoy-upload workflow

The decoy-upload ZIP deliberately keeps the mapping font separate from its
DOCX and HTML. The upload copies contain encoded marked words and reference the
font by its unique local family name, but contain no TTF bytes or external font
URL.

1. Finish every word pair, format the document, and mark the intended words.
2. Open **Export** and choose **Decoy-upload kit**. The Studio builds the exact
   mapping-specific Arimo TTF automatically.
3. Extract the ZIP privately. Never upload the ZIP itself.
4. Install the file beginning `1-INSTALL-LOCALLY-DO-NOT-UPLOAD-` with Font Book
   on macOS or Fonts on Windows.
5. Fully quit and reopen Word and/or the browser, then open either
   `2-UPLOAD-THIS-...-decoy.docx` or `2-UPLOAD-THIS-...-decoy.html`. The installed
   local font should make the marked words render as their human version.
6. Upload only the original untouched `2-UPLOAD-THIS` file. Never upload the
   TTF: it contains the decoder. Do not resave the DOCX before uploading it,
   because Word can embed the locally installed font during Save As.
7. If the project name, base font, or any pair changes, discard the old kit and
   generate a new one. Each build has a unique internal font-family revision to
   avoid operating-system and Word font-cache collisions.

The no-font HTML/DOCX is useful only when the upload service does not also have
the local TTF. It raises extraction cost; it cannot guarantee that a capable
model will never infer or recover the mapping. For the strongest decoy-only
input, upload the encoded TXT instead; it intentionally has no human-rendered
view or formatting. If a PDF container is mandatory, choose **Encoded-only
PDF**, then **Save as PDF** in the print dialog: both its visible page and text
layer use decoys. **Presentation PDF** keeps the human view, which means OCR
and vision-capable models can read it.

## Microsoft Word

There are two intentionally different Word outputs:

- **Decoy-upload kit:** its DOCX contains no font bytes. Raw OOXML and ordinary
  text extractors receive the encoded words. It renders the human view only on
  a computer where the separately supplied TTF has been installed. Upload only
  the untouched DOCX, never the TTF.
- **Portable Word DOCX:** embeds the TTF using Word's obfuscated-font format, so
  it opens human-readable on another machine without installation. The raw
  OOXML is still encoded, but a render-, OCR-, or vision-capable GenAI can use
  the embedded font and read the human-facing result. Do not use this mode when
  the model upload should lack the decoder.

Both preserve headings, text styling, lists, tables, images, and page setup.
Only marked runs contain encoded text and select the mapping-specific family.
If a custom TTF's OS/2 license flags prohibit embedding, the portable export
stops with a clear error; the no-font upload copy remains conceptually valid.

The desktop TTF is a Regular cut. Bold and italic formatting on masked runs is
therefore omitted in DOCX output; unmasked text keeps its formatting.

Do not type plain English directly while the shielded family is selected. A
ShieldFont font is paired with encoded text: compose in the studio, then export
the DOCX. If you paste encoded text into a different Word file instead, install
the TTF first and choose the generated family.

The bundled Arimo source is Copyright 2020 The Arimo Project Authors and is
licensed under the SIL Open Font License 1.1; its copy is stored beside the
font under `assets/fonts/`.

The mapping and font must always be built as a pair. For a published human-view
page the encoded HTML and font are deployed together; for the decoy-upload
workflow the exact same font stays installed only on the author's device. The
studio is an authoring tool: it is acceptable for the encoder to run in this
private UI, but a production page must store and serve the already-encoded
text. Never ship a browser-runtime encoder as the scraping-friction mechanism.

## Limits

ShieldFont raises the cost of casual scraping and makes a consent/provenance
statement. It is not un-scrapeable. Masked content also breaks normal SEO,
copy/paste, find-in-page, translation, Reader Mode, and WCAG 2.2 SC 1.3.1. Do
not use it on content covered by an accessibility conformance claim or law.
