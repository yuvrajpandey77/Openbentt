import {
  embeddingStatsDesktop,
  loadEmbeddingsDesktop,
} from "@/lib/research/researchDesktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";
import type { CorpusChunk } from "@/types/researchProject";

const EMBED_LOAD_BATCH = 32;

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
  return loadEmbeddingsForChunks(projectId, libIds);
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
