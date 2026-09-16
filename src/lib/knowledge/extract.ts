/**
 * Phase 3 — Deterministic knowledge extraction (no LLM).
 * Sources, in origin-precedence order: user > zotero > crossref > filename >
 * inferred. Every produced entity/relationship ships with Evidence carrying a
 * Phase 2 SourceRef. Nothing is asserted without a source.
 */
import type { SourceRef } from "@/lib/documents/types";
import { normalizeDoi, normalizeName, splitAuthorNames } from "@/lib/knowledge/normalize";
import { entityIdFor, paperIdForDoi, personNameFor } from "@/lib/knowledge/identity";
import type {
  ConfidenceLevel, Evidence, KnowledgeEntity, KnowledgeOrigin, Relationship,
} from "@/lib/knowledge/types";

export interface ExtractedKnowledge {
  entities: KnowledgeEntity[];
  relationships: Relationship[];
  evidence: Evidence[];
}

const ts = (): string => new Date().toISOString();
let evCounter = 0;
const evId = (prefix: string): string => `${prefix}_ev_${Date.now().toString(36)}_${(evCounter++).toString(36)}`;

function dedupeEntities(list: KnowledgeEntity[]): KnowledgeEntity[] {
  const seen = new Map<string, KnowledgeEntity>();
  for (const e of list) {
    const prev = seen.get(e.id);
    if (!prev) { seen.set(e.id, e); continue; }
    // Merge aliases/identifiers/tags; keep the higher-precedence name.
    prev.aliases = [...new Set([...prev.aliases, ...e.aliases])].slice(0, 32);
    const ids = new Map(prev.externalIds.map((x) => [`${x.namespace}:${x.value}`, x]));
    for (const x of e.externalIds) ids.set(`${x.namespace}:${x.value}`, x);
    prev.externalIds = [...ids.values()].slice(0, 32);
    prev.tags = [...new Set([...prev.tags, ...e.tags])].slice(0, 32);
  }
  return [...seen.values()];
}

function entityBase(
  id: string, type: string, canonical: string, normalized: string,
  origin: KnowledgeOrigin, projectId?: string
): KnowledgeEntity {
  return {
    id, type, canonicalName: canonical, normalizedName: normalized,
    status: "active", properties: {}, aliases: [], externalIds: [], tags: [],
    origin, provenance: origin === "user" ? "user-authored" : origin === "import" ? "imported" : "automatic",
    projectId, createdAt: ts(), updatedAt: ts(),
  };
}

function relBase(
  id: string, type: Relationship["type"], subject: string, object: string,
  origin: KnowledgeOrigin, confidence: ConfidenceLevel, projectId?: string
): Relationship {
  return {
    id, type, subjectEntityId: subject, objectEntityId: object,
    properties: {}, status: "asserted", confidence, origin,
    provenance: origin === "user" ? "user-authored" : origin === "import" ? "imported" : "automatic",
    projectId, createdAt: ts(), updatedAt: ts(),
  };
}

function evidenceFor(
  subjectType: Evidence["subjectType"], subjectId: string, sourceRef: SourceRef,
  origin: KnowledgeOrigin, evidenceType: Evidence["evidenceType"],
  opts?: { quote?: string; confidence?: ConfidenceLevel; docVersion?: number; extractorVersion?: string }
): Evidence {
  return {
    id: evId(subjectType === "entity" ? "ent" : "rel"),
    subjectType, subjectId, sourceRef,
    quote: opts?.quote?.slice(0, 600),
    evidenceType, confidence: opts?.confidence ?? "medium", status: "current",
    evidenceDocVersion: opts?.docVersion, evidenceExtractorVersion: opts?.extractorVersion,
    origin, projectId: undefined, createdAt: ts(),
  };
}

export interface DocumentKnowledgeInput {
  documentId: string;
  versionId?: string;
  extractorVersion?: string;
  docVersion?: number;
  title?: string;
  authors?: string;
  year?: string;
  doi?: string;
  arxivId?: string;
  journal?: string;
  references?: { text: string; doi?: string; page?: number }[];
  page?: number;
  sectionId?: string;
  blockId?: string;
  chunkId?: string;
  sourceType?: SourceRef["sourceType"];
  sourceUri?: string;
  projectId?: string;
  origin?: KnowledgeOrigin;
}

