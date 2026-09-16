/**
 * Phase 2 — Deterministic ingestion pipeline:
 * SOURCE -> VALIDATE -> IDENTIFY -> EXTRACT -> NORMALIZE -> STRUCTURE ->
 * METADATA -> CHUNK -> INDEX -> READY. Explicit status at every stage;
 * failures are recoverable (retry resumes from EXTRACT without re-validating
 * bytes; cache hits skip EXTRACT entirely).
 */
import type { DocumentStatus } from "@/lib/documents/types";

export const PIPELINE_STAGES: DocumentStatus[] = [
  "queued",
  "validating",
  "extracting",
  "normalizing",
  "structuring",
  "chunking",
  "indexing",
  "ready",
];

export function nextStage(stage: DocumentStatus): DocumentStatus | null {
  const i = PIPELINE_STAGES.indexOf(stage);
  if (i < 0 || i + 1 >= PIPELINE_STAGES.length) return null;
  return PIPELINE_STAGES[i + 1];
}

/** Restart point after a failure: extraction success is cached, so resume there. */
export function resumeStage(failedStage: DocumentStatus, extractionCached: boolean): DocumentStatus {
  if (failedStage === "failed") return extractionCached ? "structuring" : "extracting";
  return failedStage;
}
