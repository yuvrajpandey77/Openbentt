/**
 * Phase 3 — Web (localStorage) knowledge backend. Same op surface as the
 * desktop SQLite store; offline-first, no network. Durable per browser
 * profile under `openbentt-knowledge-graph` (4.5MB project budget respected
 * by bounded quotas — entities capped at 10k).
 * Used when `window.openbenttResearch?.knowledge` is unavailable.
 */
import { logger } from "@/lib/log";
import { boundedTraverse } from "@/lib/knowledge/traversal";
import {
  validateEntity, validateEvidence, validateRelationship, validateTraversal,
} from "@/lib/knowledge/validation";
import type {
  EntityMergeRecord, Evidence, KnowledgeEntity, Relationship,
} from "@/lib/knowledge/types";

const STORAGE_KEY = "openbentt-knowledge-graph";
const MAX_ENTITIES = 10_000;
const MAX_RELATIONSHIPS = 100_000;

interface Snapshot {
  entities: Record<string, KnowledgeEntity>;
  relationships: Record<string, Relationship>;
  evidence: Record<string, Evidence>;
  merges: EntityMergeRecord[];
}

function blank(): Snapshot {
  return { entities: {}, relationships: {}, evidence: {}, merges: [] };
}

function load(): Snapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed || typeof parsed !== "object") return blank();
    return {
      entities: parsed.entities ?? {}, relationships: parsed.relationships ?? {},
      evidence: parsed.evidence ?? {}, merges: Array.isArray(parsed.merges) ? parsed.merges : [],
    };
  } catch {
    return blank();
  }
}

function save(s: Snapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    logger.warn("knowledge", "web store persist failed (quota?)");
  }
}

function scoped<T extends { projectId?: string }>(rows: T[], projectId?: string): T[] {
  return projectId ? rows.filter((r) => r.projectId === projectId) : rows;
}

