/**
 * Desktop semantic index — enqueue main-process embed job instead of renderer Web Worker.
 */
import type { CorpusChunk } from "@/types/researchProject";
import type { EmbeddingIndexProgress } from "@/lib/research/embeddingIndex";
import { enqueueResearchJob } from "@/lib/research/researchDesktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";

export type DesktopEmbedController = {
  abort: () => void;
  promise: Promise<{ embedded: number } | null>;
};

const EMBED_JOB_TIMEOUT_MS = 10 * 60 * 1000;

export function enqueueDesktopEmbedJob(
  projectId: string,
  opts?: { removedChunkIds?: string[]; onProgress?: (p: EmbeddingIndexProgress) => void }
): DesktopEmbedController {
  const ac = new AbortController();
  const promise = (async () => {
    if (!isDesktopApp()) return null;
    const api = window.openbenttResearch;

    const { jobId } = await enqueueResearchJob(projectId, "embed", {
      removedChunkIds: opts?.removedChunkIds ?? [],
    });
    if (!jobId) return null;

    // Fast path: job may already be terminal (deduped / instant "up to date").
    try {
      const jobs = await api?.listJobs?.(projectId);
      const mine = jobs?.find((j) => j.id === jobId);
      if (mine?.status === "completed") return { embedded: 1 };
      if (mine?.status === "failed") throw new Error(mine.message ?? "Embed job failed");
      if (mine?.status === "cancelled") return null;
    } catch (e) {
      if (e instanceof Error && /Embed job failed/i.test(e.message)) throw e;
    }

    return await new Promise<{ embedded: number } | null>((resolve, reject) => {
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsub?.();
        fn();
      };

      const unsub = api?.onJobProgress?.((payload) => {
        if (payload.projectId !== projectId || payload.jobId !== jobId) return;
        if (payload.message && payload.progress != null) {
          const m = payload.message.match(/(\d+)\/(\d+)/);
          if (m) {
            opts?.onProgress?.({
              phase: "embedding",
              done: Number(m[1]),
              total: Number(m[2]),
            });
          } else if (payload.message.includes("Loading")) {
            opts?.onProgress?.({ phase: "loading-model", done: 0, total: 0 });
          }
        }
        if (payload.status === "completed") done(() => resolve({ embedded: 1 }));
        if (payload.status === "failed")
          done(() => reject(new Error(payload.message ?? "Embed job failed")));
        if (payload.status === "cancelled") done(() => resolve(null));
      });

      const timeout = setTimeout(() => {
        done(() => resolve(null));
      }, EMBED_JOB_TIMEOUT_MS);

      ac.signal.addEventListener(
        "abort",
        () => {
          done(() => {
            void api?.cancelJob?.(projectId, jobId);
            resolve(null);
          });
        },
        { once: true }
      );
    });
  })();

  return { abort: () => ac.abort(), promise };
}

export function chunkIdsRemovedAfterRechunk(
  previous: CorpusChunk[],
  next: CorpusChunk[]
): string[] {
  const nextIds = new Set(next.map((c) => c.id));
  return previous.map((c) => c.id).filter((id) => !nextIds.has(id));
}
