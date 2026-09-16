/**
 * Phase 4 — Deterministic connector import (dry-run + idempotent apply).
 * Maps ExternalItem → Phase 3 ontology via the existing deterministic
 * extractors (extractFromCrossref / extractFromZotero), then merges into an
 * injected KnowledgeBackend with user-authored precedence.
 *
 * Default: create missing, enrich external-managed fields, never overwrite
 * user-authored fields, never delete, preserve provenance, detailed result.
 */
import { itemHashFor } from "@/lib/connectors/connectorCore.mjs";
import { CONNECTOR_LIMITS } from "@/lib/connectors/connectorCore.mjs";
import { ConnectorError } from "@/lib/connectors/connectorErrors";
import {
  connectorEntityProperties,
  evidenceForConnectorEntity,
  evidenceForConnectorRelationship,
  sourceRefForConnectorItem,
} from "@/lib/connectors/connectorEvidence";
import { identifiersForItem, resolveIdentityForItem } from "@/lib/connectors/connectorIdentity";
import { validateExternalItem } from "@/lib/connectors/connectorNormalize";
import { extractFromCrossref, extractFromZotero } from "@/lib/knowledge/extract";
import type { Evidence, KnowledgeEntity, Relationship } from "@/lib/knowledge/types";
import type {
  DryRunResult,
  ExternalItem,
  ImportConflict,
  ImportItemResult,
  ImportOptions,
  ImportResult,
} from "@/lib/connectors/connectorTypes";

const MAX_ITEMS = (CONNECTOR_LIMITS as { maxItemsPerImport: number }).maxItemsPerImport;

/** Minimal backend surface (implemented by web fallback, Electron, and tests). */
export interface KnowledgeBackend {
  getEntity(id: string): KnowledgeEntity | null | Promise<KnowledgeEntity | null>;
  upsertEntity(e: Partial<KnowledgeEntity>): KnowledgeEntity | Promise<KnowledgeEntity>;
  getRelationship?(id: string): Relationship | null | Promise<Relationship | null>;
  upsertRelationship(r: Partial<Relationship>): Relationship | Promise<Relationship>;
  addEvidence(e: Partial<Evidence>): Evidence | Promise<Evidence>;
  getEvidenceFor(subjectType: "entity" | "relationship", subjectId: string): Evidence[] | Promise<Evidence[]>;
}

export interface HashStore {
  getHash(connectorId: string, externalId: string): string | undefined | Promise<string | undefined>;
  setHash(connectorId: string, externalId: string, hash: string): void | Promise<void>;
}

const noHashStore: HashStore = {
  getHash: () => undefined,
  setHash: () => undefined,
};

function isUserAuthored(e: KnowledgeEntity | null | undefined): boolean {
  return e?.provenance === "user-authored" || e?.origin === "user";
}

/** Case-insensitive tag union (no casing/Unicode duplicates; keep first). */
function mergeTags(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...a, ...b]) {
    const k = t.normalize("NFKC").toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.slice(0, 32);
}

