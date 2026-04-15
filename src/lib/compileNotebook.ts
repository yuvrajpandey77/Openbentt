import { compileTextToPdfBlob } from "@/lib/pdfFromText";
import { compileLatexToPdfBlob } from "@/lib/latexCompileClient";
import { rewriteIncludegraphicsPlaceholders } from "@/lib/latexNotebookImageFixup";
import { ensureLmodernForWasmLatex } from "@/lib/latexWasmFontFixup";
import { isLatexDocumentSource } from "@/lib/notebookSourceKind";

function prepareNotebookLatex(tex: string): string {
  return rewriteIncludegraphicsPlaceholders(ensureLmodernForWasmLatex(tex));
}

/** Plain text / page markers → jsPDF; full LaTeX → client WASM pdflatex (BusyTeX), with optional HTTP fallback. */
export async function compileNotebookSourceToPdf(source: string, plainTitle: string): Promise<Blob> {
  if (isLatexDocumentSource(source)) {
    return compileLatexToPdfBlob(prepareNotebookLatex(source));
  }
  return compileTextToPdfBlob(source, plainTitle);
}
