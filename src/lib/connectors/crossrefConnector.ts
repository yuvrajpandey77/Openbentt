/**
 * Phase 4 — Crossref connector boundary (wraps existing crossrefClient behavior).
 * Capabilities: SEARCH, FETCH_ITEM, METADATA, AUTHORS, IDENTIFIERS.
 * CITATIONS is NOT claimed (existing provider returns no references).
 * Deterministic normalization; all failures become typed ConnectorErrors.
 */
import { normalizeCrossrefWork } from "@/lib/connectors/connectorNormalize";
import { requireCapability } from "@/lib/connectors/connectorCapabilities";
import { ConnectorError, toConnectorError } from "@/lib/connectors/connectorErrors";
import { assertBoundedProviderJson, fetchConnectorJson } from "@/lib/connectors/connectorSecurity";
import type { ExternalItem } from "@/lib/connectors/connectorTypes";

export const CROSSREF_CONNECTOR_ID = "crossref";
const API_BASE = "https://api.crossref.org/works/";
const UA = "OpenBenTT/2.0 (mailto:openbentt-contributors@users.noreply.github.com)";

interface CrossrefAuthor { given?: string; family?: string; name?: string }

function formatAuthor(a: CrossrefAuthor): string {
  if (a.name) return a.name;
  return [a.given, a.family].filter(Boolean).join(" ");
}

function toRaw(message: Record<string, unknown>): Record<string, unknown> {
  const titleArr = message["title"] as string[] | undefined;
  const author = message["author"] as CrossrefAuthor[] | undefined;
  const issued = message["issued"] as { "date-parts"?: number[][] } | undefined;
  const container = message["container-title"] as string[] | undefined;
  return {
    doi: message["DOI"],
    title: titleArr?.[0],
    authors: Array.isArray(author) ? author.map(formatAuthor).filter(Boolean) : [],
    journal: container?.[0],
    publisher: message["publisher"],
    year: issued?.["date-parts"]?.[0]?.[0]?.toString(),
    url: message["URL"],
    abstract: message["abstract"],
    issn: Array.isArray(message["ISSN"]) ? (message["ISSN"] as string[])[0] : message["ISSN"],
    type: message["type"],
  };
}

/** Fetch one work by DOI (bounded, SSRF-safe, typed errors). */
export async function crossrefFetchItem(
  doi: string, fetchImpl: typeof fetch = fetch, opts?: { signal?: AbortSignal }
): Promise<ExternalItem> {
  requireCapability(CROSSREF_CONNECTOR_ID, "FETCH_ITEM");
  if (!doi || typeof doi !== "string") throw new ConnectorError("invalid_input", "doi");
  const encoded = encodeURIComponent(doi.trim());
  try {
    const { json } = await fetchConnectorJson(`${API_BASE}${encoded}`, fetchImpl, {
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    assertBoundedProviderJson(json);
    const msg = (json as { message?: Record<string, unknown> })?.message;
    if (!msg || typeof msg !== "object") throw new ConnectorError("invalid_response", "message");
    void opts;
    return normalizeCrossrefWork(toRaw(msg));
  } catch (err) {
    throw toConnectorError(err);
  }
}

/** Search works by query (bounded rows; deterministic normalization). */
export async function crossrefSearch(
  query: string, fetchImpl: typeof fetch = fetch, opts?: { rows?: number }
): Promise<ExternalItem[]> {
  requireCapability(CROSSREF_CONNECTOR_ID, "SEARCH");
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new ConnectorError("invalid_input", "query");
  }
  const rows = Math.min(Math.max(opts?.rows ?? 5, 1), 20);
  try {
    const { json } = await fetchConnectorJson(
      `https://api.crossref.org/works?query=${encodeURIComponent(query.trim().slice(0, 300))}&rows=${rows}&select=DOI,title,author,issued,container-title,publisher,URL,type`,
      fetchImpl,
      { headers: { Accept: "application/json", "User-Agent": UA } }
    );
    assertBoundedProviderJson(json);
    const items = (json as { message?: { items?: Record<string, unknown>[] } })?.message?.items;
    if (!Array.isArray(items)) throw new ConnectorError("invalid_response", "items");
    const out: ExternalItem[] = [];
    for (const m of items.slice(0, rows)) {
      try {
        out.push(normalizeCrossrefWork(toRaw(m)));
      } catch {
        continue;
      }
    }
    return out;
  } catch (err) {
    throw toConnectorError(err);
  }
}

/** Normalize an already-fetched Crossref message (fixtures/offline path). */
export function crossrefNormalizeMessage(message: Record<string, unknown>, opts?: { retrievedAt?: string }): ExternalItem {
  requireCapability(CROSSREF_CONNECTOR_ID, "METADATA");
  return normalizeCrossrefWork(toRaw(message), opts);
}