function mergeEntityForImport(
  prev: KnowledgeEntity | null,
  next: KnowledgeEntity,
  opts: Required<Pick<ImportOptions, "preserveUserData" | "allowUpdate">>,
  conflicts: ImportConflict[],
  connectorId: string,
  externalId: string
): { entity: KnowledgeEntity; changed: boolean; conflict: boolean } {
  if (!prev) return { entity: next, changed: true, conflict: false };
  const keepUser = opts.preserveUserData && isUserAuthored(prev);
  let changed = false;
  let conflict = false;
  const merged: KnowledgeEntity = { ...prev };
  // Name/description: user-authored wins; record conflicts instead of overwriting.
  if (keepUser) {
    if (next.canonicalName !== prev.canonicalName) {
      conflict = true;
      conflicts.push({
        connectorId, externalId, entityId: prev.id, field: "canonicalName",
        localValue: prev.canonicalName.slice(0, 200), externalValue: next.canonicalName.slice(0, 200),
      });
    }
    if ((next.description ?? "") !== (prev.description ?? "") && next.description) {
      conflict = true;
      conflicts.push({
        connectorId, externalId, entityId: prev.id, field: "description",
        localValue: (prev.description ?? "").slice(0, 200), externalValue: (next.description ?? "").slice(0, 200),
      });
    }
  } else if (opts.allowUpdate) {
    if (next.canonicalName !== prev.canonicalName && next.canonicalName.trim()) {
      merged.canonicalName = next.canonicalName;
      changed = true;
    }
    if ((next.description ?? "") !== (prev.description ?? "") && next.description) {
      merged.description = next.description;
      changed = true;
    }
  }
  // External-managed merges (additive only): aliases, tags, externalIds, fill-missing props.
  const aliases = [...new Set([...(prev.aliases ?? []), ...(next.aliases ?? [])])].slice(0, 32);
  if (aliases.length !== (prev.aliases ?? []).length) { merged.aliases = aliases; changed = true; }
  const ids = new Map((prev.externalIds ?? []).map((x) => [`${x.namespace}:${x.value}`, x]));
  for (const x of next.externalIds ?? []) {
    const k = `${x.namespace}:${x.value}`;
    if (!ids.has(k) && ids.size < 32) { ids.set(k, x); changed = true; }
  }
  merged.externalIds = [...ids.values()];
  const tags = mergeTags(prev.tags ?? [], next.tags ?? []);
  if (tags.length !== (prev.tags ?? []).length || tags.some((t, i) => t !== (prev.tags ?? [])[i])) {
    merged.tags = tags;
    changed = true;
  }
  const props = { ...(prev.properties ?? {}) };
  for (const [k, v] of Object.entries(next.properties ?? {})) {
    if (!(k in props) && Object.keys(props).length < 32) { props[k] = v; changed = true; }
    else if (!keepUser && opts.allowUpdate && props[k] !== v && k.startsWith("connector:")) {
      props[k] = v; changed = true;
    }
  }
  merged.properties = props;
  merged.updatedAt = changed ? new Date().toISOString() : prev.updatedAt;
  return { entity: merged, changed, conflict };
}

function buildExtracted(item: ExternalItem, projectId?: string) {
  const ref = sourceRefForConnectorItem(item);
  if (item.connectorId === "crossref") {
    const doi = item.identifiers.find((i) => i.namespace === "doi")?.value ?? item.externalId;
    return extractFromCrossref({
      doi,
      title: item.title,
      authors: item.authors,
      year: item.publicationDate,
      journal: item.venue,
      publisher: (item.rawMetadata["publisher"] as string) ?? undefined,
      projectId,
    }, ref);
  }
  if (item.connectorId === "zotero") {
    const doi = item.identifiers.find((i) => i.namespace === "doi")?.value;
    const citekey = item.identifiers.find((i) => i.namespace === "citekey")?.value;
    return extractFromZotero({
      key: item.externalId,
      title: item.title,
      creators: item.authors,
      year: item.publicationDate,
      doi,
      url: item.externalUrl,
      collections: item.collections,
      tags: item.tags,
      citekey,
      projectId,
    }, ref);
  }
  // Future connectors: metadata-only paper fallback (no invented relations).
  const doi = item.identifiers.find((i) => i.namespace === "doi")?.value ?? item.externalId;
  return extractFromCrossref({
    doi, title: item.title, authors: item.authors, year: item.publicationDate,
    journal: item.venue, projectId,
  }, ref);
}

interface PlannedItem {
  item: ExternalItem;
  hash: string;
  entityId: string;
  entities: KnowledgeEntity[];
  relationships: Relationship[];
  evidence: Evidence[];
  prevExists: boolean;
}

async function planItem(
  item: ExternalItem, backend: KnowledgeBackend, opts: ImportOptionsResolved
): Promise<PlannedItem> {
  validateExternalItem(item);
  const resolved = resolveIdentityForItem(item);
  if (!resolved) throw new ConnectorError("normalization_failed", "identity");
  const extracted = buildExtracted(item, opts.projectId);
  // Stamp connector-managed properties + namespaced identifiers on the paper.
  const paper = extracted.entities.find((e) => e.id === resolved.entityId) ?? extracted.entities[0];
  if (paper) {
    paper.externalIds = identifiersForItem(item, resolved);
    paper.properties = { ...paper.properties, ...connectorEntityProperties(item) };
    if (item.collections.length || item.tags.length) {
      paper.tags = mergeTags(paper.tags ?? [], [...item.collections, ...item.tags]);
    }
  }
  const prev = await backend.getEntity(resolved.entityId);
  return {
    item, hash: itemHashFor(item) as string, entityId: resolved.entityId,
    entities: extracted.entities, relationships: extracted.relationships, evidence: extracted.evidence,
    prevExists: Boolean(prev),
  };
}

