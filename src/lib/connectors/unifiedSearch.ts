/**
 * Phase 7 — unified search + knowledge mapping (pure orchestration).
 *
 * unifiedSearch fans out to per-source search functions (each already
 * policy-gated by the caller), bounds each source, merges with provenance,
 * and never dumps full external resources into context.
 * mapExternalResourceToKnowledge converts an ExternalResource into the
 * existing ontology entities (paper/person/organization/event/concept)
 * — no second graph.
 */
import { externalResourceId } from "@/lib/connectors/connectorCore.mjs";

export interface UnifiedSearchHit {
  source: string;
  connectorId: string;
  resourceId: string;
  title: string;
  type: string;
  timestamp?: string;
  snippet?: string;
  url?: string;
  provenance: {
    connectorId: string;
    externalId: string;
    url?: string;
    retrievedAt: string;
    syncId?: string;
    resourceType: string;
  };
}

export interface SourceSearchFn {
  (query: string, opts: { limit: number; signal?: AbortSignal }): Promise<UnifiedSearchHit[]>;
}

export interface UnifiedSearchOptions {
  limit?: number;
  perSourceLimit?: number;
  sources?: string[];
  timeoutMs?: number;
}

export async function unifiedSearch(
  query: string,
  sourceFns: Record<string, SourceSearchFn>,
  opts?: UnifiedSearchOptions
): Promise<{ hits: UnifiedSearchHit[]; searchedSources: string[]; failedSources: { source: string; error: string }[] }> {
  const q = String(query ?? "").trim().slice(0, 500);
  if (!q) throw new Error("empty-query");
  const wanted = opts?.sources ?? Object.keys(sourceFns);
  const perSource = Math.min(50, Math.max(1, opts?.perSourceLimit ?? 10));
  const totalLimit = Math.min(200, Math.max(1, opts?.limit ?? 50));
  const timeoutMs = opts?.timeoutMs ?? 30000;

  const hits: UnifiedSearchHit[] = [];
  const failedSources: { source: string; error: string }[] = [];
  const searchedSources: string[] = [];

  await Promise.all(
    wanted.map(async (source) => {
      const fn = sourceFns[source];
      if (!fn) {
        failedSources.push({ source, error: "unknown_source" });
        return;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const rows = await fn(q, { limit: perSource, signal: ctrl.signal });
        searchedSources.push(source);
        for (const h of rows.slice(0, perSource)) hits.push(h);
      } catch (err) {
        // Failure isolation: one source failing never fails the search.
        failedSources.push({
          source,
          error: String((err as Error)?.message ?? "search_failed").slice(0, 120),
        });
      } finally {
        clearTimeout(timer);
      }
    })
  );

  // Rank: prefer title matches, then most recent; stable + deterministic.
  const lower = q.toLowerCase();
  hits.sort((a, b) => {
    const at = a.title.toLowerCase().includes(lower) ? 0 : 1;
    const bt = b.title.toLowerCase().includes(lower) ? 0 : 1;
    if (at !== bt) return at - bt;
    return String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? ""));
  });
  return { hits: hits.slice(0, totalLimit), searchedSources, failedSources };
}

/** Build a search hit envelope from a normalized provider resource. */
export function hitFromResource(args: {
  connectorId: string;
  source: string;
  externalId: string;
  type: string;
  title: string;
  timestamp?: string;
  snippet?: string;
  url?: string;
  syncId?: string;
}): UnifiedSearchHit {
  return {
    source: args.source,
    connectorId: args.connectorId,
    resourceId: externalResourceId(args.connectorId, args.externalId),
    title: args.title.slice(0, 1000),
    type: args.type.slice(0, 64),
    timestamp: args.timestamp,
    snippet: args.snippet?.slice(0, 400),
    url: args.url,
    provenance: {
      connectorId: args.connectorId,
      externalId: args.externalId,
      url: args.url,
      retrievedAt: new Date().toISOString(),
      syncId: args.syncId,
      resourceType: args.type.slice(0, 64),
    },
  };
}

/* ---------------- knowledge mapping ---------------- */

export interface KnowledgeSeed {
  entityType: string;
  canonicalName: string;
  description?: string;
  externalIds: { namespace: string; value: string }[];
  tags: string[];
  relationships: { type: string; targetName: string; targetType: string }[];
}

/**
 * Map an external resource onto existing ontology entity types.
 * person/organization/paper/venue/method/dataset/technology/concept/
 * location/event/product + RELATED_TO/AUTHORED_BY/PART_OF only.
 */
export function mapExternalResourceToKnowledge(args: {
  connectorId: string;
  resourceType: string;
  title: string;
  owner?: string;
  snippet?: string;
}): KnowledgeSeed {
  const title = args.title.slice(0, 300) || "(untitled)";
  const tags = [args.connectorId, args.resourceType].slice(0, 32);
  const externalIds = [{ namespace: args.connectorId.slice(0, 32), value: title.slice(0, 256) }];
  switch (args.resourceType) {
    case "message":
    case "thread":
    case "event":
      return {
        entityType: "event",
        canonicalName: title,
        description: args.snippet?.slice(0, 2000),
        externalIds,
        tags,
        relationships: args.owner
          ? [{ type: "RELATED_TO", targetName: args.owner.slice(0, 300), targetType: "person" }]
          : [],
      };
    case "repository":
    case "pull_request":
    case "commit":
      return {
        entityType: "technology",
        canonicalName: title,
        description: args.snippet?.slice(0, 2000),
        externalIds,
        tags,
        relationships: args.owner
          ? [{ type: "BUILT_WITH", targetName: args.owner.slice(0, 300), targetType: "organization" }]
          : [],
      };
    case "document":
    case "spreadsheet":
    case "presentation":
    case "pdf":
    case "page":
    case "database":
      return {
        entityType: "concept",
        canonicalName: title,
        description: args.snippet?.slice(0, 2000),
        externalIds,
        tags,
        relationships: [],
      };
    default:
      return { entityType: "concept", canonicalName: title, description: args.snippet?.slice(0, 2000), externalIds, tags, relationships: [] };
  }
}