/** Document metadata → Paper/Author/Venue entities + AUTHORED_BY/PUBLISHED_IN. */
export function extractFromDocument(input: DocumentKnowledgeInput): ExtractedKnowledge {
  const origin = input.origin ?? "document";
  const ref: SourceRef = {
    documentId: input.documentId,
    documentVersionId: input.versionId,
    page: input.page, section: input.sectionId, block: input.blockId, chunkId: input.chunkId ?? "",
    sourceType: input.sourceType ?? "unknown", sourceUri: input.sourceUri,
    title: input.title,
  };
  const entities: KnowledgeEntity[] = [];
  const relationships: Relationship[] = [];
  const evidence: Evidence[] = [];
  if (!input.title?.trim() && !input.doi) return { entities, relationships, evidence };

  const paperId = input.doi ? paperIdForDoi(input.doi) : entityIdFor("paper", normalizeName(input.title ?? input.documentId));
  const paper = entityBase(paperId, "paper", (input.title ?? "Untitled").slice(0, 300),
    input.doi ? `doi:${normalizeDoi(input.doi)}` : normalizeName(input.title ?? input.documentId),
    origin, input.projectId);
  if (input.doi) paper.externalIds.push({ namespace: "doi", value: normalizeDoi(input.doi) });
  if (input.arxivId) paper.externalIds.push({ namespace: "arxiv", value: input.arxivId });
  if (input.year) paper.properties["year"] = input.year.slice(0, 16);
  paper.properties["documentId"] = input.documentId;
  entities.push(paper);
  evidence.push(evidenceFor("entity", paperId, ref, origin, "metadata",
    { confidence: input.doi ? "high" : "medium", docVersion: input.docVersion, extractorVersion: input.extractorVersion }));

  for (const raw of splitAuthorNames(input.authors ?? "").slice(0, 32)) {
    const { canonical, normalized, id } = personNameFor("person", raw);
    if (!normalized) continue;
    const person = entityBase(id, "person", canonical, normalized, origin, input.projectId);
    if (canonical !== raw.trim()) person.aliases.push(raw.trim().slice(0, 300));
    entities.push(person);
    const rel = relBase(`rel_${paperId}_${id}_authored`.slice(0, 120), "AUTHORED_BY", id, paperId, origin, "medium", input.projectId);
    relationships.push(rel);
    evidence.push(evidenceFor("relationship", rel.id, ref, origin, "metadata",
      { docVersion: input.docVersion, extractorVersion: input.extractorVersion }));
  }

  if (input.journal?.trim()) {
    const name = input.journal.trim().slice(0, 300);
    const venue = entityBase(entityIdFor("venue", normalizeName(name)), "venue", name, normalizeName(name), origin, input.projectId);
    entities.push(venue);
    const rel = relBase(`rel_${paperId}_${venue.id}_in`.slice(0, 120), "PUBLISHED_IN", paperId, venue.id, origin, "medium", input.projectId);
    relationships.push(rel);
    evidence.push(evidenceFor("relationship", rel.id, ref, origin, "metadata",
      { docVersion: input.docVersion, extractorVersion: input.extractorVersion }));
  }

  // References with DOIs → CITES (only when the DOI is present in source data).
  for (const r of (input.references ?? []).slice(0, 300)) {
    if (!r.doi) continue;
    const citedId = paperIdForDoi(r.doi);
    const cited = entityBase(citedId, "paper", r.text.slice(0, 300) || r.doi, `doi:${normalizeDoi(r.doi)}`, origin, input.projectId);
    cited.externalIds.push({ namespace: "doi", value: normalizeDoi(r.doi) });
    cited.status = "unresolved";
    entities.push(cited);
    const rel = relBase(`rel_${paperId}_${citedId}_cites`.slice(0, 120), "CITES", paperId, citedId, origin, "medium", input.projectId);
    relationships.push(rel);
    const cref: SourceRef = { ...ref, page: r.page ?? ref.page };
    evidence.push(evidenceFor("relationship", rel.id, cref, origin, "citation",
      { quote: r.text.slice(0, 600), docVersion: input.docVersion, extractorVersion: input.extractorVersion }));
  }

  return { entities: dedupeEntities(entities), relationships, evidence };
}

export interface ZoteroKnowledgeInput {
  key: string;
  title?: string;
  creators?: string[];
  year?: string;
  doi?: string;
  url?: string;
  collections?: string[];
  tags?: string[];
  citekey?: string;
  projectId?: string;
}