export const knowledgeWebStore = {
  upsertEntity(input: Partial<KnowledgeEntity>): KnowledgeEntity {
    const s = load();
    const validated = validateEntity({ ...input, aliases: input.aliases ?? [], externalIds: input.externalIds ?? [], tags: input.tags ?? [] });
    const prev = s.entities[validated.id];
    if (Object.keys(s.entities).length >= MAX_ENTITIES && !prev) {
      throw new Error("Knowledge: entity limit reached");
    }
    const keepUser = prev && prev.provenance === "user-authored" && validated.provenance !== "user-authored";
    const merged: KnowledgeEntity = {
      ...validated,
      canonicalName: keepUser ? prev.canonicalName : validated.canonicalName,
      normalizedName: keepUser ? prev.normalizedName : validated.normalizedName,
      description: keepUser ? prev.description : validated.description,
      aliases: [...new Set([...(prev?.aliases ?? []), ...validated.aliases])].slice(0, 32),
      tags: [...new Set([...(prev?.tags ?? []), ...validated.tags])].slice(0, 32),
      externalIds: [...new Map([...(prev?.externalIds ?? []), ...validated.externalIds]
        .map((e) => [`${e.namespace}:${e.value}`, e] as const)).values()].slice(0, 32),
      provenance: prev ? prev.provenance : validated.provenance,
      createdAt: prev?.createdAt ?? validated.createdAt,
    };
    s.entities[merged.id] = merged;
    save(s);
    return merged;
  },

  getEntity(id: string): KnowledgeEntity | null {
    return load().entities[id] ?? null;
  },

  resolveEntity(id: string): KnowledgeEntity | null {
    const s = load();
    let cur = s.entities[id] ?? null;
    const seen = new Set<string>();
    while (cur && cur.status === "merged" && cur.mergedInto && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = s.entities[cur.mergedInto] ?? null;
    }
    return cur;
  },

  searchEntities(opts: { query?: string; type?: string; status?: string; identifier?: string; tag?: string; projectId?: string; limit?: number } = {}): KnowledgeEntity[] {
    const s = load();
    const q = (opts.query ?? "").trim().toLowerCase();
    let rows = Object.values(s.entities);
    rows = scoped(rows, opts.projectId);
    if (opts.type) rows = rows.filter((e) => e.type === opts.type);
    if (opts.status) rows = rows.filter((e) => e.status === opts.status);
    if (opts.identifier) {
      rows = rows.filter((e) => e.externalIds.some((x) => `${x.namespace}:${x.value}` === opts.identifier));
    }
    if (opts.tag) rows = rows.filter((e) => e.tags.includes(opts.tag!));
    if (q) {
      rows = rows.filter((e) =>
        e.canonicalName.toLowerCase().includes(q) ||
        e.normalizedName.includes(q) ||
        e.aliases.some((a) => a.toLowerCase().includes(q)));
    }
    return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, Math.min(opts.limit ?? 20, 100));
  },

  setEntityStatus(id: string, status: KnowledgeEntity["status"]): KnowledgeEntity {
    const s = load();
    const cur = s.entities[id];
    if (!cur) throw new Error("Knowledge: entity not found");
    cur.status = validateEntity({ ...cur, status }).status;
    cur.updatedAt = new Date().toISOString();
    save(s);
    return cur;
  },

  mergeEntities(fromId: string, intoId: string, reason?: string, origin: KnowledgeEntity["origin"] = "system"): { mergeId: string; from: KnowledgeEntity; into: KnowledgeEntity } {
    const s = load();
    if (fromId === intoId) throw new Error("Knowledge: cannot merge an entity into itself");
    const from = s.entities[fromId];
    const into = s.entities[intoId];
    if (!from) throw new Error("Knowledge: from entity not found");
    if (!into) throw new Error("Knowledge: into entity not found");
    const mergeId = `mrg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    s.merges.push({ id: mergeId, fromEntityId: fromId, intoEntityId: intoId, reason, origin, createdAt: new Date().toISOString() });
    from.status = "merged";
    from.mergedInto = intoId;
    from.updatedAt = new Date().toISOString();
    into.aliases = [...new Set([...into.aliases, ...from.aliases, from.canonicalName])].slice(0, 32);
    const ids = new Map([...into.externalIds, ...from.externalIds].map((e) => [`${e.namespace}:${e.value}`, e] as const));
    into.externalIds = [...ids.values()].slice(0, 32);
    into.tags = [...new Set([...into.tags, ...from.tags])].slice(0, 32);
    into.updatedAt = new Date().toISOString();
    save(s);
    return { mergeId, from, into };
  },

  listMerges(entityId: string): EntityMergeRecord[] {
    return load().merges.filter((m) => m.fromEntityId === entityId || m.intoEntityId === entityId);
  },

  upsertRelationship(input: Partial<Relationship>): Relationship {
    const s = load();
    const validated = validateRelationship(input);
    if (!s.entities[validated.subjectEntityId]) throw new Error("Knowledge: subject entity not found");
    if (!s.entities[validated.objectEntityId]) throw new Error("Knowledge: object entity not found");
    if (Object.keys(s.relationships).length >= MAX_RELATIONSHIPS && !s.relationships[validated.id]) {
      throw new Error("Knowledge: relationship limit reached");
    }
    const prev = s.relationships[validated.id];
    const keepUser = prev && prev.provenance === "user-authored" && validated.provenance !== "user-authored";
    s.relationships[validated.id] = {
      ...validated,
      properties: keepUser ? prev.properties : validated.properties,
      status: keepUser ? prev.status : validated.status,
      provenance: prev ? prev.provenance : validated.provenance,
      createdAt: prev?.createdAt ?? validated.createdAt,
    };
    save(s);
    return s.relationships[validated.id];
  },

  getRelationship(id: string): Relationship | null {
    return load().relationships[id] ?? null;
  },

  listRelationships(entityId: string, opts: { direction?: "in" | "out"; type?: string; statuses?: string[]; projectId?: string; limit?: number } = {}): Relationship[] {
    const s = load();
    let rows = Object.values(s.relationships).filter((r) => r.subjectEntityId === entityId || r.objectEntityId === entityId);
    if (opts.direction === "out") rows = rows.filter((r) => r.subjectEntityId === entityId);
    if (opts.direction === "in") rows = rows.filter((r) => r.objectEntityId === entityId);
    if (opts.type) rows = rows.filter((r) => r.type === opts.type);
    const statuses = opts.statuses ?? ["asserted", "uncertain"];
    rows = rows.filter((r) => statuses.includes(r.status));
    rows = scoped(rows, opts.projectId);
    return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, Math.min(opts.limit ?? 50, 100));
  },

  setRelationshipStatus(id: string, status: Relationship["status"]): Relationship {
    const s = load();
    const cur = s.relationships[id];
    if (!cur) throw new Error("Knowledge: relationship not found");
    cur.status = validateRelationship({ ...cur, status }).status;
    cur.updatedAt = new Date().toISOString();
    save(s);
    return cur;
  },

  addEvidence(input: Partial<Evidence>): Evidence {
    const s = load();
    const validated = validateEvidence(input);
    const table = validated.subjectType === "entity" ? s.entities : s.relationships;
    if (!table[validated.subjectId]) throw new Error("Knowledge: evidence subject not found");
    const count = Object.values(s.evidence).filter((e) =>
      e.subjectType === validated.subjectType && e.subjectId === validated.subjectId).length;
    if (count >= 200 && !s.evidence[validated.id]) throw new Error("Knowledge: evidence limit reached for this subject");
    s.evidence[validated.id] = validated;
    save(s);
    return validated;
  },

  getEvidenceFor(subjectType: "entity" | "relationship", subjectId: string): Evidence[] {
    return Object.values(load().evidence)
      .filter((e) => e.subjectType === subjectType && e.subjectId === subjectId)
      .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  },

  listEvidenceForDocument(documentId: string, opts: { limit?: number } = {}): Evidence[] {
    return Object.values(load().evidence)
      .filter((e) => e.sourceRef.documentId === documentId)
      .slice(0, Math.min(opts.limit ?? 50, 100));
  },

  markEvidenceStaleForDocument(documentId: string, currentVersion: number): { marked: number } {
    const s = load();
    let marked = 0;
    for (const e of Object.values(s.evidence)) {
      if (e.sourceRef.documentId === documentId && e.status === "current" &&
        e.evidenceDocVersion !== undefined && currentVersion > e.evidenceDocVersion) {
        e.status = "stale";
        marked++;
      }
    }
    if (marked) save(s);
    return { marked };
  },

  setEvidenceStatus(id: string, status: Evidence["status"]): Evidence {
    const s = load();
    const cur = s.evidence[id];
    if (!cur) throw new Error("Knowledge: evidence not found");
    cur.status = validateEvidence({ ...cur, status }).status;
    save(s);
    return cur;
  },

  traverse(entityId: string, opts: { depth?: number; limit?: number } = {}): { nodes: string[]; steps: { edgeId: string; type: string; from: string; to: string; depth: number }[] } {
    const s = load();
    if (!s.entities[entityId]) throw new Error("Knowledge: entity not found");
    const { id, depth, limit } = validateTraversal(entityId, opts.depth ?? 1, opts.limit ?? 50);
    const edges = Object.values(s.relationships).map((r) => ({
      id: r.id, type: r.type, subject: r.subjectEntityId, object: r.objectEntityId, status: r.status,
    }));
    return boundedTraverse(id, edges, { depth, limit });
  },

  stats(projectId?: string): { entities: number; relationships: number; evidence: number } {
    const s = load();
    const inScope = <T extends { projectId?: string }>(rows: T[]): number =>
      projectId ? rows.filter((r) => r.projectId === projectId).length : rows.length;
    return {
      entities: inScope(Object.values(s.entities)),
      relationships: inScope(Object.values(s.relationships)),
      evidence: inScope(Object.values(s.evidence)),
    };
  },

  /** Test seam. */
  resetForTest(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  },
};
