/**
 * Canonical corpus rebuild — one entry for chunk generation across web and desktop.
 */
import { buildCorpusChunks } from "@/lib/research/corpusIndex";
import { enqueueResearchJob } from "@/lib/research/researchDesktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";
import type { CorpusChunk } from "@/types/researchProject";

export type CorpusPaperInput = {
  id: string;
  fileName: string;
  extractedText: string;
};

export type CorpusRebuildResult =
  | { mode: "sync"; chunks: CorpusChunk[] }
  | { mode: "queued"; jobId: string };

/** Queue background rechunk (desktop) or build chunks synchronously (web). */
export async function rebuildProjectCorpus(
  projectId: string,
  papers: CorpusPaperInput[],
  draftTex: string
): Promise<CorpusRebuildResult> {
  const payload = papers.map((p) => ({
    id: p.id,
    fileName: p.fileName,
    extractedText: p.extractedText,
  }));

  if (isDesktopApp() && window.openbenttResearch?.enqueueJob) {
    const { jobId } = await enqueueResearchJob(projectId, "rechunk", {
      projectId,
      papers: payload,
      draftTex,
    });
    return { mode: "queued", jobId };
  }

  return { mode: "sync", chunks: buildCorpusChunks(payload, draftTex, projectId) };
}
