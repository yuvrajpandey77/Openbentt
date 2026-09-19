/**
 * Phase 4 — Shared connector core (single source of truth).
 * Plain JS so the renderer (via TS facades) and Electron (connectorStore.mjs)
 * share connector ids, capabilities, limits, normalization, identity, and
 * hashing with zero divergence. Mirrors the knowledgeCore.mjs precedent.
 *
 * Deterministic only. No network, no LLM, no secrets here.
 *
 * Phase 7 — Tier-1 enterprise connector ids are registered here alongside
 * the Phase 4 research connectors. Registration is metadata only: a
 * connector reports CONNECTED only after a real authenticated provider
 * request succeeds (see connectorAuthStore + provider clients).
 */

export const CONNECTOR_IDS = [
  "crossref",
  "zotero",
  "google-drive",
  "gmail",
  "google-calendar",
  "slack",
  "github",
  "notion",
];

/** Enterprise Tier-1 ids (OAuth-authenticated, READ_ONLY in Phase 7). */
export const ENTERPRISE_CONNECTOR_IDS = [
  "google-drive",
  "gmail",
  "google-calendar",
  "slack",
  "github",
  "notion",
];

/** Tier-2/3 ids are known but NOT registered: they stay PLANNED (deferred). */
export const DEFERRED_CONNECTOR_IDS = [
  "onedrive",
  "sharepoint",
  "dropbox",
  "linear",
  "jira",
  "confluence",
  "gitlab",
  "box",
  "discord",
  "msteams",
  "rest-generic",
  "webhook-generic",
];

export const CONNECTOR_META = {
  crossref: {
    id: "crossref",
    name: "Crossref",
    version: "1.0.0",
    sourceType: "crossref",
    authMode: "none",
    description: "Public Crossref metadata (no key required).",
  },
  zotero: {
    id: "zotero",
    name: "Zotero",
    version: "1.0.0",
    sourceType: "zotero",
    authMode: "api-key",
    description: "Zotero library items via existing Zotero integration.",
  },
  "google-drive": {
    id: "google-drive",
    name: "Google Drive",
    version: "1.0.0",
    sourceType: "google-drive",
    authMode: "oauth",
    description: "Google Drive files and folders via Drive API v3 (read-only).",
  },
  gmail: {
    id: "gmail",
    name: "Gmail",
    version: "1.0.0",
    sourceType: "gmail",
    authMode: "oauth",
    description: "Gmail threads and messages via Gmail API v1 (read-only).",
  },
  "google-calendar": {
    id: "google-calendar",
    name: "Google Calendar",
    version: "1.0.0",
    sourceType: "google-calendar",
    authMode: "oauth",
    description: "Calendars and events via Calendar API v3 (read-only).",
  },
  slack: {
    id: "slack",
    name: "Slack",
    version: "1.0.0",
    sourceType: "slack",
    authMode: "oauth",
    description: "Slack channels and messages via Web API (read-only).",
  },
  github: {
    id: "github",
    name: "GitHub",
    version: "1.0.0",
    sourceType: "github",
    authMode: "oauth",
    description: "GitHub repositories, issues, PRs, commits and files via REST API (read-only).",
  },
  notion: {
    id: "notion",
    name: "Notion",
    version: "1.0.0",
    sourceType: "notion",
    authMode: "oauth",
    description: "Notion pages, databases and blocks via API v1 (read-only).",
  },
};

export const CONNECTOR_CAPABILITIES = {
  crossref: ["SEARCH", "FETCH_ITEM", "METADATA", "AUTHORS", "IDENTIFIERS"],
  zotero: ["FETCH_COLLECTION", "FETCH_ITEM", "METADATA", "AUTHORS", "IDENTIFIERS", "IMPORT"],
  "google-drive": ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IMPORT", "SYNC"],
  gmail: ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IMPORT", "SYNC"],
  "google-calendar": ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IMPORT", "SYNC"],
  slack: ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IMPORT", "SYNC"],
  github: ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IDENTIFIERS", "IMPORT", "SYNC"],
  notion: ["DISCOVER", "SEARCH", "FETCH_ITEM", "METADATA", "IMPORT", "SYNC"],
};

export const KNOWN_CAPABILITIES = [
  "DISCOVER",
  "FETCH_ITEM",
  "FETCH_COLLECTION",
  "SEARCH",
  "IMPORT",
  "SYNC",
  "CITATIONS",
  "AUTHORS",
  "FULL_TEXT",
  "METADATA",
  "IDENTIFIERS",
];