interface ImportOptionsResolved {
  projectId?: string;
  dryRun: boolean;
  allowCreate: boolean;
  allowUpdate: boolean;
  preserveUserData: boolean;
  createEvidence: boolean;
  createRelationships: boolean;
}

function resolveOpts(opts?: ImportOptions): ImportOptionsResolved {
  return {
    projectId: opts?.projectId,
    dryRun: opts?.dryRun ?? false,
    allowCreate: opts?.allowCreate ?? true,
    allowUpdate: opts?.allowUpdate ?? true,
    preserveUserData: opts?.preserveUserData ?? true,
    createEvidence: opts?.createEvidence ?? true,
    createRelationships: opts?.createRelationships ?? true,
  };
}

/** Dry run: validation + normalization + identity + conflict detection, no mutation. */
export async function dryRunImport(
  items: ExternalItem[], backend: KnowledgeBackend, opts?: ImportOptions, hashes?: HashStore
): Promise<DryRunResult> {
  const o = resolveOpts(opts);
  const store = hashes ?? noHashStore;
  const result: DryRunResult = { wouldCreate: [], wouldUpdate: [], wouldSkip: [], conflicts: [], validationErrors: [] };
  const bounded = items.slice(0, MAX_ITEMS);
  for (const item of bounded) {
    try {
      const planned = await planItem(item, backend, o);
      const prev = await backend.getEntity(planned.entityId);
      const oldHash = await store.getHash(item.connectorId, item.externalId);
      if (prev && oldHash === planned.hash) {
        result.wouldSkip.push(planned.entityId);
        continue;
      }
      const conflicts: ImportConflict[] = [];
      if (prev) {
        const paper = planned.entities.find((e) => e.id === planned.entityId);
        if (paper) mergeEntityForImport(prev, paper, o, conflicts, item.connectorId, item.externalId);
        if (conflicts.length) result.conflicts.push(...conflicts);
        result.wouldUpdate.push(planned.entityId);
      } else if (o.allowCreate) {
        result.wouldCreate.push(planned.entityId);
      } else {
        result.wouldSkip.push(planned.entityId);
      }
    } catch (err) {
      result.validationErrors.push({
        connectorId: (item as ExternalItem)?.connectorId ?? "unknown",
        externalId: (item as ExternalItem)?.externalId ?? "unknown",
        error: err instanceof Error ? err.message.slice(0, 300) : "Invalid item",
      });
    }
  }
  return result;
}

