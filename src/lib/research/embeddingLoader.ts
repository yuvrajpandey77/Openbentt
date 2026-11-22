import {
  embeddingStatsDesktop,
  loadEmbeddingsDesktop,
} from "@/lib/research/researchDesktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";
import type { CorpusChunk } from "@/types/researchProject";

/** Larger batches keep IPC overhead low when resolving thousand-page corpora. */
const EMBED_LOAD_BATCH = 256;

/** Load vectors for library chunks in batches (desktop SQLite). */
export async function loadEmbeddingsForChunks(
  projectId: string,
  chunkIds: string[]
): Promise<Record<string, number[]>> {
  if (!chunkIds.length) return {};
  const out: Record<string, number[]> = {};
  for (let i = 0; i < chunkIds.length; i += EMBED_LOAD_BATCH) {
    const batch = chunkIds.slice(i, i + EMBED_LOAD_BATCH);
    const partial = await loadEmbeddingsDesktop(projectId, batch);
    Object.assign(out, partial);
  }
  return out;
}

/** Hard cap: never pull the entire MiniLM matrix into the renderer for one RAG query. */
const RAG_VECTOR_LOAD_CAP = 800;

export async function resolveLibraryEmbeddings(
  projectId: string,
  chunks: CorpusChunk[],
  inline?: Record<string, number[]>
): Promise<Record<string, number[]> | undefined> {
  if (inline && Object.keys(inline).some((k) => k !== "__query__")) return inline;
  if (!isDesktopApp()) return inline;
  const libIds = chunks.filter((c) => c.paperId !== "draft").map((c) => c.id);
  if (libIds.length === 0) return undefined;
  const stats = await embeddingStatsDesktop(projectId);
  if (!stats?.count) return undefined;
  // Fair sample across papers when the library is huge — avoids multi‑10MB heap spikes.
  const capped =
    libIds.length <= RAG_VECTOR_LOAD_CAP
      ? libIds
      : (() => {
          const step = Math.ceil(libIds.length / RAG_VECTOR_LOAD_CAP);
          const out: string[] = [];
          for (let i = 0; i < libIds.length && out.length < RAG_VECTOR_LOAD_CAP; i += step) {
            out.push(libIds[i]!);
          }
          return out;
        })();
  return loadEmbeddingsForChunks(projectId, capped);
}

export async function isSemanticIndexReadyForProject(
  projectId: string,
  chunks: CorpusChunk[],
  inline?: Record<string, number[]>
): Promise<boolean> {
  if (inline && Object.keys(inline).some((k) => k !== "__query__")) return true;
  if (!isDesktopApp()) return false;
  const libCount = chunks.filter((c) => c.paperId !== "draft").length;
  if (libCount === 0) return false;
  const stats = await embeddingStatsDesktop(projectId);
  return (stats?.count ?? 0) > 0;
}
