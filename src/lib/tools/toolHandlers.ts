/**
 * Phase 5 — Renderer/web tool handlers (thin adapters over existing
 * Phase 2/3/4 services; no new business logic, no duplicates).
 * Each handler receives validated input + context and returns the
 * output-schema top-level object. All outputs are bounded fresh objects.
 */
import { knowledgeWebStore } from "@/lib/knowledge/webStore";
import { knowledgeApi, hasKnowledgeDesktopApi } from "@/lib/research/knowledgeApi";
import {
  getChunks,
  getDocument,
  inspect as inspectDocument,
} from "@/lib/documents/service";
import { searchDocuments } from "@/lib/documents/search";
import type { DocumentSearchFilters } from "@/lib/documents/search";
import {
  connectorApi,
  hasConnectorDesktopApi,
} from "@/lib/connectors/connectorApi";
import { listConnectorDefinitions } from "@/lib/connectors/connectorRegistry";
import { crossrefSearch } from "@/lib/connectors/crossrefConnector";
import { exportKnowledge } from "@/lib/knowledge/exportImport";
import { loadResearchProject } from "@/lib/research/projectStore";
import { evaluateCalculation } from "@/lib/tools/toolCore.mjs";
import { ToolError, toToolError } from "@/lib/tools/toolErrors";
import type { ToolExecutionContext } from "@/lib/tools/toolTypes";

