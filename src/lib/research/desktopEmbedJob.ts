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

export function enqueueDesktopEmbedJob(
  projectId: string,
  opts?: { removedChunkIds?: string[]; onProgress?: (p: EmbeddingIndexProgress) => void }
): DesktopEmbedController {
  const ac = new AbortController();
  const promise = (async () => {
    if (!isDesktopApp()) return null;
    const { jobId } = await enqueueResearchJob(projectId, "embed", {
      removedChunkIds: opts?.removedChunkIds ?? [],
    });
    if (!jobId) return null;
    return new Promise<{ embedded: number } | null>((resolve, reject) => {
      const api = window.openbenttResearch;
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
        if (payload.status === "completed") {
          unsub?.();
          resolve({ embedded: 1 });
        }
        if (payload.status === "failed") {
          unsub?.();
          reject(new Error(payload.message ?? "Embed job failed"));
        }
        if (payload.status === "cancelled") {
          unsub?.();
          resolve(null);
        }
      });
      ac.signal.addEventListener(
        "abort",
        () => {
          unsub?.();
          void api?.cancelJob?.(projectId, jobId);
          resolve(null);
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
