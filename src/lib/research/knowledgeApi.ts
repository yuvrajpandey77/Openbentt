/**
 * Phase 3 — Knowledge API: desktop IPC (`research:knowledge` on the existing
 * openbenttResearch bridge) with localStorage web fallback. Heavy graph work
 * stays in the main process (desktop) or bounded local ops (web); React
 * components never query SQLite directly.
 */
import { knowledgeWebStore } from "@/lib/knowledge/webStore";
import type { Evidence, KnowledgeEntity, Relationship } from "@/lib/knowledge/types";

function bridge(): { knowledge: (op: string, payload?: unknown) => Promise<unknown> } | undefined {
  try {
    return window.openbenttResearch?.knowledge
      ? (window.openbenttResearch as unknown as { knowledge: (op: string, payload?: unknown) => Promise<unknown> })
      : undefined;
  } catch {
    return undefined;
  }
}

export function hasKnowledgeDesktopApi(): boolean {
  return Boolean(bridge());
}

async function call<T>(op: string, payload?: unknown, fallback?: () => T): Promise<T> {
  const b = bridge();
  if (b) return (await b.knowledge(op, payload)) as T;
  if (fallback) return fallback();
  throw new Error("Knowledge store unavailable");
}

export const knowledgeApi = {
  upsertEntity: (e: Partial<KnowledgeEntity>) =>
    call<KnowledgeEntity>("upsertEntity", e, () => knowledgeWebStore.upsertEntity(e)),
  getEntity: (id: string) =>
    call<KnowledgeEntity | null>("getEntity", { id }, () => knowledgeWebStore.getEntity(id)),
  resolveEntity: (id: string) =>
    call<KnowledgeEntity | null>("resolveEntity", { id }, () => knowledgeWebStore.resolveEntity(id)),
  searchEntities: (opts?: Record<string, unknown>) =>
    call<KnowledgeEntity[]>("searchEntities", opts ?? {}, () => knowledgeWebStore.searchEntities(opts ?? {})),
  setEntityStatus: (id: string, status: KnowledgeEntity["status"]) =>
    call<KnowledgeEntity>("setEntityStatus", { id, status }, () => knowledgeWebStore.setEntityStatus(id, status)),
  mergeEntities: (fromId: string, intoId: string, reason?: string) =>
    call("mergeEntities", { fromId, intoId, reason }, () => knowledgeWebStore.mergeEntities(fromId, intoId, reason)),
  upsertRelationship: (r: Partial<Relationship>) =>
    call<Relationship>("upsertRelationship", r, () => knowledgeWebStore.upsertRelationship(r)),
  listRelationships: (entityId: string, opts?: Record<string, unknown>) =>
    call<Relationship[]>("listRelationships", { entityId, opts }, () => knowledgeWebStore.listRelationships(entityId, opts)),
  addEvidence: (e: Partial<Evidence>) =>
    call<Evidence>("addEvidence", e, () => knowledgeWebStore.addEvidence(e)),
  getEvidenceFor: (subjectType: "entity" | "relationship", subjectId: string) =>
    call<Evidence[]>("getEvidenceFor", { subjectType, subjectId }, () => knowledgeWebStore.getEvidenceFor(subjectType, subjectId)),
  listEvidenceForDocument: (documentId: string) =>
    call<Evidence[]>("listEvidenceForDocument", { documentId }, () => knowledgeWebStore.listEvidenceForDocument(documentId)),
  traverse: (entityId: string, opts?: { depth?: number; limit?: number }) =>
    call("traverse", { entityId, opts }, () => knowledgeWebStore.traverse(entityId, opts)),
  stats: (projectId?: string) =>
    call("stats", { projectId }, () => knowledgeWebStore.stats(projectId)),
};
