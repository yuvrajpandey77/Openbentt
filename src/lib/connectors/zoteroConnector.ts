/**
 * Phase 4 — Zotero connector boundary (wraps the existing Zotero integration).
 * Capabilities: FETCH_COLLECTION, FETCH_ITEM, METADATA, AUTHORS, IDENTIFIERS, IMPORT.
 * Never downloads attachments automatically; never exposes credentials.
 * Zotero keys remain namespaced (`zotero:<key>`).
 */
import { normalizeZoteroItem } from "@/lib/connectors/connectorNormalize";
import type { RawZoteroItem } from "@/lib/connectors/connectorNormalize";
import { requireCapability } from "@/lib/connectors/connectorCapabilities";
import { ConnectorError, toConnectorError } from "@/lib/connectors/connectorErrors";
import { assertBoundedProviderJson, fetchConnectorJson } from "@/lib/connectors/connectorSecurity";
import type { ExternalItem } from "@/lib/connectors/connectorTypes";

export const ZOTERO_CONNECTOR_ID = "zotero";
const API_BASE = "https://api.zotero.org";

export interface ZoteroApiItem {
  key?: string;
  data?: {
    key?: string;
    itemType?: string;
    title?: string;
    creators?: { firstName?: string; lastName?: string; name?: string }[];
    date?: string;
    DOI?: string;
    url?: string;
    collections?: string[];
    tags?: { tag?: string }[];
    extra?: string;
    publisher?: string;
    publicationTitle?: string;
    abstractNote?: string;
  };
}

function creatorName(c: { firstName?: string; lastName?: string; name?: string }): string {
  if (c.name) return c.name;
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

function yearOf(date?: string): string | undefined {
  if (!date) return undefined;
  const m = /(\d{4})/.exec(date);
  return m ? m[1] : undefined;
}

/** Map one Zotero API item to raw input (no network, deterministic). */
export function zoteroApiItemToRaw(item: ZoteroApiItem, collectionNames?: Map<string, string>): RawZoteroItem {
  const d = item.data ?? {};
  const key = item.key ?? d.key ?? "";
  const collections = (d.collections ?? []).map((c) => collectionNames?.get(c) ?? c);
  return {
    key,
    title: d.title,
    creators: (d.creators ?? []).map(creatorName).filter(Boolean),
    year: yearOf(d.date),
    doi: d.DOI,
    url: d.url,
    collections,
    tags: (d.tags ?? []).map((t) => t.tag ?? "").filter(Boolean),
    publisher: d.publisher,
    journal: d.publicationTitle,
    abstract: d.abstractNote,
  };
}

/** Normalize an already-fetched Zotero API item (fixtures/offline path). */
export function zoteroNormalizeApiItem(item: ZoteroApiItem, collectionNames?: Map<string, string>, opts?: { retrievedAt?: string }): ExternalItem {
  requireCapability(ZOTERO_CONNECTOR_ID, "METADATA");
  return normalizeZoteroItem(zoteroApiItemToRaw(item, collectionNames), opts);
}

async function zoteroGet(
  path: string, apiKey: string, fetchImpl: typeof fetch, params?: Record<string, string>
): Promise<{ json: unknown; total: number | null }> {
  if (!apiKey) throw new ConnectorError("authentication_failed", "key");
  const qs = new URLSearchParams({ format: "json", limit: "100", ...(params ?? {}) }).toString();
  const { json } = await fetchConnectorJson(`${API_BASE}${path}?${qs}`, fetchImpl, {
    headers: { Accept: "application/json", "Zotero-API-Version": "3", "Zotero-API-Key": apiKey },
  });
  return { json, total: null };
}

/**
 * Fetch a user's library items (bounded pages; attachments represented as
 * metadata only — never downloaded). Credentials travel in headers only and
 * are never persisted into normalized items.
 */
export async function zoteroFetchLibrary(
  userId: string, apiKey: string, fetchImpl: typeof fetch = fetch,
  opts?: { maxItems?: number; collectionNames?: Map<string, string> }
): Promise<ExternalItem[]> {
  requireCapability(ZOTERO_CONNECTOR_ID, "FETCH_COLLECTION");
  if (!userId || !/^\d+$/.test(userId)) throw new ConnectorError("invalid_input", "userId");
  try {
    const maxItems = Math.min(Math.max(opts?.maxItems ?? 100, 1), 200);
    const out: ExternalItem[] = [];
    let start = 0;
    while (out.length < maxItems) {
      const { json } = await zoteroGet(`/users/${userId}/items`, apiKey, fetchImpl, {
        start: String(start),
        itemType: "-attachment,-note",
      });
      assertBoundedProviderJson(json);
      if (!Array.isArray(json) || json.length === 0) break;
      for (const raw of json) {
        try {
          out.push(zoteroNormalizeApiItem(raw as ZoteroApiItem, opts?.collectionNames));
        } catch {
          continue;
        }
        if (out.length >= maxItems) break;
      }
      if ((json as unknown[]).length < 100) break;
      start += 100;
    }
    return out;
  } catch (err) {
    throw toConnectorError(err);
  }
}

/** Fetch one item by key (bounded; metadata only). */
export async function zoteroFetchItem(
  userId: string, apiKey: string, itemKey: string, fetchImpl: typeof fetch = fetch
): Promise<ExternalItem> {
  requireCapability(ZOTERO_CONNECTOR_ID, "FETCH_ITEM");
  if (!userId || !/^\d+$/.test(userId)) throw new ConnectorError("invalid_input", "userId");
  if (!itemKey || !/^[A-Z0-9]{8}$/.test(itemKey)) throw new ConnectorError("invalid_input", "itemKey");
  try {
    const { json } = await zoteroGet(`/users/${userId}/items/${itemKey}`, apiKey, fetchImpl);
    assertBoundedProviderJson(json);
    return zoteroNormalizeApiItem(json as ZoteroApiItem);
  } catch (err) {
    throw toConnectorError(err);
  }
}
