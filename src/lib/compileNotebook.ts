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

/** Plain text / page markers → jsPDF; full LaTeX → WASM / local / HTTP pdflatex. */
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
    const blob = await compileLatexToPdfBlob(prepared.mainTex, prepared);
    if (useCache) {
      void storeCachedCompilePdf(prepared, blob, opts.projectId);
    }
    return blob;
  }

  if (isLatexDocumentSource(source)) {
    let tex = applyNotebookLatexAutofix(source);
    if (applyStyle) tex = applyDocumentStyleToLatex(tex, loadDocumentStyle());
    return compileLatexToPdfBlob(tex);
  }

  return compileTextToPdfBlob(source, plainTitle);
}
