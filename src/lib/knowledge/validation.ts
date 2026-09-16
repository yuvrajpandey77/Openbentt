/**
 * Phase 3 — Knowledge input validation (untrusted input boundary).
 * Parameterized SQL lives in the stores; this layer rejects malformed,
 * oversized, or unbounded requests with AppError-coded failures. Never leaks
 * SQL or filesystem paths.
 */
import { AppError } from "@/lib/appError";
import { KNOWLEDGE_LIMITS as L } from "@/lib/knowledge/limits";
import { isKnownEntityType } from "@/lib/knowledge/entityTypes";
import { isKnownRelationshipType } from "@/lib/knowledge/relationshipTypes";
import type { Evidence, KnowledgeEntity, Relationship, SourceRefInput } from "@/lib/knowledge/validationTypes";

export const ID_RE = /^[a-zA-Z0-9_:@.-]{1,128}$/;
export const NAMESPACE_RE = /^[a-z][a-z0-9_]{0,31}$/;

function fail(message: string): never {
  throw new AppError("validation", message, { retryable: false });
}

export function assertValidId(id: unknown, label = "id"): string {
  if (typeof id !== "string" || !ID_RE.test(id)) fail(`Invalid ${label}`);
  return id as string;
}

function assertBoundedText(
  value: unknown, max: number, label: string, opts?: { required?: boolean }
): string | undefined {
  if (value === undefined || value === null) {
    if (opts?.required) fail(`${label} is required`);
    return undefined;
  }
  if (typeof value !== "string") fail(`Invalid ${label}`);
  const s = value as string;
  if (opts?.required && !s.trim()) fail(`${label} is required`);
  if (s.length > max) fail(`${label} exceeds ${max} characters`);
  return s;
}

function assertStringMap(
  value: unknown, label: string, maxEntries: number, maxKey: number, maxVal: number
): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) fail(`Invalid ${label}`);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > maxEntries) fail(`${label} exceeds ${maxEntries} entries`);
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (typeof k !== "string" || !k.trim() || k.length > maxKey) fail(`Invalid ${label} key`);
    if (typeof v !== "string" || v.length > maxVal) fail(`Invalid ${label} value`);
    out[k] = v;
  }
  return out;
}