export const CONNECTOR_LIMITS = {
  maxTitleChars: 1000,
  maxAbstractChars: 10000,
  maxAuthors: 64,
  maxAuthorChars: 300,
  maxTags: 64,
  maxTagChars: 64,
  maxCollections: 64,
  maxCollectionChars: 128,
  maxIdentifiers: 32,
  maxIdentifierValueChars: 500,
  maxReferences: 100,
  maxRelated: 100,
  maxRawMetadataChars: 20000,
  maxExternalUrlChars: 2000,
  maxItemsPerImport: 200,
  maxRelationshipsPerItem: 64,
  maxEvidencePerItem: 64,
  maxFetchTimeoutMs: 15000,
  maxResponseBytes: 2 * 1024 * 1024,
  maxRedirects: 3,
};

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
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 0x1f) || code === 0x7f) continue;
    out += str[i];
  }
  return out;
}

/** Bounded, deterministic string sanitizer for hostile provider text. */
export function sanitizeText(raw, maxChars) {
  const clean = stripControlChars(String(raw ?? ""))
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, maxChars);
}

export function normalizeDoi(raw) {
  let d = String(raw ?? "").trim().toLowerCase();
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");
  return d.replace(/[).;,]+$/, "");
}

export function isValidDoiFormat(doi) {
  return /^10\.\d{4,9}\/[^\s"<>]+$/i.test(String(doi ?? "").trim());
}

function isBlockedHost(host) {
  if (host === "localhost") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 0) return true;
  }
  if (
    host === "::1" || host === "[::1]" ||
    host.startsWith("fc") || host.startsWith("fd") ||
    host.startsWith("fe80") || host === "metadata.google.internal"
  ) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  return false;
}

/** SSRF-safe HTTPS-only URL validation (mirrors Phase 2 urlIngest policy). */
export function validateExternalUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("url-blocked");
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("url-blocked");
  }
  if (parsed.protocol !== "https:") throw new Error("url-blocked");
  if (parsed.username || parsed.password) throw new Error("url-blocked");
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if ((code >= 0 && code <= 0x1f) || code === 0x7f) throw new Error("url-blocked");
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || isBlockedHost(host)) throw new Error("url-blocked");
  return parsed.toString();
}

/** Stable, ID_RE-safe document id for connector evidence SourceRefs. */
export function connectorDocumentId(connectorId) {
  return `connector_${sanitizeText(connectorId, 32).replace(/[^a-zA-Z0-9_-]/g, "") || "unknown"}`;
}

/** Stable, ID_RE-safe chunk id for one external item (slash-free). */
export function connectorChunkId(connectorId, externalId) {
  const safe = sanitizeText(connectorId, 32).replace(/[^a-zA-Z0-9_-]/g, "") || "unknown";
  return `cc_${safe}_${fnv1aHex(`${connectorId}:${externalId}`)}`;
}

/**
 * Identity resolution priority: stable provider id → DOI → namespaced
 * external id → deterministic metadata fallback (caller supplies fallbackKey).
 * Returns null when confidence is insufficient (no usable key at all).
 */
export function resolveConnectorIdentity({ connectorId, externalId, doi, fallbackKey }) {
  const ext = sanitizeText(externalId, 256);
  if (!ext) return null;
  const normDoi = doi ? normalizeDoi(doi) : "";
  if (normDoi && isValidDoiFormat(normDoi)) {
    return { kind: "doi", namespace: "doi", value: normDoi };
  }
  if (connectorId === "zotero") {
    return { namespace: "zotero", value: ext.slice(0, 256), kind: "provider" };
  }
  if (connectorId === "crossref") {
    return { namespace: "crossref", value: ext.slice(0, 256), kind: "provider" };
  }
  const fb = sanitizeText(fallbackKey, 256);
  if (fb) return { namespace: String(connectorId).slice(0, 32), value: ext.slice(0, 256), kind: "provider" };
  return { namespace: String(connectorId).slice(0, 32), value: ext.slice(0, 256), kind: "provider" };
}

/** Deterministic stable stringify (sorted keys, bounded depth). */
export function stableStringify(value, depth = 0) {
  if (depth > 6) return '"…"';
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v, depth + 1)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k], depth + 1)}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

/** Deterministic hash of the normalized item (change detection). */
export function itemHashFor(normalized) {
  const slim = {
    connectorId: normalized.connectorId,
    externalId: normalized.externalId,
    itemType: normalized.itemType,
    title: normalized.title,
    authors: normalized.authors,
    organizations: normalized.organizations,
    venue: normalized.venue,
    publicationDate: normalized.publicationDate,
    abstract: normalized.abstract,
    identifiers: normalized.identifiers,
    tags: normalized.tags,
    collections: normalized.collections,
  };
  return fnv1aHex(stableStringify(slim));
}

/* ---------------- Phase 7 — connection state machine ---------------- */
/**
 * Connection lifecycle (metadata only — tokens live in the OS vault):
 * DISCONNECTED → CONNECTING → CONNECTED ⇄ SYNCING → SYNCED
 * Any state may move to AUTH_REQUIRED (expired/revoked) or ERROR.
 * DISCONNECTING is transient toward DISCONNECTED.
 */
