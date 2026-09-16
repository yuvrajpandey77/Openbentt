/**
 * Phase 4 — Connector type model (provider-neutral).
 * Additive only. No LLM, no network, no secrets in these types.
 */

export type ConnectorId = "crossref" | "zotero" | (string & {});

export type ConnectorCapability =
  | "DISCOVER"
  | "FETCH_ITEM"
  | "FETCH_COLLECTION"
  | "SEARCH"
  | "IMPORT"
  | "SYNC"
  | "CITATIONS"
  | "AUTHORS"
  | "FULL_TEXT"
  | "METADATA"
  | "IDENTIFIERS";

export type ConnectorAuthMode = "none" | "api-key" | "oauth" | "custom";

export interface ConnectorDefinition {
  id: string;
  name: string;
  version: string;
  sourceType: string;
  authMode: ConnectorAuthMode;
  description: string;
  capabilities: ConnectorCapability[];
  supportedEntityTypes: string[];
  supportedOperations: string[];
  rateLimitNote?: string;
}

export interface ExternalIdentifier {
  namespace: string;
  value: string;
}

export interface ExternalItemReference {
  id: string;
  title?: string;
}

/** Provider-neutral normalized external item. Bounded + sanitized. */
export interface ExternalItem {
  connectorId: string;
  externalId: string;
  externalUrl?: string;
  itemType: string;
  title?: string;
  authors: string[];
  organizations: string[];
  venue?: string;
  publicationDate?: string;
  abstract?: string;
  identifiers: ExternalIdentifier[];
  tags: string[];
  collections: string[];
  references: ExternalItemReference[];
  relatedItems: ExternalItemReference[];
  /** Bounded, sanitized provider metadata (never credentials/headers). */
  rawMetadata: Record<string, unknown>;
  retrievedAt: string;
  sourceVersion?: string;
}

export interface ImportOptions {
  projectId?: string;
  dryRun?: boolean;
  allowCreate?: boolean;
  allowUpdate?: boolean;
  preserveUserData?: boolean;
  createEvidence?: boolean;
  createRelationships?: boolean;
}

export type ImportItemStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "skipped"
  | "conflict"
  | "failed";

export interface ImportItemResult {
  connectorId: string;
  externalId: string;
  entityId?: string;
  status: ImportItemStatus;
  detail?: string;
}

export interface ImportConflict {
  connectorId: string;
  externalId: string;
  entityId: string;
  field: string;
  localValue?: string;
  externalValue?: string;
}

export interface ImportResult {
  created: string[];
  updated: string[];
  unchanged: string[];
  skipped: string[];
  conflicts: ImportConflict[];
  failed: { connectorId: string; externalId: string; error: string }[];
  items: ImportItemResult[];
}

export interface DryRunResult {
  wouldCreate: string[];
  wouldUpdate: string[];
  wouldSkip: string[];
  conflicts: ImportConflict[];
  validationErrors: { connectorId: string; externalId: string; error: string }[];
}

export type SyncStatus = "never_synced" | "syncing" | "synced" | "partial" | "failed";

export interface SyncState {
  connectorId: string;
  scope?: string;
  status: SyncStatus;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  cursor?: string;
  itemsSeen: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsFailed: number;
  lastError?: string;
  providerVersion?: string;
}

/** Connector provenance attached to a SourceRef (additive optional key). */
export interface ConnectorProvenance {
  connectorId: string;
  externalId: string;
  url?: string;
  retrievedAt: string;
  providerVersion?: string;
}