/** Deterministic import with per-item transaction semantics (caller isolates failures). */
export async function importExternalItems(
  items: ExternalItem[], backend: KnowledgeBackend, opts?: ImportOptions, hashes?: HashStore
): Promise<ImportResult> {
  const o = resolveOpts(opts);
  const store = hashes ?? noHashStore;
  const result: ImportResult = { created: [], updated: [], unchanged: [], skipped: [], conflicts: [], failed: [], items: [] };
  const bounded = items.slice(0, MAX_ITEMS);
  for (const raw of bounded) {
    const connectorId = (raw as ExternalItem)?.connectorId ?? "unknown";
    const externalId = (raw as ExternalItem)?.externalId ?? "unknown";
    const fail = (error: string): void => {
      result.failed.push({ connectorId, externalId, error: error.slice(0, 300) });
      result.items.push({ connectorId, externalId, status: "failed", detail: error.slice(0, 300) });
    };
    try {
      const planned = await planItem(raw, backend, o);
      const oldHash = await store.getHash(raw.connectorId, raw.externalId);
      const prev = await backend.getEntity(planned.entityId);
      if (prev && oldHash === planned.hash) {
        result.unchanged.push(planned.entityId);
        result.items.push({ connectorId, externalId, entityId: planned.entityId, status: "unchanged" });
        continue;
      }
      if (o.dryRun) {
        if (!prev && !o.allowCreate) {
          result.skipped.push(planned.entityId);
          result.items.push({ connectorId, externalId, entityId: planned.entityId, status: "skipped" });
        } else {
          result.items.push({ connectorId, externalId, entityId: planned.entityId, status: prev ? "updated" : "created" });
        }
        continue;
      }
      if (!prev && !o.allowCreate) {
        result.skipped.push(planned.entityId);
        result.items.push({ connectorId, externalId, entityId: planned.entityId, status: "skipped" });
        continue;
      }
      // Apply entities with user-authored precedence.
      let anyChanged = !prev;
      let itemConflict = false;
      const conflicts: ImportConflict[] = [];
      for (const next of planned.entities.slice(0, 64)) {
        const existing = await backend.getEntity(next.id);
        const merged = mergeEntityForImport(existing, next, o, conflicts, raw.connectorId, raw.externalId);
        if (merged.conflict) itemConflict = true;
        if (!existing || merged.changed) {
          await backend.upsertEntity(merged.entity);
          anyChanged = true;
        }
      }
      result.conflicts.push(...conflicts);
      // Relationships (dedupe by id; never invent beyond extractor output).
      if (o.createRelationships) {
        for (const rel of planned.relationships.slice(0, 64)) {
          const existingRel = backend.getRelationship ? await backend.getRelationship(rel.id) : null;
          if (existingRel) continue;
          try {
            await backend.upsertRelationship(rel);
            anyChanged = true;
          } catch {
            // One bad relationship must not fail sibling items; record and continue.
            continue;
          }
        }
      }
      // Evidence (dedupe: same chunk + type + quote already present).
      if (o.createEvidence) {
        for (const ev of planned.evidence.slice(0, 64)) {
          const prior = await backend.getEvidenceFor(ev.subjectType, ev.subjectId);
          const evChunk = (ev.sourceRef as { chunkId?: string }).chunkId;
          const dupe = prior.some((p) =>
            (p.sourceRef as { chunkId?: string }).chunkId === evChunk &&
            p.evidenceType === ev.evidenceType && (p.quote ?? "") === (ev.quote ?? ""));
          if (dupe) continue;
          try {
            await backend.addEvidence(ev);
            anyChanged = true;
          } catch {
            continue;
          }
        }
        // Provider-version evidence on the paper for staleness tracking.
        try {
          const priorPaper = await backend.getEvidenceFor("entity", planned.entityId);
          const marker = evidenceForConnectorEntity(planned.entityId, raw, {
            quote: `Provider ${raw.connectorId} record ${raw.externalId} retrieved ${raw.retrievedAt}.`,
            evidenceType: "metadata", projectId: o.projectId,
          });
          const markerChunk = (marker.sourceRef as { chunkId?: string }).chunkId;
          if (!priorPaper.some((p) => (p.sourceRef as { chunkId?: string }).chunkId === markerChunk && (p.quote ?? "") === (marker.quote ?? ""))) {
            await backend.addEvidence(marker);
            anyChanged = true;
          }
        } catch {
          /* evidence marker is best-effort */
        }
      }
      await store.setHash(raw.connectorId, raw.externalId, planned.hash);
      if (itemConflict) {
        result.conflicts.push(...[]);
        result.items.push({ connectorId, externalId, entityId: planned.entityId, status: "conflict", detail: "User-authored fields preserved; external value kept as evidence." });
        if (!prev) result.created.push(planned.entityId);
        else if (anyChanged) result.updated.push(planned.entityId);
        else result.unchanged.push(planned.entityId);
      } else if (!prev) {
        result.created.push(planned.entityId);
        result.items.push({ connectorId, externalId, entityId: planned.entityId, status: "created" });
      } else if (anyChanged) {
        result.updated.push(planned.entityId);
        result.items.push({ connectorId, externalId, entityId: planned.entityId, status: "updated" });
      } else {
        result.unchanged.push(planned.entityId);
        result.items.push({ connectorId, externalId, entityId: planned.entityId, status: "unchanged" });
      }
    } catch (err) {
      fail(err instanceof Error ? err.message : "Import failed");
    }
  }
  return result;
}
