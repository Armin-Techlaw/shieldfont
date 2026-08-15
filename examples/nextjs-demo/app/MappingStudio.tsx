"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { RichComposer } from "./RichComposer";
import {
  type AttachedFont,
  type ExportContext,
  type MappingPair,
  encodedHtmlSnippet,
  exportCss,
  exportCsv,
  exportDecoyUploadKit,
  exportDesktopFont,
  exportEncodedText,
  exportEncodedOnlyPdf,
  exportEpub,
  exportFontKit,
  exportHtml,
  exportMapping,
  exportMarkdown,
  exportProject,
  exportPresentationPdf,
  exportRtf,
  exportSvg,
  exportWordDocx,
  mappingJson,
  slugify,
} from "./exporters";
import {
  DEFAULT_DOCUMENT_SETTINGS,
  type DocumentSettings,
  legacyDocumentSnapshot,
  normalizeDocumentSettings,
  plainTextFromRichHtml,
  protectMappedWords,
  richDocumentSnapshot,
  sanitizeRichHtml,
  sourceToRichHtml,
} from "./richText";

type StudioProject = {
  id: string;
  name: string;
  source: string;
  richHtml?: string;
  documentSettings?: DocumentSettings;
  pairs: MappingPair[];
  updatedAt: string;
};

type StoredWorkspace = {
  version: 1 | 2 | 3;
  currentId: string;
  projects: StudioProject[];
};

type PairDraft = Pick<MappingPair, "human" | "system" | "twoWay">;

type AddPairsResult = {
  ok: boolean;
  message: string;
};

const STORAGE_KEY = "shieldfont-studio-workspace-v1";
const WORD_PATTERN = /^\p{L}+$/u;
const DEFAULT_BASE_FONT_URL = "/fonts/arimo-variable-wght.ttf";
const DEFAULT_BASE_FONT_FILE_NAME = "Arimo-VariableFont_wght.ttf";
const DEFAULT_BASE_FONT_LABEL = "Included Arimo Regular";

const STARTER_PROJECT: StudioProject = {
  id: "starter-mapping",
  name: "Editorial garden",
  source: "The author will protect every piece of writing. The future belongs to readers.",
  richHtml: '<h1>A document you can shape</h1><p>The <span data-shield="true">author</span> will <span data-shield="true">protect</span> every piece of <span data-shield="true">writing</span>. The <span data-shield="true">future</span> belongs to readers.</p><p><strong>Format normally.</strong> Select only the words you want to mask, then export to Word or PDF.</p>',
  documentSettings: DEFAULT_DOCUMENT_SETTINGS,
  pairs: [
    { id: "pair-author", human: "author", system: "gardener" },
    { id: "pair-protect", human: "protect", system: "disturb" },
    { id: "pair-writing", human: "writing", system: "weather" },
    { id: "pair-future", human: "future", system: "harbour" },
  ],
  updatedAt: "2026-08-13T00:00:00.000Z",
};

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validatePairs(pairs: MappingPair[]) {
  const issues: Record<string, string> = {};
  const claimed = new Map<string, string>();
  const validPairs: MappingPair[] = [];

  for (const pair of pairs) {
    const human = pair.human.trim().toLocaleLowerCase("en");
    const system = pair.system.trim().toLocaleLowerCase("en");
    if (!human && !system) continue;
    if (!human || !system) {
      issues[pair.id] = "Both words are required.";
      continue;
    }
    if (!WORD_PATTERN.test(human) || !WORD_PATTERN.test(system)) {
      issues[pair.id] = "Use one word made of letters on each side.";
      continue;
    }
    if (human === system) {
      issues[pair.id] = "The human and system words must be different.";
      continue;
    }
    const humanOwner = claimed.get(human);
    const systemOwner = claimed.get(system);
    if ((humanOwner && humanOwner !== pair.id) || (systemOwner && systemOwner !== pair.id)) {
      issues[pair.id] = "A word can belong to only one pair.";
      continue;
    }
    claimed.set(human, pair.id);
    claimed.set(system, pair.id);
    validPairs.push({ ...pair, human, system, twoWay: Boolean(pair.twoWay) });
  }

  const mapping: Record<string, string> = {};
  for (const pair of validPairs) {
    mapping[pair.human] = pair.system;
    if (pair.twoWay) mapping[pair.system] = pair.human;
  }
  return { issues, validPairs, mapping };
}

function pairsFromFlatMapping(value: Record<string, unknown>): MappingPair[] {
  const seen = new Set<string>();
  const pairs: MappingPair[] = [];
  for (const [leftRaw, rightRaw] of Object.entries(value)) {
    if (leftRaw.startsWith("_") || typeof rightRaw !== "string") continue;
    const left = leftRaw.trim().toLocaleLowerCase("en");
    const right = rightRaw.trim().toLocaleLowerCase("en");
    if (!left || !right || left === right || seen.has(left) || seen.has(right)) continue;
    const twoWay = typeof value[right] === "string"
      && String(value[right]).trim().toLocaleLowerCase("en") === left;
    pairs.push({ id: makeId("pair"), human: left, system: right, twoWay });
    seen.add(left);
    seen.add(right);
  }
  return pairs;
}

