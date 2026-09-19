/**
 * Phase 3 — Shared knowledge core (single source of truth).
 * Plain JS so the renderer (via TS facades) and Electron (knowledgeStore.mjs)
 * share registries, limits, normalization, and identity with zero divergence.
 * Mirrors the corpusChunksCore.mjs / embedCore.mjs precedent.
 */

export const ENTITY_TYPE_IDS = [
  "person",
  "organization",
  "paper",
  "venue",
  "method",
  "dataset",
  "metric",
  "model",
  "technology",
  "concept",
  "location",
  "event",
  "product",
  /* Phase 8: enterprise entities (additive only; existing ids untouched). */
  "project",
  "task",
  "repository",
  "issue",
  "pull_request",
  "meeting",
  "message",
  "email",
  "document",
];

export const RELATIONSHIP_TYPE_IDS = [
  "AUTHORED_BY",
  "PUBLISHED_BY",
  "PUBLISHED_IN",
  "CITES",
  "REFERENCES",
  "USES_METHOD",
  "EVALUATED_ON",
  "REPORTS_METRIC",
  "PROPOSES",
  "EXTENDS",
  "REPRODUCES",
  "BUILT_WITH",
  "USES",
  "DEPENDS_ON",
  "DERIVED_FROM",
  "PART_OF",
  "LOCATED_IN",
  "RELATED_TO",
  /* Phase 8: enterprise relations (additive only). */
  "ASSIGNED_TO",
  "SENT_BY",
  "WORKS_ON",
  "IMPLEMENTS",
  "DISCUSSED_IN",
];

export const SYMMETRIC_RELATIONSHIP_IDS = ["RELATED_TO"];

export const KNOWLEDGE_LIMITS = {
  maxNameChars: 300,
  maxDescriptionChars: 2000,
  maxProperties: 32,
  maxPropertyKeyChars: 64,
  maxPropertyValueChars: 2000,
  maxAliases: 32,
  maxAliasChars: 300,
  maxIdentifiers: 32,
  maxIdentifierValueChars: 500,
  maxNamespaceChars: 32,
  maxTags: 32,
  maxTagChars: 64,
  maxQuoteChars: 600,
  maxTraversalDepth: 3,
  maxTraversalNodes: 500,
  maxPageSize: 100,
  maxEvidencePerSubject: 200,
};

export const ID_RE_SRC = "^[a-zA-Z0-9_:@.\\-]{1,128}$";
export const NAMESPACE_RE_SRC = "^[a-z][a-z0-9_]{0,31}$";

export function fnv1aHex(input) {
  let h = 0x811c9dc5;
  const s = String(input ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (`0000000${(h >>> 0).toString(16)}`).slice(-8);
}

export function stripControlChars(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if ((code >= 0 && code <= 0x1f) || code === 0x7f) continue;
    out += s[i];
  }
  return out;
}

export function normalizeName(raw) {
  return stripControlChars(String(raw ?? "").normalize("NFKC"))
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizePersonName(raw) {
  const base = normalizeName(raw).replace(/\s*\([^)]*\)\s*/g, " ").trim().replace(/\s+/g, " ");
  const comma = /^([^,]+),\s*(.+)$/.exec(base);
  if (comma) return `${comma[2]} ${comma[1]}`.trim().replace(/\s+/g, " ");
  return base;
}

export function splitAuthorNames(raw) {
  const clean = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const head = clean.split(/\bet\.?\s+al\.?/i)[0].trim();
  const andParts = head.split(/\s+and\s+|;/).map((s) => s.trim()).filter(Boolean);
  if (andParts.length > 1) {
    const out = [];
    for (const p of andParts) {
      const commaSplit = p.split(",").map((s) => s.trim()).filter(Boolean);
      if (commaSplit.length > 2) out.push(...commaSplit);
      else out.push(p);
    }
    return out.filter(Boolean);
  }
  const commas = head.split(",").map((s) => s.trim()).filter(Boolean);
  if (commas.length === 2) return [head];
  if (commas.length > 2) return commas;
  return [head];
}

export function normalizeDoi(raw) {
  let d = String(raw ?? "").trim().toLowerCase();
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");
  return d.replace(/[).;,]+$/, "");
}

export function entityIdFor(type, normalizedName) {
  return `ent_${type}_${fnv1aHex(`${type}:${normalizedName}`)}`;
}

export function paperIdForDoi(doi) {
  return `ent_paper_${fnv1aHex(`paper:doi:${normalizeDoi(doi)}`)}`;
}
