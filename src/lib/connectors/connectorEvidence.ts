/**
 * Phase 4 — Connector evidence + provenance.
 * Reuses the Phase 2 SourceRef verbatim; connector provenance rides as an
 * additive optional `connector` key in the persisted source JSON (old readers
 * ignore unknown keys; validation ignores them too). Every connector-created
 * entity/relationship gets Evidence → SourceRef → connector source →
 * external id + URL + retrieval time.
 */
import type { SourceRef } from "@/lib/documents/types";
import type { Evidence } from "@/lib/knowledge/types";
import {
  connectorChunkId,
  connectorDocumentId,
} from "@/lib/connectors/connectorCore.mjs";
import type { ConnectorProvenance, ExternalItem } from "@/lib/connectors/connectorTypes";

export type ConnectorSourceRef = SourceRef & {
  connector?: ConnectorProvenance;
};

let evCounter = 0;

function evId(prefix: string): string {
  evCounter += 1;
  return `${prefix}_conn_${Date.now().toString(36)}_${evCounter.toString(36)}`.slice(0, 128);
}

/** Build the SourceRef for a connector item (ID_RE-safe, slash-free ids). */
export function sourceRefForConnectorItem(item: ExternalItem): ConnectorSourceRef {
  const chunk = connectorChunkId(item.connectorId, item.externalId) as string;
  const doc = connectorDocumentId(item.connectorId) as string;
  return {
    documentId: doc,
    chunkId: chunk,
    sourceType: "url",
    sourceUri: item.externalUrl?.slice(0, 500),
    title: item.title?.slice(0, 500),
    connector: {
      connectorId: item.connectorId,
      externalId: item.externalId,
      url: item.externalUrl,
      retrievedAt: item.retrievedAt,
      providerVersion: item.sourceVersion,
    },
  };
}

const ORIGIN_FOR: Record<string, Evidence["origin"]> = {
  crossref: "crossref",
  zotero: "zotero",
};

function originFor(connectorId: string): Evidence["origin"] {
  return ORIGIN_FOR[connectorId] ?? "import";
}

export function evidenceForConnectorEntity(
  entityId: string,
  item: ExternalItem,
  opts?: { quote?: string; evidenceType?: Evidence["evidenceType"]; projectId?: string }
): Evidence {
  return {
    id: evId("ent"),
    subjectType: "entity",
    subjectId: entityId,
    quote: opts?.quote?.slice(0, 600),
    evidenceType: opts?.evidenceType ?? "metadata",
    sourceRef: sourceRefForConnectorItem(item),
    confidence: item.identifiers.some((i) => i.namespace === "doi") ? "high" : "medium",
    status: "current",
    origin: originFor(item.connectorId),
    projectId: opts?.projectId,
    createdAt: new Date().toISOString(),
  };
}

export function evidenceForConnectorRelationship(
  relationshipId: string,
  item: ExternalItem,
  opts?: { quote?: string; evidenceType?: Evidence["evidenceType"]; projectId?: string }
): Evidence {
  return {
    id: evId("rel"),
    subjectType: "relationship",
    subjectId: relationshipId,
    quote: opts?.quote?.slice(0, 600),
    evidenceType: opts?.evidenceType ?? "metadata",
    sourceRef: sourceRefForConnectorItem(item),
    confidence: "medium",
    status: "current",
    origin: originFor(item.connectorId),
    projectId: opts?.projectId,
    createdAt: new Date().toISOString(),
  };
}

/** Properties stamped on connector-managed entities (provider trail). */
export function connectorEntityProperties(item: ExternalItem): Record<string, string> {
  const props: Record<string, string> = {
    [`connector:${item.connectorId}:externalId`]: item.externalId.slice(0, 256),
    [`connector:${item.connectorId}:retrievedAt`]: item.retrievedAt.slice(0, 64),
  };
  if (item.externalUrl) props[`connector:${item.connectorId}:url`] = item.externalUrl.slice(0, 500);
  if (item.sourceVersion) props[`connector:${item.connectorId}:version`] = item.sourceVersion.slice(0, 64);
  if (item.publicationDate) props["year"] = item.publicationDate.slice(0, 16);
  if (item.venue) props["journal"] = item.venue.slice(0, 300);
  return props;
}
