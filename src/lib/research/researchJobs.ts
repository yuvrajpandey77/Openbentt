import { isDesktopApp } from "@/lib/isDesktopApp";

/** Desktop background jobs — only `rechunk` is implemented in the main-process queue. */
export type ResearchJobType = "rechunk";

export type ResearchJobProgress = {
  projectId: string;
  jobId: string;
  jobType: ResearchJobType;
  status: string;
  progress: number;
  message?: string;
};

export async function enqueueRechunkJob(
  projectId: string,
  papers: { id: string; extractedText: string }[],
  draftTex: string
): Promise<{ jobId: string } | null> {
  const api = window.openbenttResearch;
  if (!isDesktopApp() || !api?.enqueueJob) return null;
  return api.enqueueJob(projectId, "rechunk", { papers, draftTex });
}

export function subscribeJobProgress(cb: (p: ResearchJobProgress) => void): (() => void) | undefined {
  const api = window.openbenttResearch;
  if (!api?.onJobProgress) return undefined;
  return api.onJobProgress(cb);
}