export interface ToolHandler {
  (input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<Record<string, unknown>>;
}

function pickProject(input: Record<string, unknown>, ctx: ToolExecutionContext): string | undefined {
  const p = (input.projectId as string | undefined) ?? ctx.projectId;
  return p;
}

function capText(s: unknown, max: number): string | undefined {
  if (typeof s !== "string") return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

/* ---------------- knowledge ---------------- */

async function knowledgeSearch(input: Record<string, unknown>, ctx: ToolExecutionContext) {
  const projectId = pickProject(input, ctx);
  const opts: Record<string, unknown> = {
    limit: Math.min(Number(input.limit ?? 20), 100),
    projectId,
  };
  if (typeof input.query === "string" && input.query.trim()) opts.query = input.query.slice(0, 500);
  if (typeof input.entityType === "string" && input.entityType) opts.type = input.entityType.slice(0, 64);
  if (typeof input.tag === "string" && input.tag) opts.tag = input.tag.slice(0, 64);
  if (typeof input.identifier === "string" && input.identifier) opts.identifier = input.identifier.slice(0, 512);
  if (typeof input.status === "string" && input.status) opts.status = input.status;
  // Project isolation: service layer enforces projectId scoping.
  const entities = hasKnowledgeDesktopApi()
    ? await knowledgeApi.searchEntities(opts)
    : knowledgeWebStore.searchEntities(opts);
  return { entities: entities.slice(0, 100) };
}

async function knowledgeGetEntity(input: Record<string, unknown>) {
  const id = input.entityId as string;
  const entity = hasKnowledgeDesktopApi()
    ? await knowledgeApi.getEntity(id)
    : knowledgeWebStore.getEntity(id);
  if (!entity) throw new ToolError("execution_failed", "entity not found");
  return {
    entity: {
      ...entity,
      description: capText(entity.description, 2000),
      provenanceSummary: `${entity.origin}/${entity.provenance}/${entity.status}`,
    },
  };
}

async function knowledgeGetRelationships(input: Record<string, unknown>, _ctx: ToolExecutionContext) {
  const id = input.entityId as string;
  const depth = Number(input.depth ?? 1);
  const limit = Math.min(Number(input.limit ?? 50), 500);
  if (depth === 1) {
    const opts: Record<string, unknown> = { limit };
    if (input.direction === "outgoing") opts.direction = "out";
    if (input.direction === "incoming") opts.direction = "in";
    if (typeof input.relationshipType === "string" && input.relationshipType) opts.type = input.relationshipType;
    const relationships = hasKnowledgeDesktopApi()
      ? await knowledgeApi.listRelationships(id, opts)
      : knowledgeWebStore.listRelationships(id, opts);
    return { relationships: relationships.slice(0, 500) };
  }
  // Depth 2-3 reuses the Phase 3 bounded traversal (no second implementation).
  // Note: traversal itself is unscoped (graph walk); project isolation is
  // enforced at the search/list layer that feeds entity ids to this tool.
  const t = hasKnowledgeDesktopApi()
    ? await knowledgeApi.traverse(id, { depth, limit })
    : knowledgeWebStore.traverse(id, { depth, limit });
  const rels = Array.isArray((t as { steps?: unknown[] }).steps)
    ? (t as { steps: unknown[] }).steps
    : [];
  return { relationships: rels.slice(0, 500) };
}

async function knowledgeGetEvidence(input: Record<string, unknown>) {
  const limit = Math.min(Number(input.limit ?? 50), 200);
  const store = hasKnowledgeDesktopApi() ? knowledgeApi : knowledgeWebStore;
  if (typeof input.relationshipId === "string" && input.relationshipId) {
    const evidence = await store.getEvidenceFor("relationship", input.relationshipId);
    return { evidence: evidence.slice(0, limit) };
  }
  if (typeof input.entityId === "string" && input.entityId) {
    const evidence = await store.getEvidenceFor("entity", input.entityId);
    return { evidence: evidence.slice(0, limit) };
  }
  throw new ToolError("invalid_input", "entityId or relationshipId");
}

/* ---------------- documents (local registry) ---------------- */

async function documentSearch(input: Record<string, unknown>, ctx: ToolExecutionContext) {
  const filters: DocumentSearchFilters = {};
  const projectId = pickProject(input, ctx);
  if (projectId) filters.projectId = projectId;
  if (typeof input.sourceType === "string" && input.sourceType) {
    filters.sourceType = input.sourceType as DocumentSearchFilters["sourceType"];
  }
  if (typeof input.author === "string" && input.author) filters.author = input.author.slice(0, 300);
  const hits = searchDocuments(
    (input.query as string).slice(0, 500), filters, Math.min(Number(input.limit ?? 20), 100)
  );
  return {
    hits: hits.map((h) => ({
      documentId: h.document.id,
      title: h.document.title.slice(0, 300),
      sourceType: h.document.sourceType,
      projectId: h.document.projectId,
      page: h.page,
      sectionId: h.sectionId,
      snippet: h.snippet.slice(0, 400),
      score: h.score,
    })),
  };
}

async function documentGet(input: Record<string, unknown>) {
  const doc = getDocument(input.documentId as string);
  if (!doc) throw new ToolError("execution_failed", "document not found");
  const chunks = getChunks(doc.id);
  return {
    document: {
      id: doc.id,
      title: doc.title.slice(0, 300),
      sourceType: doc.sourceType,
      mimeType: doc.mimeType,
      status: doc.status,
      extractionStatus: doc.extractionStatus,
      version: doc.version,
      projectId: doc.projectId,
      chunkCount: chunks.length,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
  };
}

async function documentInspect(input: Record<string, unknown>) {
  const found = inspectDocument(input.documentId as string);
  if (!found.document) throw new ToolError("execution_failed", "document not found");
  const maxBlocks = Math.min(Number(input.maxBlocks ?? 10), 50);
  const maxChunks = Math.min(Number(input.maxChunks ?? 5), 20);
  const blocks = (found.content?.blocks ?? []).slice(0, maxBlocks).map((b) => ({
    id: b.id, kind: b.kind, text: b.text.slice(0, 400), page: b.page, sectionId: b.sectionId,
  }));
  const chunks = (found.chunks ?? []).slice(0, maxChunks).map((c) => ({
    id: c.id, chunkIndex: c.chunkIndex, text: c.text.slice(0, 400),
    page: c.page, sectionId: c.sectionId, blockId: c.blockId,
  }));
  return {
    inspection: {
      documentId: found.document.id,
      title: found.document.title.slice(0, 300),
      version: found.document.version,
      sections: (found.content?.sections ?? []).slice(0, 50).map((s) => ({
        id: s.id, title: s.title.slice(0, 200), level: s.level, page: s.page,
      })),
      blocks,
      chunks,
      references: (found.content?.references ?? []).slice(0, 50).map((r) => ({
        id: r.id, text: r.text.slice(0, 400), doi: r.doi,
      })),
      sourceRef: {
        documentId: found.document.id,
        chunkId: chunks[0]?.id ?? `${found.document.id}:b0:0`,
        sourceType: found.document.sourceType,
        title: found.document.title.slice(0, 300),
      },
    },
  };
}

/* ---------------- connectors ---------------- */

async function connectorList() {
  if (hasConnectorDesktopApi()) {
    const remote = (await connectorApi.list()) as unknown[];
    return { connectors: remote.slice(0, 32) };
  }
  const defs = listConnectorDefinitions();
  const connectors = await Promise.all(defs.map(async (d) => ({
    ...d,
    sync: await connectorApi.syncStatus(d.id).catch(() => null),
  })));
  return { connectors };
}

async function connectorGet(input: Record<string, unknown>) {
  const connectorId = input.connectorId as string;
  const caps = await connectorApi.capabilities(connectorId);
  const sync = await connectorApi.syncStatus(connectorId).catch(() => null);
  return { connector: { connectorId, capabilities: caps, sync } };
}

async function connectorPreview(input: Record<string, unknown>) {
  const items = input.items as unknown[];
  const preview = await connectorApi.preview(
    items as Parameters<typeof connectorApi.preview>[0]
  );
  return { preview: (preview as unknown[]).slice(0, 200) };
}

async function connectorSearch(input: Record<string, unknown>) {
  // Allowlisted host only (api.crossref.org via the Phase 4 boundary).
  const items = await crossrefSearch(
    (input.query as string).slice(0, 300),
    undefined,
    { rows: Math.min(Number(input.rows ?? 5), 20) }
  );
  return {
    items: items.map((it) => ({
      connectorId: it.connectorId,
      externalId: it.externalId,
      title: it.title?.slice(0, 300),
      authors: it.authors.slice(0, 8),
      venue: it.venue?.slice(0, 300),
      publicationDate: it.publicationDate,
      externalUrl: it.externalUrl,
      identifiers: it.identifiers.slice(0, 8),
      retrievedAt: it.retrievedAt,
      sourceVersion: it.sourceVersion,
    })),
  };
}

async function connectorImport(input: Record<string, unknown>, ctx: ToolExecutionContext) {
  // Delegates to the Phase 4 engine (never duplicated). Policy enforces
  // USER_CONFIRMATION before this handler runs.
  const items = input.items as Parameters<typeof connectorApi.import>[0];
  const result = await connectorApi.import(items, {
    projectId: pickProject(input, ctx),
    dryRun: input.dryRun === true ? true : undefined,
  });
  return {
    result: {
      created: result.created.slice(0, 200),
      updated: result.updated.slice(0, 200),
      unchanged: result.unchanged.slice(0, 200),
      skipped: result.skipped.slice(0, 200),
      conflicts: result.conflicts.slice(0, 50),
      failed: result.failed.slice(0, 50),
      counts: {
        created: result.created.length,
        updated: result.updated.length,
        unchanged: result.unchanged.length,
        skipped: result.skipped.length,
        conflicts: result.conflicts.length,
        failed: result.failed.length,
      },
    },
  };
}

/* ---------------- project / export / utility ---------------- */

async function projectGet(input: Record<string, unknown>) {
  const project = await loadResearchProject(input.projectId as string);
  if (!project) throw new ToolError("execution_failed", "project not found");
  return {
    project: {
      id: project.id,
      title: String(project.title ?? "").slice(0, 300),
      targetVenue: String(project.targetVenue ?? "generic").slice(0, 64),
      updatedAt: project.updatedAt,
      paperCount: Array.isArray(project.papers) ? project.papers.length : 0,
      draftChars: typeof project.draftTex === "string" ? project.draftTex.length : 0,
      bibliographyChars: typeof project.bibliography === "string" ? project.bibliography.length : 0,
      knowledgeChars: typeof project.knowledge === "string" ? project.knowledge.length : 0,
    },
  };
}

async function exportCreate(input: Record<string, unknown>, ctx: ToolExecutionContext) {
  const projectId = pickProject(input, ctx);
  const maxEntities = Math.min(Number(input.maxEntities ?? 200), 500);
  const store = hasKnowledgeDesktopApi() ? knowledgeApi : knowledgeWebStore;
  let entities;
  if (Array.isArray(input.entityIds) && input.entityIds.length > 0) {
    const ids = (input.entityIds as string[]).slice(0, 200);
    const rows = await Promise.all(ids.map((id) => store.getEntity(id)));
    entities = rows.filter((e): e is NonNullable<typeof e> => Boolean(e));
  } else {
    entities = (await store.searchEntities({ projectId, limit: Math.min(maxEntities, 100) })).slice(0, maxEntities);
  }
  const relationships: unknown[] = [];
  const evidence: unknown[] = [];
  for (const e of entities.slice(0, maxEntities)) {
    const rels = await store.listRelationships(e.id, { limit: 20 });
    relationships.push(...rels.slice(0, 5));
    const ev = await store.getEvidenceFor("entity", e.id);
    evidence.push(...ev.slice(0, 5));
    if (relationships.length > 1000 || evidence.length > 1000) break;
  }
  const exported = exportKnowledge({
    entities: entities.slice(0, maxEntities),
    relationships: relationships.slice(0, 1000) as never,
    evidence: evidence.slice(0, 1000) as never,
  });
  const json = JSON.stringify(exported);
  if (json.length > 2 * 1024 * 1024) throw new ToolError("input_too_large", "export");
  return {
    export: {
      format: exported.format,
      exportedAt: exported.exportedAt,
      counts: {
        entities: exported.entities.length,
        relationships: exported.relationships.length,
        evidence: exported.evidence.length,
      },
      bytes: json.length,
      json: json.length > 500000 ? json.slice(0, 500000) : json,
      truncated: json.length > 500000,
    },
  };
}

async function utilityCalculate(input: Record<string, unknown>) {
  try {
    const result = evaluateCalculation(input.expression as string) as number;
    return { result };
  } catch {
    throw new ToolError("invalid_input", "expression");
  }
}

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  "knowledge.search": knowledgeSearch,
  "knowledge.get_entity": knowledgeGetEntity,
  "knowledge.get_relationships": knowledgeGetRelationships,
  "knowledge.get_evidence": knowledgeGetEvidence,
  "document.search": documentSearch,
  "document.get": documentGet,
  "document.inspect": documentInspect,
  "connector.list": connectorList,
  "connector.get": connectorGet,
  "connector.preview": connectorPreview,
  "connector.search": connectorSearch,
  "connector.import": connectorImport,
  "project.get": projectGet,
  "export.create": exportCreate,
  "utility.calculate": utilityCalculate,
};

export async function runToolHandler(
  toolId: string, input: Record<string, unknown>, ctx: ToolExecutionContext
): Promise<Record<string, unknown>> {
  const handler = TOOL_HANDLERS[toolId];
  if (!handler) throw new ToolError("unknown_tool", toolId);
  try {
    return await handler(input, ctx);
  } catch (err) {
    throw toToolError(err);
  }
}