const ENTITY_STATUSES = new Set(["active", "unresolved", "deprecated", "merged"]);
const REL_STATUSES = new Set(["asserted", "uncertain", "deprecated", "retracted"]);
const EV_STATUSES = new Set(["current", "stale", "retracted"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);
const ORIGINS = new Set(["user", "document", "zotero", "crossref", "import", "system", "future-llm"]);
const PROVENANCES = new Set(["automatic", "user-authored", "imported"]);

export function validateEntity(input: Partial<KnowledgeEntity>): KnowledgeEntity {
  const id = assertValidId(input.id, "entity id");
  const type = assertBoundedText(input.type, 64, "entity type", { required: true })!;
  if (!isKnownEntityType(type)) fail(`Unknown entity type: ${type}`);
  const canonicalName = assertBoundedText(input.canonicalName, L.maxNameChars, "entity name", { required: true })!;
  const normalizedName = assertBoundedText(input.normalizedName, L.maxNameChars, "normalized name", { required: true })!;
  const status = input.status ?? "active";
  if (!ENTITY_STATUSES.has(status)) fail(`Invalid entity status`);
  if (input.origin !== undefined && !ORIGINS.has(input.origin)) fail("Invalid origin");
  if (input.provenance !== undefined && !PROVENANCES.has(input.provenance)) fail("Invalid provenance");
  const aliases = input.aliases ?? [];
  if (!Array.isArray(aliases) || aliases.length > L.maxAliases) fail("Invalid aliases");
  for (const a of aliases) assertBoundedText(a, L.maxAliasChars, "alias", { required: true });
  const externalIds = input.externalIds ?? [];
  if (!Array.isArray(externalIds) || externalIds.length > L.maxIdentifiers) fail("Invalid external ids");
  for (const e of externalIds) {
    if (!e || typeof e !== "object") fail("Invalid external id");
    if (!NAMESPACE_RE.test(e.namespace)) fail("Invalid identifier namespace");
    assertBoundedText(e.value, L.maxIdentifierValueChars, "identifier value", { required: true });
  }
  const tags = input.tags ?? [];
  if (!Array.isArray(tags) || tags.length > L.maxTags) fail("Invalid tags");
  for (const t of tags) assertBoundedText(t, L.maxTagChars, "tag", { required: true });
  return {
    id, type, canonicalName, normalizedName,
    description: assertBoundedText(input.description, L.maxDescriptionChars, "description"),
    status, mergedInto: input.mergedInto ? assertValidId(input.mergedInto, "mergedInto") : undefined,
    properties: assertStringMap(input.properties, "properties", L.maxProperties, L.maxPropertyKeyChars, L.maxPropertyValueChars),
    aliases: [...aliases] as string[], externalIds: externalIds.map((e) => ({ namespace: e.namespace, value: e.value })),
    tags: [...tags] as string[],
    origin: (input.origin ?? "system") as KnowledgeEntity["origin"],
    provenance: (input.provenance ?? "automatic") as KnowledgeEntity["provenance"],
    projectId: input.projectId ? assertValidId(input.projectId, "project id") : undefined,
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function validateRelationship(input: Partial<Relationship>): Relationship {
  const id = assertValidId(input.id, "relationship id");
  const type = assertBoundedText(input.type, 64, "relationship type", { required: true })!;
  if (!isKnownRelationshipType(type)) fail(`Unknown relationship type: ${type}`);
  const subjectEntityId = assertValidId(input.subjectEntityId, "subject entity id");
  const objectEntityId = assertValidId(input.objectEntityId, "object entity id");
  if (subjectEntityId === objectEntityId) fail("Relationship subject and object must differ");
  const status = input.status ?? "asserted";
  if (!REL_STATUSES.has(status)) fail("Invalid relationship status");
  const confidence = input.confidence ?? "medium";
  if (!CONFIDENCES.has(confidence)) fail("Invalid confidence");
  if (input.origin !== undefined && !ORIGINS.has(input.origin)) fail("Invalid origin");
  if (input.provenance !== undefined && !PROVENANCES.has(input.provenance)) fail("Invalid provenance");
  return {
    id, type, subjectEntityId, objectEntityId,
    properties: assertStringMap(input.properties, "properties", L.maxProperties, L.maxPropertyKeyChars, L.maxPropertyValueChars),
    status, confidence,
    origin: (input.origin ?? "system") as Relationship["origin"],
    provenance: (input.provenance ?? "automatic") as Relationship["provenance"],
    projectId: input.projectId ? assertValidId(input.projectId, "project id") : undefined,
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function validateSourceRefInput(ref: SourceRefInput): void {
  if (!ref || typeof ref !== "object") fail("Evidence source is required");
  assertValidId(ref.documentId, "document id");
  if (ref.documentVersionId !== undefined) assertValidId(ref.documentVersionId, "document version id");
  if (ref.chunkId !== undefined) assertValidId(ref.chunkId, "chunk id");
  if (ref.page !== undefined && (!Number.isInteger(ref.page) || ref.page < 0 || ref.page > 100000)) {
    fail("Invalid evidence page");
  }
  for (const k of ["section", "block", "sourceType", "sourceUri", "title"] as const) {
    const v = ref[k];
    if (v !== undefined && (typeof v !== "string" || v.length > 500)) fail(`Invalid evidence ${k}`);
  }
}

export function validateEvidence(input: Partial<Evidence>): Evidence {
  const id = assertValidId(input.id, "evidence id");
  if (input.subjectType !== "entity" && input.subjectType !== "relationship") fail("Invalid evidence subject");
  const subjectId = assertValidId(input.subjectId, "evidence subject id");
  validateSourceRefInput(input.sourceRef as SourceRefInput);
  const quote = assertBoundedText(input.quote, L.maxQuoteChars, "evidence quote");
  const status = input.status ?? "current";
  if (!EV_STATUSES.has(status)) fail("Invalid evidence status");
  const confidence = input.confidence ?? "medium";
  if (!CONFIDENCES.has(confidence)) fail("Invalid confidence");
  if (input.origin !== undefined && !ORIGINS.has(input.origin)) fail("Invalid origin");
  const evidenceType = input.evidenceType ?? "document";
  if (!new Set(["document", "metadata", "citation", "user", "import"]).has(evidenceType)) fail("Invalid evidence type");
  return {
    id, subjectType: input.subjectType, subjectId,
    predicate: assertBoundedText(input.predicate, 64, "predicate"),
    quote,
    evidenceType: evidenceType as Evidence["evidenceType"],
    sourceRef: input.sourceRef!,
    evidenceDocVersion: input.evidenceDocVersion,
    evidenceExtractorVersion: input.evidenceExtractorVersion
      ? assertBoundedText(input.evidenceExtractorVersion, 64, "extractor version")
      : undefined,
    confidence, status,
    origin: (input.origin ?? "system") as Evidence["origin"],
    projectId: input.projectId ? assertValidId(input.projectId, "project id") : undefined,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/** Traversal guard: bounded depth, bounded nodes, validated id. */
export function validateTraversal(entityId: unknown, depth: unknown, limit: unknown): { id: string; depth: number; limit: number } {
  const id = assertValidId(entityId, "entity id");
  const d = depth === undefined ? 1 : Number(depth);
  if (!Number.isInteger(d) || d < 1 || d > L.maxTraversalDepth) fail(`Traversal depth must be 1–${L.maxTraversalDepth}`);
  const lim = limit === undefined ? 50 : Number(limit);
  if (!Number.isInteger(lim) || lim < 1 || lim > L.maxTraversalNodes) fail(`Traversal limit must be 1–${L.maxTraversalNodes}`);
  return { id, depth: d, limit: lim };
}
