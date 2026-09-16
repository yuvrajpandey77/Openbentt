/**
 * Phase 3 — Canonical knowledge + ontology representation.
 *
 * Evidence-first: the ontology stores knowledge ABOUT documents, never another
 * copy of document text. Every relationship assertion is traceable through
 * Evidence → Phase 2 SourceRef → document/version/page/section/block/chunk.
 * No agents/MCP/connectors/auth. No graph database (SQLite v8 tables).
 */

import type { SourceRef } from "@/lib/documents/types";

export type KnowledgeOrigin =
  | "user"
  | "document"
  | "zotero"
  | "crossref"
  | "import"
  | "system"
  | "future-llm";

export type EntityStatus = "active" | "unresolved" | "deprecated" | "merged";
export type RelationshipStatus = "asserted" | "uncertain" | "deprecated" | "retracted";
export type EvidenceStatus = "current" | "stale" | "retracted";

/** Confidence is a ranking hint, not truth. See OPENBENTT_ONTOLOGY.md. */
export type ConfidenceLevel = "high" | "medium" | "low";

export interface ExternalId {
  namespace: string;
  value: string;
}

export interface KnowledgeEntity {
  id: string;
  type: string;
  canonicalName: string;
  normalizedName: string;
  description?: string;
  status: EntityStatus;
  /** Merged entities point at their canonical successor (history preserved). */
  mergedInto?: string;
  properties: Record<string, string>;
  aliases: string[];
  externalIds: ExternalId[];
  tags: string[];
  origin: KnowledgeOrigin;
  /** automatic | user-authored | imported — future agents need this split. */
  provenance: "automatic" | "user-authored" | "imported";
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Relationship {
  id: string;
  type: string;
  subjectEntityId: string;
  objectEntityId: string;
  /** Direction matters: subject --TYPE--> object. Never assumed symmetric. */
  properties: Record<string, string>;
  status: RelationshipStatus;
  confidence: ConfidenceLevel;
  origin: KnowledgeOrigin;
  provenance: "automatic" | "user-authored" | "imported";
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  /** What this evidence supports: "entity" | "relationship". */
  subjectType: "entity" | "relationship";
  subjectId: string;
  /** Optional predicate/object for claim-shaped evidence. */
  predicate?: string;
  quote?: string;
  evidenceType: "document" | "metadata" | "citation" | "user" | "import";
  /** Phase 2 provenance — reused verbatim, never duplicated. */
  sourceRef: SourceRef;
  /** Document version + extractor the evidence was captured against. */
  evidenceDocVersion?: number;
  evidenceExtractorVersion?: string;
  confidence: ConfidenceLevel;
  status: EvidenceStatus;
  origin: KnowledgeOrigin;
  projectId?: string;
  createdAt: string;
}

export interface EntityMergeRecord {
  id: string;
  fromEntityId: string;
  intoEntityId: string;
  reason?: string;
  origin: KnowledgeOrigin;
  createdAt: string;
}

export interface EntityTypeDefinition {
  id: string;
  label: string;
  description: string;
}

/**
 * Extension point ONLY (Phase 3 executes no LLM extraction).
 * Deterministic extraction now; a future phase may implement this interface
 * for opt-in enrichment without touching the model.
 */
export interface KnowledgeEnricher {
  readonly name: string;
  enrich(input: { text: string; sourceRef: SourceRef }): Promise<{
    entities: Partial<KnowledgeEntity>[];
    relationships: Partial<Relationship>[];
  }>;
}
