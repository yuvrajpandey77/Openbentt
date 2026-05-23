import {
  buildChunkEmbeddings,
  type EmbeddingIndexProgress,
} from "@/lib/research/embeddingIndex";
import {
  clearIndexCheckpoint,
  loadIndexCheckpoint,
  saveIndexCheckpoint,
} from "@/lib/research/indexCheckpoint";
import { enqueueDesktopEmbedJob } from "@/lib/research/desktopEmbedJob";
import { pruneStaleEmbeddings } from "@/lib/research/incrementalIndex";
import { isDesktopApp } from "@/lib/isDesktopApp";
import type { CorpusChunk } from "@/types/researchProject";

export type SemanticRebuildController = {
  abort: () => void;
  promise: Promise<Record<string, number[]> | { embedded: number } | null>;
};

const RETRY_DELAYS_MS = [0, 2000, 5000];

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/** Build embeddings off main thread when possible; checkpoint + retry on failure (web). */
export function startSemanticIndexRebuild(
  chunks: CorpusChunk[],
  projectId: string,
  onProgress?: (p: EmbeddingIndexProgress) => void,
  opts?: { removedChunkIds?: string[] }
): SemanticRebuildController {
  if (isDesktopApp()) {
    const job = enqueueDesktopEmbedJob(projectId, {
      removedChunkIds: opts?.removedChunkIds,
      onProgress,
    });
    return {
      abort: job.abort,
      promise: job.promise,
    };
  }

  const ac = new AbortController();
  const promise = (async () => {
    const library = chunks.filter((c) => c.paperId !== "draft");
    if (library.length === 0) return {};

    const checkpoint = loadIndexCheckpoint(projectId);
    let resume =
      checkpoint?.projectId === projectId ? checkpoint.vectors : undefined;
    resume = pruneStaleEmbeddings(chunks, resume);

    let lastError: unknown;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      if (ac.signal.aborted) return null;
      try {
        await sleep(RETRY_DELAYS_MS[attempt], ac.signal);
        const savePartial = (vectors: Record<string, number[]>) => {
          resume = vectors;
          saveIndexCheckpoint({
            projectId,
            vectors,
            doneIds: Object.keys(vectors),
            total: library.length,
            updatedAt: new Date().toISOString(),
          });
        };

        const vectors = await buildChunkEmbeddings(
          chunks,
          onProgress,
          ac.signal,
          resume,
          savePartial
        );
        clearIndexCheckpoint(projectId);
        return vectors;
      } catch (e) {
        if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
          return null;
        }
        lastError = e;
        const cp = loadIndexCheckpoint(projectId);
        if (cp?.vectors) resume = cp.vectors;
      }
    }
    throw lastError;
  })();

  return { abort: () => ac.abort(), promise };
}