/** Zotero item → Paper + Person entities (stable zotero:key identity). */
export function extractFromZotero(item: ZoteroKnowledgeInput, sourceRef: SourceRef): ExtractedKnowledge {
  const entities: KnowledgeEntity[] = [];
  const relationships: Relationship[] = [];
  const evidence: Evidence[] = [];
  const paperId = item.doi ? paperIdForDoi(item.doi) : entityIdFor("paper", normalizeName(item.title ?? item.key));
  const paper = entityBase(paperId, "paper", (item.title ?? item.key).slice(0, 300),
    item.doi ? `doi:${normalizeDoi(item.doi)}` : normalizeName(item.title ?? item.key), "zotero", item.projectId);
  paper.externalIds.push({ namespace: "zotero", value: item.key });
  if (item.doi) paper.externalIds.push({ namespace: "doi", value: normalizeDoi(item.doi) });
  if (item.citekey) paper.externalIds.push({ namespace: "citekey", value: item.citekey });
  if (item.year) paper.properties["year"] = item.year.slice(0, 16);
  if (item.url) paper.properties["url"] = item.url.slice(0, 500);
  paper.tags = [...(item.collections ?? []), ...(item.tags ?? [])].map((t) => t.slice(0, 64)).slice(0, 32);
  entities.push(paper);
  evidence.push(evidenceFor("entity", paperId, sourceRef, "zotero", "metadata", { confidence: "high" }));
  for (const raw of (item.creators ?? []).slice(0, 32)) {
    const { canonical, normalized, id } = personNameFor("person", raw);
    if (!normalized) continue;
    entities.push(entityBase(id, "person", canonical, normalized, "zotero", item.projectId));
    const rel = relBase(`rel_${id}_${paperId}_authored`.slice(0, 120), "AUTHORED_BY", id, paperId, "zotero", "high", item.projectId);
    relationships.push(rel);
    evidence.push(evidenceFor("relationship", rel.id, sourceRef, "zotero", "metadata", { confidence: "high" }));
  }
  return { entities: dedupeEntities(entities), relationships, evidence };
}

export interface CrossrefKnowledgeInput {
  doi: string;
  title?: string;
  authors?: string[];
  year?: string;
  journal?: string;
  publisher?: string;
  projectId?: string;
}

/** Crossref work → fill/confirm Paper entity (never overwrites user data at store level). */
export function extractFromCrossref(work: CrossrefKnowledgeInput, sourceRef: SourceRef): ExtractedKnowledge {
  const entities: KnowledgeEntity[] = [];
  const relationships: Relationship[] = [];
  const evidence: Evidence[] = [];
  const paperId = paperIdForDoi(work.doi);
  const paper = entityBase(paperId, "paper", (work.title ?? work.doi).slice(0, 300),
    `doi:${normalizeDoi(work.doi)}`, "crossref", work.projectId);
  paper.externalIds.push({ namespace: "doi", value: normalizeDoi(work.doi) });
  paper.externalIds.push({ namespace: "crossref", value: normalizeDoi(work.doi) });
  if (work.year) paper.properties["year"] = work.year.slice(0, 16);
  if (work.journal) paper.properties["journal"] = work.journal.slice(0, 300);
  if (work.publisher) paper.properties["publisher"] = work.publisher.slice(0, 300);
  entities.push(paper);
  evidence.push(evidenceFor("entity", paperId, sourceRef, "crossref", "metadata", { confidence: "high" }));
  for (const raw of (work.authors ?? []).slice(0, 32)) {
    const { canonical, normalized, id } = personNameFor("person", raw);
    if (!normalized) continue;
    entities.push(entityBase(id, "person", canonical, normalized, "crossref", work.projectId));
    const rel = relBase(`rel_${id}_${paperId}_authored`.slice(0, 120), "AUTHORED_BY", id, paperId, "crossref", "medium", work.projectId);
    relationships.push(rel);
    evidence.push(evidenceFor("relationship", rel.id, sourceRef, "crossref", "metadata"));
  }
  if (work.publisher?.trim()) {
    const name = work.publisher.trim().slice(0, 300);
    const org = entityBase(entityIdFor("organization", normalizeName(name)), "organization", name, normalizeName(name), "crossref", work.projectId);
    entities.push(org);
    const rel = relBase(`rel_${paperId}_${org.id}_pub`.slice(0, 120), "PUBLISHED_BY", paperId, org.id, "crossref", "medium", work.projectId);
    relationships.push(rel);
    evidence.push(evidenceFor("relationship", rel.id, sourceRef, "crossref", "metadata"));
  }
  return { entities: dedupeEntities(entities), relationships, evidence };
}
