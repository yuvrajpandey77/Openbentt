/**
 * Phase 4 — Capability declarations (static, fail-safe).
 * Unknown capabilities fail closed; unsupported ops are never exposed.
 */
import {
  CONNECTOR_CAPABILITIES,
  CONNECTOR_IDS,
  KNOWN_CAPABILITIES,
} from "@/lib/connectors/connectorCore.mjs";
import { ConnectorError } from "@/lib/connectors/connectorErrors";
import type { ConnectorCapability } from "@/lib/connectors/connectorTypes";

const KNOWN = new Set<string>(KNOWN_CAPABILITIES as string[]);

export function isKnownCapability(cap: string): boolean {
  return KNOWN.has(cap);
}

export function capabilitiesFor(connectorId: string): ConnectorCapability[] {
  const caps = (CONNECTOR_CAPABILITIES as Record<string, string[]>)[connectorId];
  if (!caps) throw new ConnectorError("invalid_connector", connectorId);
  return [...caps] as ConnectorCapability[];
}

export function supportsCapability(connectorId: string, cap: string): boolean {
  if (!KNOWN.has(cap)) return false;
  const caps = (CONNECTOR_CAPABILITIES as Record<string, string[]>)[connectorId];
  if (!caps) throw new ConnectorError("invalid_connector", connectorId);
  return caps.includes(cap);
}

/** Throw unless the connector supports the capability (checked before execution). */
export function requireCapability(connectorId: string, cap: string): void {
  if (!KNOWN.has(cap)) throw new ConnectorError("unsupported_capability", cap);
  if (!(CONNECTOR_IDS as string[]).includes(connectorId)) {
    throw new ConnectorError("invalid_connector", connectorId);
  }
  if (!supportsCapability(connectorId, cap)) {
    throw new ConnectorError("unsupported_capability", `${connectorId}:${cap}`);
  }
}

export function knownConnectorIds(): string[] {
  return [...(CONNECTOR_IDS as string[])];
}
