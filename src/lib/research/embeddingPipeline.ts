/**
 * Canonical semantic (embedding) index rebuild — all UI paths must use this module.
 */
export {
  startSemanticIndexRebuild as requestSemanticIndexRebuild,
  type SemanticRebuildController,
} from "@/lib/research/semanticIndexRebuild";

export type { EmbeddingIndexProgress } from "@/lib/research/embeddingIndex";
