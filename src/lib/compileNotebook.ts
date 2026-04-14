import { compileTextToPdfBlob } from "@/lib/pdfFromText";
import { compileLatexToPdfBlob } from "@/lib/latexCompileClient";
import { isLatexDocumentSource } from "@/lib/notebookSourceKind";

/** Plain text / page markers → jsPDF; full LaTeX document → pdflatex service when available. */
export async function compileNotebookSourceToPdf(source: string, plainTitle: string): Promise<Blob> {
  if (isLatexDocumentSource(source)) {
    return compileLatexToPdfBlob(source);
  }
  return compileTextToPdfBlob(source, plainTitle);
}
