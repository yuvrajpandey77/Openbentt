/**
 * Phase 4 — Provider-neutral normalization (deterministic, bounded).
 * Converts raw Crossref/Zotero payloads into ExternalItem. Hostile input:
 * everything is sanitized, capped, and validated; credentials/headers are
 * never copied into rawMetadata.
 */
import {
  CONNECTOR_LIMITS,
  isValidDoiFormat,
  normalizeDoi,
} from "@/lib/connectors/connectorCore.mjs";
import { ConnectorError } from "@/lib/connectors/connectorErrors";
import { assertBoundedProviderJson, tryValidateConnectorUrl } from "@/lib/connectors/connectorSecurity";
import { sanitizeConnectorText } from "@/lib/connectors/connectorSecurity";
import type { ExternalIdentifier, ExternalItem } from "@/lib/connectors/connectorTypes";

const L = CONNECTOR_LIMITS as Record<string, number>;

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function strArray(v: unknown, max: number, maxChars: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const e of v) {
    if (typeof e !== "string") continue;
    const s = sanitizeConnectorText(e, maxChars);
    if (s) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function dedupeKeepOrder(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of list) {
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function capRawMetadata(raw: unknown): Record<string, unknown> {
  let json = "{}";
  try {
    json = JSON.stringify(raw ?? {});
  } catch {
    json = "{}";
  }
  if (json.length > L.maxRawMetadataChars) {
    return { truncated: true, preview: json.slice(0, L.maxRawMetadataChars) };
  }
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    // Strip anything credential-shaped before persisting.
    for (const k of Object.keys(parsed)) {
      if (/api[_-]?key|token|secret|password|authorization|cookie|header/i.test(k)) {
        delete parsed[k];
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

function identifiersFrom(list: { namespace: string; value: string }[]): ExternalIdentifier[] {
  const out: ExternalIdentifier[] = [];
  const seen = new Set<string>();
  for (const e of list.slice(0, L.maxIdentifiers)) {
    if (!e || typeof e.namespace !== "string" || typeof e.value !== "string") continue;
    const ns = e.namespace.trim().toLowerCase().slice(0, 32);
    const val = sanitizeConnectorText(e.value, L.maxIdentifierValueChars);
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(ns) || !val) continue;
    const k = `${ns}:${val.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ namespace: ns, value: val });
  }
  return out;
}

export interface RawCrossrefWork {
  doi?: unknown;
  title?: unknown;
  authors?: unknown;
  journal?: unknown;
  publisher?: unknown;
  year?: unknown;
  url?: unknown;
  abstract?: unknown;
  issn?: unknown;
  type?: unknown;
}

export interface RawZoteroItem {
  key?: unknown;
  title?: unknown;
  creators?: unknown;
  year?: unknown;
  doi?: unknown;
  url?: unknown;
  collections?: unknown;
  tags?: unknown;
  citekey?: unknown;
  publisher?: unknown;
  journal?: unknown;
  abstract?: unknown;
}

/** Normalize a Crossref work record into an ExternalItem. */
export function normalizeCrossrefWork(raw: RawCrossrefWork, opts?: { retrievedAt?: string }): ExternalItem {
  if (!raw || typeof raw !== "object") throw new ConnectorError("normalization_failed", "crossref");
  assertBoundedProviderJson(raw);
  const doiRaw = str(raw.doi);
  const doi = doiRaw ? (normalizeDoi(doiRaw) as string) : "";
  const title = sanitizeConnectorText(str(raw.title) ?? "", L.maxTitleChars) || undefined;
  if (!doi && !title) throw new ConnectorError("normalization_failed", "doi+title");
  const externalId = doi && (isValidDoiFormat(doi) as boolean) ? doi : `title:${(title ?? "untitled").slice(0, 128)}`;
  const identifiers: ExternalIdentifier[] = [];
  if (doi && (isValidDoiFormat(doi) as boolean)) {
    identifiers.push({ namespace: "doi", value: doi });
    identifiers.push({ namespace: "crossref", value: doi });
  }
  const issn = str(raw.issn);
  if (issn) identifiers.push({ namespace: "issn", value: sanitizeConnectorText(issn, 64) });
  const authors = Array.isArray(raw.authors)
    ? strArray(raw.authors, L.maxAuthors, L.maxAuthorChars)
    : raw.authors !== undefined && typeof raw.authors === "string"
      ? strArray((raw.authors as string).split(/\s+and\s+|;/), L.maxAuthors, L.maxAuthorChars)
      : [];
  return {
    connectorId: "crossref",
    externalId,
    externalUrl: tryValidateConnectorUrl(raw.url),
    itemType: sanitizeConnectorText(str(raw.type) ?? "paper", 64) || "paper",
    title,
    authors: dedupeKeepOrder(authors),
    organizations: [],
    venue: sanitizeConnectorText(str(raw.journal) ?? "", 300) || undefined,
    publicationDate: sanitizeConnectorText(str(raw.year) ?? "", 16) || undefined,
    abstract: sanitizeConnectorText(str(raw.abstract) ?? "", L.maxAbstractChars) || undefined,
    identifiers: identifiersFrom(identifiers),
    tags: [],
    collections: [],
    references: [],
    relatedItems: [],
    rawMetadata: capRawMetadata({
      publisher: str(raw.publisher)?.slice(0, 300),
      journal: str(raw.journal)?.slice(0, 300),
      year: str(raw.year)?.slice(0, 16),
      type: str(raw.type)?.slice(0, 64),
    }),
    retrievedAt: opts?.retrievedAt ?? new Date().toISOString(),
    sourceVersion: "crossref-v1",
  };
}

/** Normalize a Zotero library item into an ExternalItem. */
export function normalizeZoteroItem(raw: RawZoteroItem, opts?: { retrievedAt?: string }): ExternalItem {
  if (!raw || typeof raw !== "object") throw new ConnectorError("normalization_failed", "zotero");
  assertBoundedProviderJson(raw);
  const key = sanitizeConnectorText(str(raw.key) ?? "", 128);
  if (!key) throw new ConnectorError("normalization_failed", "key");
  const doiRaw = str(raw.doi);
  const doi = doiRaw ? (normalizeDoi(doiRaw) as string) : "";
  const validDoi = doi && (isValidDoiFormat(doi) as boolean) ? doi : undefined;
  const title = sanitizeConnectorText(str(raw.title) ?? "", L.maxTitleChars) || undefined;
  const identifiers: ExternalIdentifier[] = [{ namespace: "zotero", value: key }];
  if (validDoi) identifiers.push({ namespace: "doi", value: validDoi });
  const citekey = str(raw.citekey);
  if (citekey) identifiers.push({ namespace: "citekey", value: sanitizeConnectorText(citekey, 128) });
  const creators = Array.isArray(raw.creators)
    ? strArray(raw.creators, L.maxAuthors, L.maxAuthorChars)
    : [];
  return {
    connectorId: "zotero",
    externalId: key,
    externalUrl: tryValidateConnectorUrl(raw.url),
    itemType: "paper",
    title,
    authors: dedupeKeepOrder(creators),
    organizations: [],
    venue: sanitizeConnectorText(str(raw.journal) ?? "", 300) || undefined,
    publicationDate: sanitizeConnectorText(str(raw.year) ?? "", 16) || undefined,
    abstract: sanitizeConnectorText(str(raw.abstract) ?? "", L.maxAbstractChars) || undefined,
    identifiers: identifiersFrom(identifiers),
    tags: dedupeKeepOrder(strArray(raw.tags, L.maxTags, L.maxTagChars)),
    collections: dedupeKeepOrder(strArray(raw.collections, L.maxCollections, L.maxCollectionChars)),
    references: [],
    relatedItems: [],
    rawMetadata: capRawMetadata({
      publisher: str(raw.publisher)?.slice(0, 300),
      year: str(raw.year)?.slice(0, 16),
      citekey: citekey?.slice(0, 128),
    }),
    retrievedAt: opts?.retrievedAt ?? new Date().toISOString(),
    sourceVersion: "zotero-v1",
  };
}

/** Validate a normalized item (used by dry-run + import paths). */
export function validateExternalItem(item: ExternalItem): void {
  if (!item || typeof item !== "object") throw new ConnectorError("invalid_input", "item");
  if (typeof item.connectorId !== "string" || !item.connectorId.trim()) {
    throw new ConnectorError("invalid_connector", "missing");
  }
  if (typeof item.externalId !== "string" || !item.externalId.trim() || item.externalId.length > 512) {
    throw new ConnectorError("invalid_input", "externalId");
  }
  if (item.title !== undefined && (typeof item.title !== "string" || item.title.length > L.maxTitleChars)) {
    throw new ConnectorError("invalid_input", "title");
  }
  if (!Array.isArray(item.authors) || item.authors.length > L.maxAuthors) {
    throw new ConnectorError("invalid_input", "authors");
  }
  if (!Array.isArray(item.identifiers) || item.identifiers.length > L.maxIdentifiers) {
    throw new ConnectorError("invalid_input", "identifiers");
  }
  if (item.externalUrl !== undefined && tryValidateConnectorUrl(item.externalUrl) === undefined) {
    throw new ConnectorError("ssrf_blocked", "externalUrl");
  }
}
