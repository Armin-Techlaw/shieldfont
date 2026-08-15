import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);
const MAX_FONT_BYTES = 30 * 1024 * 1024;
const MAX_MAPPING_ENTRIES = 20_000;
const SAFE_WORD = /^\p{L}+$/u;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function safeSlug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "custom"
  );
}

function cleanFamily(value: string): string {
  const cleaned = value.replace(/[^\p{L}\p{N} ._-]+/gu, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 72) || "ShieldFont Custom";
}

function revisionedFamily(value: string, revision: string): string {
  const base = cleanFamily(value);
  const suffix = ` ${revision}`;
  return `${base.slice(0, 72 - suffix.length).trim()}${suffix}`;
}

function validateMapping(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The mapping JSON is invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The mapping must be a JSON object.");
  }
  const entries = Object.entries(parsed as Record<string, unknown>).filter(([key]) => !key.startsWith("_"));
  if (!entries.length) throw new Error("Add at least one valid word pair before building a font.");
  if (entries.length > MAX_MAPPING_ENTRIES) throw new Error("This mapping is too large for the desktop builder.");

  const mapping: Record<string, string> = {};
  const targets = new Set<string>();
  for (const [sourceRaw, targetRaw] of entries) {
    if (typeof targetRaw !== "string") throw new Error("Every mapping value must be a word.");
    const source = sourceRaw.trim().toLocaleLowerCase("en");
    const target = targetRaw.trim().toLocaleLowerCase("en");
    if (!SAFE_WORD.test(source) || !SAFE_WORD.test(target) || source === target) {
      throw new Error("Every mapping entry must pair two different letter-only words.");
    }
    if (targets.has(target)) throw new Error(`The hidden word ${target} is used by more than one source word.`);
    targets.add(target);
    mapping[source] = target;
  }
  return mapping;
}

async function findGenerator(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "../../scripts/generate_font.py"),
    path.resolve(process.cwd(), "scripts/generate_font.py"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next established repository layout.
    }
  }
  throw new Error("The ShieldFont font-builder script could not be found.");
}

async function runPython(args: string[]) {
  const localVenv = process.platform === "win32"
    ? path.resolve(process.cwd(), ".venv-font-builder/Scripts/python.exe")
    : path.resolve(process.cwd(), ".venv-font-builder/bin/python3");
  const candidates = [process.env.SHIELDFONT_PYTHON, localVenv, "python3", "python"].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  let lastError: unknown;
  for (const executable of candidates) {
    try {
      return await execFileAsync(executable, args, {
        timeout: 280_000,
        maxBuffer: 8 * 1024 * 1024,
        env: process.env,
      });
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }
  throw lastError ?? new Error("Python 3 is not installed.");
}

export async function POST(request: Request) {
  let workspace: string | null = null;
  try {
    const form = await request.formData();
    const baseFont = form.get("baseFont");
    const mappingRaw = form.get("mapping");
    const familyRaw = form.get("familyName");
    if (!(baseFont instanceof File)) return jsonError("Choose a licensed Regular TrueType (.ttf) base font.", 400);
    if (baseFont.size <= 0 || baseFont.size > MAX_FONT_BYTES) return jsonError("The base font must be between 1 byte and 30 MB.", 400);
    if (!baseFont.name.toLowerCase().endsWith(".ttf")) return jsonError("Desktop builds require a TrueType (.ttf) base font.", 400);
    if (typeof mappingRaw !== "string") return jsonError("The mapping is missing.", 400);

    const mapping = validateMapping(mappingRaw);
    const requestedFamily = cleanFamily(typeof familyRaw === "string" ? familyRaw : "ShieldFont Custom");
    const baseBytes = Buffer.from(await baseFont.arrayBuffer());
    const canonicalMapping = JSON.stringify(Object.fromEntries(
      Object.entries(mapping).sort(([left], [right]) => left.localeCompare(right)),
    ));
    const revision = createHash("sha256")
      .update(baseBytes)
      .update("\0")
      .update(requestedFamily)
      .update("\0")
      .update(canonicalMapping)
      .digest("hex")
      .slice(0, 10)
      .toUpperCase();
    const familyName = revisionedFamily(requestedFamily, revision);
    const prefix = `shieldfont-${safeSlug(familyName.replace(/^ShieldFont\s+/i, ""))}`;
    const generator = await findGenerator();
    workspace = await mkdtemp(path.join(tmpdir(), "shieldfont-studio-"));
    const basePath = path.join(workspace, "base.ttf");
    const mappingPath = path.join(workspace, "mapping.json");
    const outputDir = path.join(workspace, "output");
    await writeFile(basePath, baseBytes);
    await writeFile(mappingPath, JSON.stringify(mapping));

    await runPython([
      generator,
      "--base-path", basePath,
      "--name", familyName,
      "--prefix", prefix,
      "--mapping-path", mappingPath,
      "--output-dir", outputDir,
      "--no-mapping-emit",
      "--post-format-3", "auto",
    ]);

    const fontBytes = await readFile(path.join(outputDir, `${prefix}.ttf`));
    return new Response(fontBytes, {
      status: 200,
      headers: {
        "Content-Type": "font/ttf",
        "Content-Disposition": `attachment; filename="${prefix}.ttf"`,
        "X-ShieldFont-Family": encodeURIComponent(familyName),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const stderr = typeof error === "object" && error && "stderr" in error ? String(error.stderr) : "";
    const message = error instanceof Error ? error.message : "The desktop font could not be built.";
    if (/No module named ['\"]fontTools/i.test(stderr) || /No module named ['\"]fontTools/i.test(message)) {
      return jsonError("The local font-builder dependencies are missing. Run: pip3 install -r requirements.txt", 503);
    }
    const useful = stderr.split("\n").find((line) => line.includes("[FAIL]"))?.replace(/^.*\[FAIL\]\s*/, "");
    return jsonError(useful || message, 500);
  } finally {
    if (workspace) await rm(workspace, { recursive: true, force: true });
  }
}
