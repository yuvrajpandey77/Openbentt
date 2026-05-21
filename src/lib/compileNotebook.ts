import type { CompileBundle } from "@/lib/research/compileBundle";
import { compileTextToPdfBlob } from "@/lib/pdfFromText";
import { compileLatexToPdfBlob } from "@/lib/latexCompileClient";
import { applyNotebookLatexAutofix } from "@/lib/notebookLatexAutofix";
import { availableAssetNamesFromBundle } from "@/lib/latexNotebookImageFixup";
import { applyDocumentStyleToLatex, loadDocumentStyle } from "@/lib/notebookDocumentStyle";
import { loadNotebookCompileSettings } from "@/lib/notebookCompileSettings";
import { isLatexDocumentSource } from "@/lib/notebookSourceKind";

export type CompileNotebookOptions = {
  plainTitle?: string;
  bundle?: CompileBundle;
  applyStyle?: boolean;
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
    return compileLatexToPdfBlob(prepared.mainTex, prepared);
  }

  if (isLatexDocumentSource(source)) {
    let tex = applyNotebookLatexAutofix(source);
    if (applyStyle) tex = applyDocumentStyleToLatex(tex, loadDocumentStyle());
    return compileLatexToPdfBlob(tex);
  }

  return compileTextToPdfBlob(source, plainTitle);
}