function ExportTile({
  title,
  detail,
  badge,
  disabled,
  onClick,
}: {
  title: string;
  detail: string;
  badge?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="export-tile" type="button" disabled={disabled} onClick={onClick}>
      <span className="export-tile__top">
        <span>{title}</span>
        {badge ? <small>{badge}</small> : null}
      </span>
      <span className="export-tile__detail">{detail}</span>
      <span className="export-tile__arrow" aria-hidden="true">↗</span>
    </button>
  );
}

export function MappingStudio() {
  const [projects, setProjects] = useState<StudioProject[]>([STARTER_PROJECT]);
  const [currentId, setCurrentId] = useState(STARTER_PROJECT.id);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [font, setFont] = useState<AttachedFont | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [busyExport, setBusyExport] = useState<string | null>(null);
  const [buildingFont, setBuildingFont] = useState(false);
  const [notice, setNotice] = useState("Ready");
  const importInput = useRef<HTMLInputElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const baseFontInput = useRef<HTMLInputElement>(null);
  const loadedFontFace = useRef<FontFace | null>(null);
  const fontBuildSequence = useRef(0);
  const previousFontBuildKey = useRef<string | null>(null);

  const project = projects.find((candidate) => candidate.id === currentId) ?? projects[0] ?? STARTER_PROJECT;
  const { issues, validPairs, mapping } = useMemo(() => validatePairs(project.pairs), [project.pairs]);
  const documentSettings = normalizeDocumentSettings(project.documentSettings);
  const richHtml = useMemo(() => {
    if (project.richHtml) return sanitizeRichHtml(project.richHtml);
    const legacyHtml = sourceToRichHtml(project.source);
    return workspaceReady ? protectMappedWords(legacyHtml, mapping) : legacyHtml;
  }, [mapping, project.richHtml, project.source, workspaceReady]);
  const snapshot = useMemo(
    () => workspaceReady
      ? richDocumentSnapshot(richHtml, mapping)
      : legacyDocumentSnapshot(plainTextFromRichHtml(richHtml), mapping),
    [mapping, richHtml, workspaceReady],
  );
  const { source, encoded, encodedHtml, swapped, protectedTokenCount } = snapshot;
  const issueCount = Object.keys(issues).length;
  const canExport = Boolean(source.trim()) && issueCount === 0 && validPairs.length > 0;

  const exportContext: ExportContext = {
    projectId: project.id,
    name: project.name.trim() || "Untitled mapping",
    source,
    encoded,
    richHtml,
    documentSettings,
    pairs: validPairs,
    mapping,
    font,
  };
  const fontBuildKey = useMemo(() => JSON.stringify({
    projectId: project.id,
    familyName: `ShieldFont ${project.name.trim() || "Custom"}`,
    mapping: Object.entries(mapping).sort(([left], [right]) => left.localeCompare(right)),
  }), [mapping, project.id, project.name]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as StoredWorkspace;
        if ((parsed.version === 1 || parsed.version === 2 || parsed.version === 3) && Array.isArray(parsed.projects) && parsed.projects.length) {
          const migrated = parsed.projects.map((savedProject) => {
            const pairs = savedProject.pairs.map((pair) => ({
              ...pair,
              twoWay: parsed.version < 3 ? true : Boolean(pair.twoWay),
            }));
            return {
              ...savedProject,
              pairs,
              richHtml: savedProject.richHtml ?? protectMappedWords(sourceToRichHtml(savedProject.source), validatePairs(pairs).mapping),
              documentSettings: normalizeDocumentSettings(savedProject.documentSettings),
            };
          });
          setProjects(migrated);
          setCurrentId(migrated.some((item) => item.id === parsed.currentId) ? parsed.currentId : migrated[0]!.id);
        }
      }
    } catch {
      setNotice("Saved workspace could not be read; the starter mapping is open.");
    } finally {
      setWorkspaceReady(true);
    }
  }, []);

  useEffect(() => {
    if (!workspaceReady) return;
    const timer = window.setTimeout(() => {
      try {
        const workspace: StoredWorkspace = { version: 3, currentId, projects };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      } catch {
        setNotice("This document is too large for browser storage. Export a private project backup before leaving.");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [currentId, projects, workspaceReady]);

  useEffect(() => {
    if (!exportOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExportOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [exportOpen]);

  useEffect(() => {
    return () => {
      if (loadedFontFace.current) document.fonts.delete(loadedFontFace.current);
    };
  }, []);

  useEffect(() => {
    if (previousFontBuildKey.current === null) {
      previousFontBuildKey.current = fontBuildKey;
      return;
    }
    if (previousFontBuildKey.current === fontBuildKey) return;
    previousFontBuildKey.current = fontBuildKey;
    fontBuildSequence.current += 1;
    if (!font || font.buildKey === fontBuildKey) return;
    if (loadedFontFace.current) document.fonts.delete(loadedFontFace.current);
    loadedFontFace.current = null;
    setFont(null);
    setNotice("The mapping changed. A fresh Arimo font will be built automatically on the next export.");
  }, [font?.buildKey, fontBuildKey]);

  function updateProject(patch: Partial<StudioProject>) {
    setProjects((existing) =>
      existing.map((candidate) =>
        candidate.id === project.id
          ? { ...candidate, ...patch, updatedAt: new Date().toISOString() }
          : candidate,
      ),
    );
  }

  function updatePair(id: string, field: "human" | "system" | "twoWay", value: string | boolean) {
    updateProject({
      pairs: project.pairs.map((pair) => (pair.id === id ? { ...pair, [field]: value } : pair)),
    });
  }

  function addPair() {
    updateProject({ pairs: [...project.pairs, { id: makeId("pair"), human: "", system: "", twoWay: false }] });
  }

  function addPairsFromSelection(drafts: PairDraft[]): AddPairsResult {
    const nextPairs = project.pairs.map((pair) => ({ ...pair }));
    let added = 0;
    let upgraded = 0;

    for (const draft of drafts) {
      const human = draft.human.trim().toLocaleLowerCase("en");
      const system = draft.system.trim().toLocaleLowerCase("en");
      if (!WORD_PATTERN.test(human) || !WORD_PATTERN.test(system) || human === system) {
        return { ok: false, message: "Each changed selection word needs one different letter-only hidden word." };
      }

      const same = nextPairs.find((pair) =>
        pair.human.trim().toLocaleLowerCase("en") === human
        && pair.system.trim().toLocaleLowerCase("en") === system,
      );
      if (same) {
        if (draft.twoWay && !same.twoWay) {
          same.twoWay = true;
          upgraded += 1;
        }
        continue;
      }

      const reverse = nextPairs.find((pair) =>
        pair.human.trim().toLocaleLowerCase("en") === system
        && pair.system.trim().toLocaleLowerCase("en") === human,
      );
      if (reverse && draft.twoWay) {
        if (!reverse.twoWay) {
          reverse.twoWay = true;
          upgraded += 1;
        }
        continue;
      }
      if (reverse) {
        return { ok: false, message: `“${system}” → “${human}” already exists. Make that pair two-way to use it in reverse.` };
      }

      const owner = nextPairs.find((pair) => {
        const left = pair.human.trim().toLocaleLowerCase("en");
        const right = pair.system.trim().toLocaleLowerCase("en");
        return left === human || right === human || left === system || right === system;
      });
      if (owner) {
        return { ok: false, message: `“${human}” or “${system}” already belongs to another pair.` };
      }

      nextPairs.push({ id: makeId("pair"), human, system, twoWay: Boolean(draft.twoWay) });
      added += 1;
    }

    const result = validatePairs(nextPairs);
    if (Object.keys(result.issues).length) {
      return { ok: false, message: "Those hidden words conflict with an existing pair." };
    }
    updateProject({ pairs: nextPairs });
    const changes = [
      added ? `${added} pair${added === 1 ? "" : "s"} added` : "",
      upgraded ? `${upgraded} made two-way` : "",
    ].filter(Boolean).join("; ");
    return { ok: true, message: changes || "Existing word pairs reused" };
  }

  function removePair(id: string) {
    updateProject({ pairs: project.pairs.filter((pair) => pair.id !== id) });
  }

  function newProject() {
    const next: StudioProject = {
      id: makeId("mapping"),
      name: `Custom mapping ${projects.length + 1}`,
      source: "",
      richHtml: "<p><br></p>",
      documentSettings: DEFAULT_DOCUMENT_SETTINGS,
      pairs: [{ id: makeId("pair"), human: "", system: "", twoWay: false }],
      updatedAt: new Date().toISOString(),
    };
    setProjects((existing) => [...existing, next]);
    setCurrentId(next.id);
    detachFontForProjectChange();
    setNotice("New mapping created.");
  }

  function duplicateProject() {
    const copy: StudioProject = {
      ...project,
      id: makeId("mapping"),
      name: `${project.name} copy`,
      pairs: project.pairs.map((pair) => ({ ...pair, id: makeId("pair") })),
      updatedAt: new Date().toISOString(),
    };
    setProjects((existing) => [...existing, copy]);
    setCurrentId(copy.id);
    detachFontForProjectChange();
    setNotice("Mapping duplicated.");
  }

  function deleteProject() {
    if (projects.length === 1) {
      setNotice("Keep at least one mapping in the workspace.");
      return;
    }
    if (!window.confirm(`Delete “${project.name}” from this device?`)) return;
    const remaining = projects.filter((candidate) => candidate.id !== project.id);
    setProjects(remaining);
    setCurrentId(remaining[0]!.id);
    detachFontForProjectChange();
    setNotice("Mapping deleted.");
  }

  async function importProject(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      let next: StudioProject;
      if (parsed.kind === "shieldfont-studio-project" && Array.isArray(parsed.pairs)) {
        const projectVersion = typeof parsed.version === "number" ? parsed.version : 2;
        next = {
          id: makeId("mapping"),
          name: typeof parsed.name === "string" ? `${parsed.name} imported` : "Imported mapping",
          source: typeof parsed.source === "string" ? parsed.source : "",
          richHtml: typeof parsed.richHtml === "string"
            ? sanitizeRichHtml(parsed.richHtml)
            : sourceToRichHtml(typeof parsed.source === "string" ? parsed.source : ""),
          documentSettings: normalizeDocumentSettings(
            parsed.documentSettings && typeof parsed.documentSettings === "object"
              ? parsed.documentSettings as Partial<DocumentSettings>
              : undefined,
          ),
          pairs: (parsed.pairs as Array<Partial<MappingPair>>).map((pair) => ({
            id: makeId("pair"),
            human: typeof pair.human === "string" ? pair.human : "",
            system: typeof pair.system === "string" ? pair.system : "",
            twoWay: projectVersion < 3 ? true : Boolean(pair.twoWay),
          })),
          updatedAt: new Date().toISOString(),
        };
      } else {
        const pairs = pairsFromFlatMapping(parsed);
        if (!pairs.length) throw new Error("No word pairs were found in that JSON file.");
        const meta = parsed._meta as { variant?: unknown } | undefined;
        next = {
          id: makeId("mapping"),
          name: typeof meta?.variant === "string" ? `${meta.variant} imported` : "Imported mapping",
          source: "",
          richHtml: "<p><br></p>",
          documentSettings: DEFAULT_DOCUMENT_SETTINGS,
          pairs,
          updatedAt: new Date().toISOString(),
        };
      }
      setProjects((existing) => [...existing, next]);
      setCurrentId(next.id);
      detachFontForProjectChange();
      setNotice(`Imported ${next.pairs.length} word pairs.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That file could not be imported.");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  async function attachFont(
    file: File,
    desktopFamilyName?: string,
    buildKey?: string,
    baseLabel?: string,
    expectedBuildSequence?: number,
  ): Promise<AttachedFont | null> {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (extension !== "woff2" && extension !== "ttf") {
      setNotice("Choose a matching .woff2 or .ttf font.");
      return null;
    }
    if (!desktopFamilyName && file.name.toLowerCase() === DEFAULT_BASE_FONT_FILE_NAME.toLowerCase()) {
      setNotice("That is the raw Arimo base font. Use “Build matching Arimo font” so ShieldFont can add this mapping first.");
      return null;
    }
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const familyName = `ShieldStudio-${project.id.replace(/[^a-zA-Z0-9]/g, "").slice(-18)}`;
      const face = new FontFace(familyName, buffer);
      await face.load();
      if (expectedBuildSequence !== undefined && expectedBuildSequence !== fontBuildSequence.current) return null;
      if (loadedFontFace.current) document.fonts.delete(loadedFontFace.current);
      document.fonts.add(face);
      loadedFontFace.current = face;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const attached: AttachedFont = {
        familyName,
        desktopFamilyName,
        buildKey,
        baseLabel,
        fileName: file.name,
        extension,
        mimeType: file.type || (extension === "ttf" ? "font/ttf" : "font/woff2"),
        bytes,
        dataUrl,
      };
      setFont(attached);
      setNotice(buildKey
        ? "Matching Arimo font ready. Compare the rendered preview before exporting."
        : "Matching font attached. Compare the rendered preview before exporting.");
      return attached;
    } catch {
      setNotice("The browser could not load that font file.");
      return null;
    } finally {
      if (fontInput.current) fontInput.current.value = "";
    }
  }

  async function includedArimoFile(): Promise<File> {
    const response = await fetch(DEFAULT_BASE_FONT_URL, { cache: "force-cache" });
    if (!response.ok) throw new Error("The included Arimo base font could not be loaded.");
    return new File([await response.blob()], DEFAULT_BASE_FONT_FILE_NAME, { type: "font/ttf" });
  }

  async function buildDesktopFont(baseFont?: File, download = true): Promise<AttachedFont> {
    if (!canExport) {
      throw new Error("Add valid word pairs and source text before building a desktop font.");
    }
    const selectedBaseFont = baseFont ?? await includedArimoFile();
    if (!selectedBaseFont.name.toLowerCase().endsWith(".ttf")) {
      throw new Error("Choose a licensed Regular TrueType (.ttf) base font.");
    }
    const desktopFamilyName = `ShieldFont ${project.name.trim() || "Custom"}`;
    const requestSequence = ++fontBuildSequence.current;
    const requestedBuildKey = fontBuildKey;
    try {
      setBuildingFont(true);
      setNotice(baseFont ? "Building from your selected base TTF…" : "Building the matching Arimo font…");
      const form = new FormData();
      form.set("baseFont", selectedBaseFont);
      form.set("mapping", mappingJson(exportContext));
      form.set("familyName", desktopFamilyName);
      const response = await fetch("/api/build-font", { method: "POST", body: form });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "The desktop font could not be built.");
      }
      const buffer = await response.arrayBuffer();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? `shieldfont-${slugify(project.name)}.ttf`;
      const responseFamily = response.headers.get("X-ShieldFont-Family");
      let exactDesktopFamilyName = desktopFamilyName;
      if (responseFamily) {
        try {
          exactDesktopFamilyName = decodeURIComponent(responseFamily);
        } catch {
          exactDesktopFamilyName = responseFamily;
        }
      }
      if (requestSequence !== fontBuildSequence.current) {
        throw new Error("The mapping changed while the font was building. Try the export again to build the current mapping.");
      }
      const builtFile = new File([buffer], fileName, { type: "font/ttf" });
      const attached = await attachFont(
        builtFile,
        exactDesktopFamilyName,
        requestedBuildKey,
        baseFont?.name ?? DEFAULT_BASE_FONT_LABEL,
        requestSequence,
      );
      if (!attached) throw new Error("The font was built but the browser could not load it.");
      if (download) {
        exportDesktopFont({ ...exportContext, font: attached });
        setNotice(`Desktop font built and downloaded as ${fileName}.`);
      } else {
        setNotice("Matching Arimo font built and attached automatically.");
      }
      return attached;
    } finally {
      setBuildingFont(false);
      if (baseFontInput.current) baseFontInput.current.value = "";
    }
  }

  async function ensureMatchingFont(requireDesktop = false): Promise<AttachedFont> {
    const currentFontIsUsable = font
      && font.buildKey === fontBuildKey
      && (!requireDesktop || (font.extension === "ttf" && Boolean(font.desktopFamilyName)));
    if (currentFontIsUsable) return font;
    return buildDesktopFont(undefined, false);
  }

  async function withMatchingFont(
    action: (context: ExportContext) => void | Promise<void>,
    requireDesktop = false,
  ): Promise<void> {
    const matchingFont = await ensureMatchingFont(requireDesktop);
    await action({ ...exportContext, font: matchingFont });
  }

  function clearFont() {
    fontBuildSequence.current += 1;
    if (loadedFontFace.current) document.fonts.delete(loadedFontFace.current);
    loadedFontFace.current = null;
    setFont(null);
    setNotice("Font detached. Your mapping is unchanged.");
  }

  function detachFontForProjectChange() {
    fontBuildSequence.current += 1;
    if (loadedFontFace.current) document.fonts.delete(loadedFontFace.current);
    loadedFontFace.current = null;
    setFont(null);
  }

  async function copyValue(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
    } catch {
      setNotice("Clipboard access was blocked by the browser.");
    }
  }

  async function runExport(label: string, action: () => void | Promise<void>) {
    if (!canExport) {
      setNotice("Add valid word pairs and some source text before exporting.");
      return;
    }
    try {
      setBusyExport(label);
      await action();
      setNotice(`${label} exported.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${label} could not be exported.`);
    } finally {
      setBusyExport(null);
    }
  }

  return (
    <main className="studio-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ShieldFont Studio home">
          <span className="brand__mark" aria-hidden="true">SF</span>
          <span>ShieldFont <strong>Studio</strong></span>
        </a>
        <div className="topbar__status">
          <span className="status-dot" aria-hidden="true" />
          Autosaved on this device
        </div>
        <div className="topbar__actions">
          <input
            ref={importInput}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importProject(file);
            }}
          />
          <button className="button button--quiet" type="button" onClick={() => importInput.current?.click()}>
            Import
          </button>
          <button className="button button--dark" type="button" onClick={() => setExportOpen(true)}>
            Export <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>

      <section className="intro" id="top">
        <div>
          <p className="eyebrow">Custom mapping workspace</p>
          <h1>Decide exactly what<br />the system reads.</h1>
        </div>
        <div className="intro__copy">
          <p>Write and format a complete document, then mark only the words that should be masked. Word and PDF exports preserve the human-facing layout.</p>
          <p className="intro__note"><strong>Private authoring tool.</strong> The Studio keeps the editable original on this device; exported masked spans carry the encoded text.</p>
        </div>
      </section>

      <section className="project-strip" aria-label="Mapping project controls">
        <label>
          <span>Mapping set</span>
          <select
            value={project.id}
            onChange={(event) => {
              setCurrentId(event.target.value);
              detachFontForProjectChange();
            }}
          >
            {projects.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
            ))}
          </select>
        </label>
        <div className="project-strip__buttons">
          <button type="button" onClick={newProject}>＋ New</button>
          <button type="button" onClick={duplicateProject}>Duplicate</button>
          <button className="danger-link" type="button" onClick={deleteProject}>Delete</button>
        </div>
        <label className="project-name">
          <span>Project name</span>
          <input value={project.name} onChange={(event) => updateProject({ name: event.target.value })} />
        </label>
      </section>

      <div className="workspace-grid">
        <aside className="panel mapping-panel">
          <div className="panel__heading">
            <div>
              <p className="step">01 / Mapping</p>
              <h2>Word pairs</h2>
            </div>
            <span className="count-pill">{validPairs.length}</span>
          </div>
          <p className="panel__help">Pairs run from human text to hidden text by default. Use the arrow on a row when that pair should also work in reverse.</p>

          <div className="pair-labels" aria-hidden="true">
            <span>Human sees</span><span>System sees</span><span />
          </div>
          <div className="pair-list">
            {project.pairs.map((pair, index) => (
              <div className={`pair-row ${issues[pair.id] ? "pair-row--error" : ""}`} key={pair.id}>
                <label>
                  <span className="visually-hidden">Human word {index + 1}</span>
                  <input
                    value={pair.human}
                    placeholder="author"
                    autoCapitalize="none"
                    autoCorrect="off"
                    onChange={(event) => updatePair(pair.id, "human", event.target.value)}
                  />
                </label>
                <button
                  className="pair-direction"
                  type="button"
                  aria-label={`${pair.twoWay ? "Two-way" : "One-way"} word pair ${index + 1}. Click to make it ${pair.twoWay ? "one-way" : "two-way"}.`}
                  aria-pressed={Boolean(pair.twoWay)}
                  title={pair.twoWay ? "Two-way: click to make one-way" : "One-way: click to make two-way"}
                  onClick={() => updatePair(pair.id, "twoWay", !pair.twoWay)}
                >
                  {pair.twoWay ? "↔" : "→"}
                </button>
                <label>
                  <span className="visually-hidden">System word {index + 1}</span>
                  <input
                    value={pair.system}
                    placeholder="gardener"
                    autoCapitalize="none"
                    autoCorrect="off"
                    onChange={(event) => updatePair(pair.id, "system", event.target.value)}
                  />
                </label>
                <button className="pair-remove" type="button" aria-label={`Remove word pair ${index + 1}`} onClick={() => removePair(pair.id)}>×</button>
                {issues[pair.id] ? <small>{issues[pair.id]}</small> : null}
              </div>
            ))}
          </div>
          <button className="add-pair" type="button" onClick={addPair}>＋ Add another pair</button>

          <div className="font-card">
            <div className="font-card__title">
              <span className="font-icon" aria-hidden="true">Aa</span>
              <div><strong>Matching font</strong><small>{font ? font.fileName : "Arimo builds automatically"}</small></div>
            </div>
            <p>The included Arimo Regular is the default base. ShieldFont builds a fresh mapping-specific TTF automatically before a font-dependent export.</p>
            <input
              ref={baseFontInput}
              className="visually-hidden"
              type="file"
              accept=".ttf,font/ttf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void runExport("Desktop font", async () => { await buildDesktopFont(file); });
              }}
            />
            <input
              ref={fontInput}
              className="visually-hidden"
              type="file"
              accept=".woff2,.ttf,font/woff2,font/ttf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void attachFont(file);
              }}
            />
            <div className="font-card__buttons">
              <button
                className="font-build"
                type="button"
                disabled={buildingFont || !canExport}
                onClick={() => void runExport("Desktop font", async () => { await buildDesktopFont(); })}
              >
                {buildingFont ? "Building matching Arimo TTF…" : "Build + download matching Arimo TTF"}
              </button>
              <button className="font-upload" type="button" onClick={() => baseFontInput.current?.click()}>Use another base TTF</button>
              <button className="font-upload" type="button" onClick={() => fontInput.current?.click()}>Attach matching ShieldFont for preview</button>
            </div>
            {font ? (
              <div className="font-card__attached">
                <div className="font-card__actions">
                  <span>{font.extension === "ttf" ? `Desktop TTF ready${font.baseLabel ? ` · ${font.baseLabel}` : ""}` : "Web font attached"}</span>
                  <div>
                    {font.extension === "ttf" ? <button type="button" onClick={() => void runExport("Desktop font", () => exportDesktopFont(exportContext))}>Download</button> : null}
                    <button type="button" onClick={clearFont}>Remove</button>
                  </div>
                </div>
                {font.extension === "ttf" ? (
                  <label className="font-family-field">
                    <span>Internal font family name for Word{font.buildKey ? " · set by the builder" : ""}</span>
                    <input
                      value={font.desktopFamilyName ?? ""}
                      placeholder={`ShieldFont ${project.name.trim() || "Custom"}`}
                      readOnly={Boolean(font.buildKey)}
                      onChange={(event) => {
                        if (font.buildKey) return;
                        const desktopFamilyName = event.target.value.trim();
                        setFont((current) => current ? { ...current, desktopFamilyName: desktopFamilyName || undefined } : current);
                      }}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="word-guide">
            <p className="step">For a decoy upload</p>
            <ol>
              <li>Finish the word pairs, formatting, and masking.</li>
              <li>Open Export and choose <strong>Decoy-upload kit</strong>. The Studio builds the matching Arimo TTF automatically.</li>
              <li>Unzip it privately, install the <strong>1-INSTALL</strong> TTF, then fully quit and reopen Word or your browser.</li>
              <li>Upload only an untouched <strong>2-UPLOAD-THIS</strong> DOCX or HTML file. Never upload the ZIP or TTF.</li>
            </ol>
            <p>Portable DOCX/HTML carry the decoder font, so render-capable AI can read the human view. A human-readable PDF is also visible to OCR and vision models.</p>
            <p>Raw Arimo is only a base font. Never attach it as an existing ShieldFont: it has no mapping ligatures and will display the encoded words.</p>
          </div>
        </aside>

        <section className="panel composer-panel">
          <div className="panel__heading">
            <div>
              <p className="step">02 / Compose</p>
              <h2>Document editor</h2>
            </div>
            <span className="character-count">{source.length.toLocaleString()} chars</span>
          </div>
          <p className="panel__help composer-help">Select one or more words, right-click, and enter what the hidden layer should read. The Studio adds the changed pairs and masks only that selection.</p>
          <RichComposer
            documentId={project.id}
            html={richHtml}
            settings={documentSettings}
            mapping={mapping}
            onAddPairs={addPairsFromSelection}
            onChange={(nextHtml, nextSource) => updateProject({ richHtml: nextHtml, source: nextSource })}
            onSettingsChange={(nextSettings) => updateProject({ documentSettings: nextSettings })}
            onNotice={setNotice}
          />
          <div className="composer-footer">
            <p>The editor shows the human document. A pale green underline marks content that will be encoded in export files.</p>
            <button type="button" onClick={() => copyValue(source, "Original copied.")}>Copy original</button>
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="panel__heading">
            <div>
              <p className="step">03 / Compare</p>
              <h2>Live result</h2>
            </div>
            <span className={`preview-status ${font ? "preview-status--live" : ""}`}>{font ? "Font rendering" : "Layout preview"}</span>
          </div>

          <article className="view-card view-card--human">
            <header><span>Human sees</span><small>{font ? "Masked spans through attached font" : "Original formatted document"}</small></header>
            <div
              className="preview-copy preview-copy--human"
              style={font ? ({ "--shield-family": `"${font.familyName}"` } as CSSProperties) : undefined}
              dangerouslySetInnerHTML={{ __html: source ? (font ? encodedHtml : richHtml) : "<p>Your human-readable result appears here.</p>" }}
            />
          </article>

          <article className="view-card view-card--system">
            <header><span>System sees</span><small>Raw encoded text</small></header>
            <div
              className="preview-copy preview-copy--system"
              dangerouslySetInnerHTML={{ __html: source ? encodedHtml : "<p>The encoded result appears here.</p>" }}
            />
            <button className="copy-system" type="button" onClick={() => copyValue(encoded, "Encoded text copied.")}>Copy encoded text</button>
          </article>

          <div className="stats-row">
            <div><strong>{swapped}</strong><span>tokens changed</span></div>
            <div><strong>{protectedTokenCount ? Math.round((swapped / protectedTokenCount) * 100) : 0}%</strong><span>masked coverage</span></div>
            <div><strong>{issueCount}</strong><span>pair issues</span></div>
          </div>
        </section>
      </div>

      <section className="workflow-note">
        <div className="workflow-note__number">04</div>
        <div><p className="eyebrow">Export the document</p><h2>Keep the formatting, encode only the marked words.</h2></div>
        <p>Choose by goal. The decoy-upload kit keeps the decoder out of its DOCX and HTML; install the TTF locally and upload only the untouched document. Portable files carry the decoder. A human-readable PDF is readable to vision models, so the PDF alternative shows decoys visibly.</p>
        <button className="button button--lime" type="button" onClick={() => setExportOpen(true)}>Open export centre</button>
      </section>

      <footer className="footer">
        <span>ShieldFont Studio</span>
        <span>English word mappings · local-first workspace</span>
        <span aria-live="polite">{notice}</span>
      </footer>

      {exportOpen ? (
        <div className="export-overlay" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setExportOpen(false);
        }}>
          <section className="export-centre" role="dialog" aria-modal="true" aria-labelledby="export-title">
            <header className="export-centre__header">
              <div><p className="eyebrow">Export centre</p><h2 id="export-title">Take it somewhere useful.</h2></div>
              <button type="button" aria-label="Close export centre" onClick={() => setExportOpen(false)}>×</button>
            </header>

            {!canExport ? <div className="export-warning">Fix mapping issues and add source text to enable exports.</div> : null}
            {!font ? <div className="export-warning export-warning--soft"><strong>No matching font prepared yet.</strong> The first font-dependent export builds and attaches a mapping-specific TTF from the included Arimo Regular automatically.</div> : null}
            <div className="export-warning export-warning--soft"><strong>Portable means AI-renderable.</strong> An embedded font lets another computer—and a render-first GenAI—recover the human view. Use the decoy-upload kit for HTML or Word uploads. There is no equivalent human-readable PDF mode against OCR/vision.</div>

            <div className="export-group">
              <h3>Decoy upload</h3>
              <div className="export-grid">
                <ExportTile title="Decoy-upload kit" badge="Recommended for uploads" detail="Local-only TTF plus font-free DOCX and HTML. Install the TTF; upload only a 2-UPLOAD-THIS file." disabled={!canExport || Boolean(busyExport)} onClick={() => void runExport("Decoy-upload kit", () => withMatchingFont((context) => exportDecoyUploadKit(context), true))} />
                <ExportTile title="Raw encoded text" badge="No human rendering" detail="The strongest upload choice when formatting is unnecessary: decoy text only, with no font or visible human layer." disabled={!canExport} onClick={() => void runExport("Encoded text", () => exportEncodedText(exportContext))} />
              </div>
            </div>

            <div className="export-group">
              <h3>Desktop and Microsoft Word</h3>
              <div className="export-grid">
                <ExportTile title="Installable desktop TTF" badge="Arimo default" detail="Build and download the mapping-specific desktop font; no source-font picker required." disabled={!canExport || Boolean(busyExport)} onClick={() => void runExport("Desktop font", () => withMatchingFont((context) => exportDesktopFont(context), true))} />
                <ExportTile title="Portable Word DOCX" badge="Font embedded · AI may read human" detail="Human-readable on other computers. Its embedded mapping font can be rendered or inspected by GenAI." disabled={!canExport || Boolean(busyExport)} onClick={() => void runExport("Portable Word document", () => withMatchingFont((context) => exportWordDocx(context), true))} />
                <ExportTile title="Plain Word RTF" detail="Encoded plain-text fallback; requires the TTF to be installed on the reader's device." disabled={!canExport || font?.extension !== "ttf" || !font.desktopFamilyName} onClick={() => void runExport("RTF", () => exportRtf(exportContext))} />
                <ExportTile title="Font build kit" badge="ZIP" detail="Mapping, offline build recipe, backup, matching font, and publish files." disabled={!canExport || Boolean(busyExport)} onClick={() => void runExport("Font kit", () => withMatchingFont((context) => exportFontKit(context), true))} />
              </div>
            </div>

            <div className="export-group">
              <h3>PDF and portable display</h3>
              <div className="export-grid">
                <ExportTile title="Presentation PDF" badge="OCR/vision reads human" detail="Human-readable print output. It cannot keep the visible words from a vision-capable GenAI." disabled={!canExport || Boolean(busyExport)} onClick={() => void runExport("Presentation PDF", () => withMatchingFont((context) => exportPresentationPdf(context)))} />
                <ExportTile title="Encoded-only PDF" badge="Decoys are visible" detail="Prints the encoded words without the mapping font, so text extraction and page vision both receive decoys." disabled={!canExport || Boolean(busyExport)} onClick={() => void runExport("Encoded-only PDF", () => exportEncodedOnlyPdf(exportContext))} />
                <ExportTile title="Portable standalone HTML" badge="Font inside · AI may read human" detail="One human-readable file with encoded DOM text and the decoder font. Use the decoy-upload kit for model uploads." disabled={!canExport || Boolean(busyExport)} onClick={() => void runExport("Portable HTML", () => withMatchingFont((context) => exportHtml(context)))} />
                <ExportTile title="EPUB" detail="Encoded ebook with the automatically prepared matching font embedded." disabled={!canExport || Boolean(busyExport)} onClick={() => void runExport("EPUB", () => withMatchingFont((context) => exportEpub(context)))} />
                <ExportTile title="SVG" detail="Scalable encoded artwork rendered through the automatically prepared matching font." disabled={!canExport || Boolean(busyExport)} onClick={() => void runExport("SVG", () => withMatchingFont((context) => exportSvg(context)))} />
              </div>
            </div>

            <div className="export-group">
              <h3>Encoded content</h3>
              <div className="export-grid export-grid--compact">
                <ExportTile title="Plain text" detail="Raw encoded .txt" disabled={!canExport} onClick={() => void runExport("Text", () => exportEncodedText(exportContext))} />
                <ExportTile title="Markdown" detail="Raw encoded .md" disabled={!canExport} onClick={() => void runExport("Markdown", () => exportMarkdown(exportContext))} />
                <ExportTile title="HTML snippet" detail="Copy encoded markup" disabled={!canExport} onClick={() => void runExport("HTML snippet", () => copyValue(encodedHtmlSnippet(exportContext), "Encoded HTML copied."))} />
                <ExportTile title="CSS starter" detail="Matching @font-face template" disabled={!canExport} onClick={() => void runExport("CSS", () => exportCss(exportContext))} />
              </div>
            </div>

            <div className="export-group">
              <h3>Mapping and backup</h3>
              <div className="export-grid export-grid--compact">
                <ExportTile title="Mapping JSON" detail="Directional builder input" disabled={!canExport} onClick={() => void runExport("Mapping", () => exportMapping(exportContext))} />
                <ExportTile title="Pairs CSV" detail="Human and system columns" disabled={!canExport} onClick={() => void runExport("CSV", () => exportCsv(exportContext))} />
                <ExportTile title="Private project" detail="Original, pairs, and settings" disabled={!canExport} onClick={() => void runExport("Project backup", () => exportProject(exportContext))} />
              </div>
            </div>

            <footer className="export-centre__footer">
              <span>{busyExport ? `Preparing ${busyExport}…` : notice}</span>
              <button className="button button--dark" type="button" onClick={() => setExportOpen(false)}>Done</button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
