import JSZip from "jszip";
import type { ResearchProjectData } from "@/types/researchProject";
import { listProjectAssetsDesktop, loadProjectAssetDesktop } from "@/lib/research/researchDesktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";

/** Export project as ZIP (main.tex, references.bib, chapters, assets). */
export async function exportProjectZip(project: ResearchProjectData): Promise<Blob> {
  const zip = new JSZip();
  zip.file("main.tex", project.draftTex ?? "");
  if (project.bibliography?.trim()) {
    zip.file("references.bib", project.bibliography);
  }
  for (const pf of project.projectFiles ?? []) {
    zip.file(pf.path.replace(/\\/g, "/"), pf.content);
  }

  if (isDesktopApp()) {
    const assets = await listProjectAssetsDesktop(project.id);
    for (const name of assets) {
      const r = await loadProjectAssetDesktop(project.id, name);
      if (r?.ok && r.base64) {
        zip.file(`assets/${name}`, r.base64, { base64: true });
      }
    }
  }

  zip.file(
    "README.txt",
    `Openbentt project export: ${project.title}\nExported: ${new Date().toISOString()}\n\nCompile with pdflatex + bibtex or open in Overleaf.`
  );

  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
