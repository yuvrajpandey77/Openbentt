/**
 * Phase 3 — Relationship vocabulary (typed facade; ids owned by knowledgeCore.mjs).
 */
import {
  RELATIONSHIP_TYPE_IDS,
  SYMMETRIC_RELATIONSHIP_IDS,
} from "@/lib/knowledge/knowledgeCore.mjs";

export interface RelationshipTypeDefinition {
  id: string;
  label: string;
  description: string;
  symmetric?: boolean;
}

const META: Record<string, { label: string; description: string }> = {
  AUTHORED_BY: { label: "Authored by", description: "Paper was written by a person." },
  PUBLISHED_BY: { label: "Published by", description: "Paper/venue published by an organization." },
  PUBLISHED_IN: { label: "Published in", description: "Paper appeared in a venue." },
  CITES: { label: "Cites", description: "Paper cites another paper." },
  REFERENCES: { label: "References", description: "Document references an entity." },
  USES_METHOD: { label: "Uses method", description: "Paper/model uses a method." },
  EVALUATED_ON: { label: "Evaluated on", description: "Paper/model evaluated on a dataset." },
  REPORTS_METRIC: { label: "Reports metric", description: "Paper reports a metric value." },
  PROPOSES: { label: "Proposes", description: "Paper proposes a method/model." },
  EXTENDS: { label: "Extends", description: "Work extends prior work." },
  REPRODUCES: { label: "Reproduces", description: "Work reproduces reported results." },
  BUILT_WITH: { label: "Built with", description: "Product/model built with a technology." },
  USES: { label: "Uses", description: "Entity uses another entity." },
  DEPENDS_ON: { label: "Depends on", description: "Entity depends on another entity." },
  DERIVED_FROM: { label: "Derived from", description: "Model derived from another model." },
  PART_OF: { label: "Part of", description: "Entity is part of a larger entity." },
  LOCATED_IN: { label: "Located in", description: "Organization/event located in a place." },
  RELATED_TO: { label: "Related to", description: "Weak untyped association." },
  ASSIGNED_TO: { label: "Assigned to", description: "Task/issue assigned to a person." },
  SENT_BY: { label: "Sent by", description: "Email/message sent by a person." },
  WORKS_ON: { label: "Works on", description: "Person works on a project." },
  IMPLEMENTS: { label: "Implements", description: "Pull request implements an issue/task." },
  DISCUSSED_IN: { label: "Discussed in", description: "Topic/project discussed in a meeting." },
};

const SYM = new Set(SYMMETRIC_RELATIONSHIP_IDS as string[]);

export const RELATIONSHIP_TYPES: RelationshipTypeDefinition[] =
  (RELATIONSHIP_TYPE_IDS as string[]).map((id) => ({
    id,
    label: META[id]?.label ?? id,
    description: META[id]?.description ?? "",
    ...(SYM.has(id) ? { symmetric: true as const } : {}),
  }));

const BY_ID = new Map(RELATIONSHIP_TYPES.map((t) => [t.id, t]));

export function isKnownRelationshipType(type: string): boolean {
  return BY_ID.has(type);
}

export function isSymmetricRelationship(type: string): boolean {
  return BY_ID.get(type)?.symmetric === true;
}