export const CONNECTION_STATES = [
  "DISCONNECTED",
  "CONNECTING",
  "CONNECTED",
  "AUTH_REQUIRED",
  "SYNCING",
  "SYNCED",
  "ERROR",
  "DISCONNECTING",
];

const CONNECTION_TRANSITIONS = {
  DISCONNECTED: ["CONNECTING"],
  CONNECTING: ["CONNECTED", "AUTH_REQUIRED", "ERROR", "DISCONNECTED"],
  CONNECTED: ["SYNCING", "DISCONNECTING", "AUTH_REQUIRED", "ERROR"],
  AUTH_REQUIRED: ["CONNECTING", "DISCONNECTING", "DISCONNECTED"],
  SYNCING: ["SYNCED", "ERROR", "AUTH_REQUIRED", "CONNECTED"],
  SYNCED: ["SYNCING", "DISCONNECTING", "AUTH_REQUIRED", "ERROR"],
  ERROR: ["CONNECTING", "DISCONNECTING", "DISCONNECTED"],
  DISCONNECTING: ["DISCONNECTED", "ERROR"],
};

export function canTransitionConnection(from, to) {
  return (CONNECTION_TRANSITIONS[from] ?? []).includes(to);
}

export function transitionConnection(state, to, patch) {
  if (!canTransitionConnection(state.status, to)) {
    throw new Error(`Invalid connection transition ${state.status} -> ${to}`);
  }
  const now = new Date().toISOString();
  return {
    ...state,
    ...(patch ?? {}),
    status: to,
    updatedAt: now,
    lastError: to === "ERROR" ? (patch?.lastError ?? state.lastError ?? "unknown") : undefined,
  };
}

export function initialConnectionState(connectorId) {
  return {
    connectorId,
    status: "DISCONNECTED",
    accountLabel: undefined,
    scopes: [],
    connectedAt: undefined,
    lastSyncAt: undefined,
    updatedAt: new Date().toISOString(),
    lastError: undefined,
  };
}

/* ---------------- Phase 7 — unified sync stages ---------------- */
/** Observable stages of one connector sync run (maps onto the Phase 4 engine). */
export const SYNC_STAGES = [
  "DISCOVER",
  "FETCH",
  "NORMALIZE",
  "IDENTITY",
  "DEDUPLICATE",
  "IMPORT",
  "INDEX",
  "ONTOLOGY",
  "AUDIT",
];

export function isKnownSyncStage(stage) {
  return SYNC_STAGES.includes(stage);
}

/* ---------------- Phase 7 — unified external resource ---------------- */
/**
 * Normalized cross-provider resource. Provider-specific payload stays in
 * `providerMetadata` (bounded); everything the app reasons over is top-level.
 */
export function validateExternalResource(raw) {
  if (!raw || typeof raw !== "object") throw new Error("invalid-resource");
  const id = sanitizeText(raw.id, 256);
  const connectorId = sanitizeText(raw.connectorId, 64);
  const provider = sanitizeText(raw.provider, 64);
  const externalId = sanitizeText(raw.externalId, 256);
  const type = sanitizeText(raw.type, 64);
  const title = sanitizeText(raw.title ?? "", 1000);
  if (!id || !connectorId || !provider || !externalId || !type) {
    throw new Error("invalid-resource");
  }
  if (!CONNECTOR_IDS.includes(connectorId)) throw new Error("unknown-connector");
  let url;
  if (typeof raw.url === "string" && raw.url.trim()) {
    url = validateExternalUrl(raw.url.trim());
  }
  return {
    id,
    connectorId,
    provider,
    externalId,
    type,
    title,
    mimeType: raw.mimeType ? sanitizeText(raw.mimeType, 128) : undefined,
    url,
    parentId: raw.parentId ? sanitizeText(raw.parentId, 256) : undefined,
    owner: raw.owner ? sanitizeText(raw.owner, 256) : undefined,
    createdAt: raw.createdAt ? sanitizeText(raw.createdAt, 64) : undefined,
    updatedAt: raw.updatedAt ? sanitizeText(raw.updatedAt, 64) : undefined,
    snippet: raw.snippet ? sanitizeText(raw.snippet, 2000) : undefined,
    permissions: raw.permissions ? sanitizeText(JSON.stringify(raw.permissions).slice(0, 1000), 1000) : undefined,
    providerMetadata: raw.providerMetadata ?? {},
    provenance: {
      connectorId,
      externalId,
      url,
      retrievedAt: new Date().toISOString(),
      syncId: raw.provenance?.syncId ? sanitizeText(raw.provenance.syncId, 128) : undefined,
      resourceType: type,
    },
  };
}

export function externalResourceId(connectorId, externalId) {
  const safe = sanitizeText(connectorId, 32).replace(/[^a-zA-Z0-9_-]/g, "") || "unknown";
  return `xr_${safe}_${fnv1aHex(`${connectorId}:${externalId}`)}`;
}
