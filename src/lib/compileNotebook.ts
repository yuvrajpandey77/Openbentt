import type { CompileBundle } from "@/lib/research/compileBundle";
import { compileTextToPdfBlob } from "@/lib/pdfFromText";
import { compileLatexToPdfBlob } from "@/lib/latexCompileClient";
import { applyNotebookLatexAutofix } from "@/lib/notebookLatexAutofix";
import { availableAssetNamesFromBundle } from "@/lib/latexNotebookImageFixup";
import { applyDocumentStyleToLatex, loadDocumentStyle } from "@/lib/notebookDocumentStyle";
import { loadNotebookCompileSettings } from "@/lib/notebookCompileSettings";
import { isLatexDocumentSource } from "@/lib/notebookSourceKind";
import { getCachedCompilePdf, storeCachedCompilePdf } from "@/lib/research/compileArtifactCache";

export type CompileNotebookOptions = {
  plainTitle?: string;
  bundle?: CompileBundle;
  applyStyle?: boolean;
  /** When set with bundle, enables compile artifact cache lookup/store. */
  projectId?: string;
  useCompileCache?: boolean;
  /** Explicit Compile clicks should fail visibly instead of a fake text PDF. */
  allowTextFallback?: boolean;
};

function prepareBundle(bundle: CompileBundle, applyStyle: boolean): CompileBundle {
  const assets = availableAssetNamesFromBundle(bundle);
  let mainTex = applyNotebookLatexAutofix(bundle.mainTex, assets);
  if (applyStyle) {
    mainTex = applyDocumentStyleToLatex(mainTex, loadDocumentStyle());
  }
  const additionalFiles = bundle.additionalFiles.map((f) => {
    if (typeof f.content !== "string") return f;
    let content = f.content;
    if (f.path.endsWith(".tex")) {
      content = applyNotebookLatexAutofix(content, assets);
    }
    return { ...f, content };
  });
  return { ...bundle, mainTex, additionalFiles };
}

/**
 * Strip common LaTeX commands so a text-PDF fallback is still readable when
 * every TeX engine (BusyTeX / local / HTTP) fails.
 */
function latexToReadablePlain(tex: string): string {
  return tex
    .replace(/\\begin\{document\}/gi, "")
    .replace(/\\end\{document\}/gi, "")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}%~^_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120_000);
}

async function textFallbackPdf(source: string, plainTitle: string, reason: unknown): Promise<Blob> {
  const why = reason instanceof Error ? reason.message.split("\n")[0] : String(reason);
  const body =
    `Openbentt text preview (LaTeX engines unavailable)\n` +
    `Reason: ${why.slice(0, 280)}\n` +
    `—\n\n` +
    latexToReadablePlain(source);
  console.warn("[compile] Using text PDF fallback after LaTeX failure:", why);
  return compileTextToPdfBlob(body, `${plainTitle} (text fallback)`);
}

/** Plain text / page markers → jsPDF; full LaTeX → WASM / local / HTTP pdflatex (always yields a PDF). */
export async function compileNotebookSourceToPdf(
  source: string,
  plainTitle = "Notebook",
  opts: CompileNotebookOptions = {}
): Promise<Blob> {
  const settings = loadNotebookCompileSettings();
  const applyStyle = opts.applyStyle ?? settings.applyDocumentStyle;

  if (opts.bundle && isLatexDocumentSource(opts.bundle.mainTex)) {
    const prepared = prepareBundle(opts.bundle, applyStyle);
    const useCache = opts.useCompileCache !== false && Boolean(opts.projectId);
    if (useCache) {
      const cached = await getCachedCompilePdf(prepared, opts.projectId);
      if (cached.hit) return cached.blob;
    }
    try {
      const blob = await compileLatexToPdfBlob(prepared.mainTex, prepared);
      if (useCache) {
        void storeCachedCompilePdf(prepared, blob, opts.projectId);
      }
      return blob;
    } catch (err) {
      if (opts.allowTextFallback === false) throw err;
      return textFallbackPdf(prepared.mainTex, plainTitle, err);
    }
  }

  if (isLatexDocumentSource(source)) {
    let tex = applyNotebookLatexAutofix(source);
    if (applyStyle) tex = applyDocumentStyleToLatex(tex, loadDocumentStyle());
    try {
      return await compileLatexToPdfBlob(tex);
    } catch (err) {
      if (opts.allowTextFallback === false) throw err;
      return textFallbackPdf(tex, plainTitle, err);
    }
  }

  return compileTextToPdfBlob(source, plainTitle);
}
