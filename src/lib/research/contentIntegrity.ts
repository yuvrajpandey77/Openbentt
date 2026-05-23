import type { ResearchProjectData } from "@/types/researchProject";
import { inferPdfMetadata } from "@/lib/research/citationTools";
import { isCorruptedPaperTitle } from "@/lib/research/displayPaperLabel";

/** True when editor content looks like PDF extraction mistakenly saved as LaTeX/bib. */
export function looksLikePdfExtractInEditor(text: string): boolean {
  if (!text?.trim()) return false;
  if (text.includes("[UNTRUSTED_DOCUMENT")) return true;
  if (/--- PDF PAGE \d+\s*\/\s*\d+ ---/.test(text) && !/\\documentclass/i.test(text)) return true;
  return false;
}

export type ProjectIntegrityReport = {
  project: ResearchProjectData;
  repairedPaperTitles: number;
  draftWasCorrupted: boolean;
  bibliographyWasCorrupted: boolean;
  changed: boolean;
};

/** Repair corrupted paper titles and flag draft/bib PDF contamination from pre-M0 builds. */
export function migrateProjectIntegrity(project: ResearchProjectData): ProjectIntegrityReport {
  let repairedPaperTitles = 0;
  const papers = project.papers.map((p) => {
    if (!isCorruptedPaperTitle(p.metadata?.title)) return p;
    repairedPaperTitles += 1;
    const inferred = inferPdfMetadata(p.extractedText ?? "");
    const title =
      inferred.title && !isCorruptedPaperTitle(inferred.title) ? inferred.title : undefined;
    return {
      ...p,
      metadata: {
        ...p.metadata,
        title,
        authors: p.metadata?.authors ?? inferred.authors,
        year: p.metadata?.year ?? inferred.year,
        doi: p.metadata?.doi ?? inferred.doi,
      },
    };
  });

  const draftWasCorrupted = looksLikePdfExtractInEditor(project.draftTex);
  const bibliographyWasCorrupted = looksLikePdfExtractInEditor(project.bibliography);
  const next = { ...project, papers };
  const changed = repairedPaperTitles > 0;

  return {
    project: next,
    repairedPaperTitles,
    draftWasCorrupted,
    bibliographyWasCorrupted,
    changed,
  };
}

/** Pick the newest draft-history entry that does not look like PDF extract. */
export function pickCleanDraftHistoryEntry(
  entries: { id: string; content: string; createdAt?: string }[]
): { id: string; content: string } | null {
  const sorted = [...entries].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
  );
  for (const e of sorted) {
    if (!looksLikePdfExtractInEditor(e.content)) return e;
  }
  return null;
}
