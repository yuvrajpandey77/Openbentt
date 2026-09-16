/**
 * Phase 3 — Local JSON export/import. Preserves ids, provenance, status,
 * origin, timestamps. Import re-validates everything (no provenance bypass,
 * no executable content — plain data only).
 */
import { validateEntity, validateRelationship, validateEvidence } from "@/lib/knowledge/validation";
import type { EntityMergeRecord, Evidence, KnowledgeEntity, Relationship } from "@/lib/knowledge/types";

export interface KnowledgeExport {
  format: "openbentt-knowledge-v1";
  exportedAt: string;
  entities: KnowledgeEntity[];
  relationships: Relationship[];
  evidence: Evidence[];
  merges?: EntityMergeRecord[];
}

export function exportKnowledge(input: {
  entities: KnowledgeEntity[]; relationships: Relationship[]; evidence: Evidence[]; merges?: EntityMergeRecord[];
}): KnowledgeExport {
  return {
    format: "openbentt-knowledge-v1",
    exportedAt: new Date().toISOString(),
    entities: input.entities, relationships: input.relationships,
    evidence: input.evidence, merges: input.merges ?? [],
  };
}

export function importKnowledge(raw: unknown): KnowledgeExport {
  if (!raw || typeof raw !== "object") throw new Error("Invalid knowledge import");
  const doc = raw as Partial<KnowledgeExport>;
  if (doc.format !== "openbentt-knowledge-v1") throw new Error("Unsupported knowledge format");
  if (!Array.isArray(doc.entities) || !Array.isArray(doc.relationships) || !Array.isArray(doc.evidence)) {
    throw new Error("Invalid knowledge import");
  }
  return {
    format: "openbentt-knowledge-v1",
    exportedAt: new Date().toISOString(),
    entities: doc.entities.map(validateEntity),
    relationships: doc.relationships.map(validateRelationship),
    evidence: doc.evidence.map(validateEvidence),
    merges: Array.isArray(doc.merges) ? doc.merges.filter((m) =>
      m && typeof m.id === "string" && typeof m.fromEntityId === "string" && typeof m.intoEntityId === "string"
    ) : [],
  };
}
