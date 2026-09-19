/**
 * Phase 4 — Connector registry (static, no dynamic loading).
 * Phase 7 — Tier-1 enterprise connectors registered explicitly with
 * READ_ONLY operations. Unknown ids are rejected.
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
  "google-drive": {
    ...(CONNECTOR_META as Record<string, Omit<ConnectorDefinition, "capabilities" | "supportedEntityTypes" | "supportedOperations">>)["google-drive"],
    capabilities: capabilitiesFor("google-drive"),
    supportedEntityTypes: ["concept", "person", "organization"],
    supportedOperations: ["search", "fetchItem", "preview", "dryRun", "import", "sync"],
    rateLimitNote: "Drive API v3 per-user limits; max 100/page; single 429 retry; OAuth (drive.readonly).",
  },
  gmail: {
    ...(CONNECTOR_META as Record<string, Omit<ConnectorDefinition, "capabilities" | "supportedEntityTypes" | "supportedOperations">>).gmail,
    capabilities: capabilitiesFor("gmail"),
    supportedEntityTypes: ["event", "person", "organization"],
    supportedOperations: ["search", "fetchItem", "preview", "import", "sync"],
    rateLimitNote: "Gmail API v1; bounded bodies; OAuth (gmail.readonly). READ ONLY.",
  },
  "google-calendar": {
    ...(CONNECTOR_META as Record<string, Omit<ConnectorDefinition, "capabilities" | "supportedEntityTypes" | "supportedOperations">>)["google-calendar"],
    capabilities: capabilitiesFor("google-calendar"),
    supportedEntityTypes: ["event", "person", "location"],
    supportedOperations: ["search", "fetchItem", "preview", "import", "sync"],
    rateLimitNote: "Calendar API v3; time-bounded windows; OAuth (calendar.readonly). READ ONLY.",
  },
  slack: {
    ...(CONNECTOR_META as Record<string, Omit<ConnectorDefinition, "capabilities" | "supportedEntityTypes" | "supportedOperations">>).slack,
    capabilities: capabilitiesFor("slack"),
    supportedEntityTypes: ["event", "person", "organization"],
    supportedOperations: ["search", "fetchItem", "preview", "import", "sync"],
    rateLimitNote: "Slack Web API tier limits; Retry-After honored; OAuth. READ ONLY.",
  },
  github: {
    ...(CONNECTOR_META as Record<string, Omit<ConnectorDefinition, "capabilities" | "supportedEntityTypes" | "supportedOperations">>).github,
    capabilities: capabilitiesFor("github"),
    supportedEntityTypes: ["technology", "person", "organization"],
    supportedOperations: ["search", "fetchItem", "preview", "import", "sync"],
    rateLimitNote: "5000 req/hr authenticated; OAuth. READ ONLY — no merge/push.",
  },
  notion: {
    ...(CONNECTOR_META as Record<string, Omit<ConnectorDefinition, "capabilities" | "supportedEntityTypes" | "supportedOperations">>).notion,
    capabilities: capabilitiesFor("notion"),
    supportedEntityTypes: ["concept", "person", "organization"],
    supportedOperations: ["search", "fetchItem", "preview", "import", "sync"],
    rateLimitNote: "~3 req/sec; cursor pagination; OAuth. READ ONLY.",
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
