/**
 * Phase 4 — Connector registry (static, no dynamic loading).
 * Future providers register here explicitly; unknown ids are rejected.
 */
import { CONNECTOR_META } from "@/lib/connectors/connectorCore.mjs";
import { capabilitiesFor } from "@/lib/connectors/connectorCapabilities";
import { ConnectorError } from "@/lib/connectors/connectorErrors";
import type { ConnectorDefinition } from "@/lib/connectors/connectorTypes";

const ENTITY_TYPES = ["paper", "person", "organization", "venue", "dataset", "technology"];

const DEFINITIONS: Record<string, ConnectorDefinition> = {
  crossref: {
    ...(CONNECTOR_META as Record<string, Omit<ConnectorDefinition, "capabilities" | "supportedEntityTypes" | "supportedOperations">>).crossref,
    capabilities: capabilitiesFor("crossref"),
    supportedEntityTypes: ["paper", "person", "organization", "venue"],
    supportedOperations: ["search", "fetchItem", "preview", "dryRun", "import"],
    rateLimitNote: "Polite pool; bounded client-side (no aggressive retries).",
  },
  zotero: {
    ...(CONNECTOR_META as Record<string, Omit<ConnectorDefinition, "capabilities" | "supportedEntityTypes" | "supportedOperations">>).zotero,
    capabilities: capabilitiesFor("zotero"),
    supportedEntityTypes: ["paper", "person", "venue"],
    supportedOperations: ["fetchCollection", "fetchItem", "preview", "dryRun", "import"],
    rateLimitNote: "Respects 429/Retry-After with bounded backoff (single retry max).",
  },
};

export function getConnectorDefinition(id: string): ConnectorDefinition {
  const def = DEFINITIONS[id];
  if (!def) throw new ConnectorError("invalid_connector", id);
  return { ...def, capabilities: [...def.capabilities] };
}

export function listConnectorDefinitions(): ConnectorDefinition[] {
  return Object.keys(DEFINITIONS).map((id) => getConnectorDefinition(id));
}

export function assertKnownConnector(id: unknown): string {
  if (typeof id !== "string" || !DEFINITIONS[id]) {
    throw new ConnectorError("invalid_connector", typeof id === "string" ? id : "missing");
  }
  return id;
}

export function supportedEntityTypesFor(id: string): string[] {
  return getConnectorDefinition(id).supportedEntityTypes;
}

export { ENTITY_TYPES };
