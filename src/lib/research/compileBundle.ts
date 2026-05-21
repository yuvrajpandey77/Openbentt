import type { ResearchProjectData } from "@/types/researchProject";
import { isLatexDocumentSource } from "@/lib/notebookSourceKind";
import { base64ToArrayBuffer } from "@/lib/research/base64";

export type CompileFileInput = {
  path: string;
  content: string | Uint8Array;
};

export type CompileBundle = {
  mainTex: string;
  mainPath: string;
  additionalFiles: CompileFileInput[];
  bibtex: boolean;
  summary: string;
};

function normalizeGraphicsPath(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Map \includegraphics paths to bundled asset names. */
export function resolveAssetPathForGraphics(ref: string, assetNames: string[]): string | null {
  const norm = normalizeGraphicsPath(ref);
  const base = norm.split("/").pop() ?? norm;
  if (assetNames.includes(norm)) return norm;
  if (assetNames.includes(base)) return base;
  if (assetNames.includes(`assets/${base}`)) return `assets/${base}`;
  if (norm.startsWith("assets/")) {
    const tail = norm.slice("assets/".length);
    if (assetNames.includes(tail)) return tail;
  }
  return null;
}

export function collectIncludegraphicsPaths(tex: string): string[] {
  const re = /\\includegraphics(\[[^\]]*\])?\s*\{([^}]*)\}/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(tex)) !== null) {
    out.push(m[2].trim());
  }
  return out;
}

function usesBibliography(tex: string): boolean {
  return /\\bibliography\{/.test(tex) || /\\bibliographystyle\{/.test(tex) || /\\cite\{/.test(tex);
}

/** Reject paths that would break the compile temp dir (e.g. LaTeX pasted as filename). */
export function isSafeCompileRelativePath(raw: string): boolean {
  const p = raw.replace(/\\/g, "/").trim();
  if (!p || p.length > 200) return false;
  if (p.startsWith("/") || p.includes("..") || /[\0\n\r]/.test(p)) return false;
  if (/^documentclass|^\\documentclass|^usepackage|^\\usepackage/i.test(p)) return false;
  return /^[\w./-]+$/i.test(p);
}

export type BuildCompileBundleOptions = {
  /** Override main tex (defaults to project.draftTex). */
  mainTex?: string;
  /** Asset file names on disk under project assets/ */
  assetNames?: string[];
  /** Base64 asset payloads keyed by file name */
  assetBytes?: Record<string, string>;
};

/**
 * Assemble a multi-file compile bundle from a research project.
 * Always roots at main.tex unless override is a full document.
 */
export function buildCompileBundle(
  project: ResearchProjectData,
  opts: BuildCompileBundleOptions = {}
): CompileBundle {
  const mainTex = opts.mainTex ?? project.draftTex;
  const mainPath = "main.tex";
  const additionalFiles: CompileFileInput[] = [];
  const parts: string[] = [];

  if (project.bibliography?.trim()) {
    additionalFiles.push({ path: "references.bib", content: project.bibliography });
    parts.push("references.bib");
  }

  for (const pf of project.projectFiles ?? []) {
    const relPath = pf.path.replace(/\\/g, "/");
    if (relPath === mainPath) continue;
    if (!isSafeCompileRelativePath(relPath)) continue;
    additionalFiles.push({ path: relPath, content: pf.content });
    parts.push(relPath);
  }

  const assetNames = opts.assetNames ?? [];
  const assetBytes = opts.assetBytes ?? {};
  for (const name of assetNames) {
    const b64 = assetBytes[name];
    if (b64) {
      additionalFiles.push({ path: `assets/${name}`, content: new Uint8Array(base64ToArrayBuffer(b64)) });
    }
  }
  if (assetNames.length) parts.push(`${assetNames.length} asset(s)`);

  const bibtex = usesBibliography(mainTex) && Boolean(project.bibliography?.trim());
  const summary = [`main.tex`, ...parts].join(" + ");

  return {
    mainTex,
    mainPath,
    additionalFiles,
    bibtex,
    summary,
  };
}

/** True when source should compile as standalone fragment (warn user). */
export function isFragmentSource(tex: string): boolean {
  const t = tex.trim();
  if (!t) return true;
  if (isLatexDocumentSource(tex)) return false;
  return !/\\documentclass/.test(t);
}
