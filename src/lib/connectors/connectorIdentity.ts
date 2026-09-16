/**
 * Phase 4 — Identity resolution on top of Phase 3 identity (no algorithm changes).
 * Priority: stable provider id → DOI → namespaced external id → deterministic
 * metadata fallback. Returns null when confidence is insufficient.
 */
import { normalizeDoi, resolveConnectorIdentity } from "@/lib/connectors/connectorCore.mjs";
import { isValidDoiFormat } from "@/lib/connectors/connectorCore.mjs";
import { entityIdFor, paperIdForDoi } from "@/lib/knowledge/identity";
import { normalizeName } from "@/lib/knowledge/normalize";
import type { ExternalItem } from "@/lib/connectors/connectorTypes";

export interface ResolvedIdentity {
  /** Deterministic entity id for the paper record. */
  entityId: string;
  /** Namespaced external identifier to attach. */
  namespace: string;
  value: string;
  kind: "doi" | "provider";
}

function doiOf(item: ExternalItem): string | undefined {
  const direct = item.identifiers.find((i) => i.namespace === "doi")?.value;
  if (direct && (isValidDoiFormat(direct) as boolean)) return normalizeDoi(direct) as string;
  return undefined;
}

export function resolveIdentityForItem(item: ExternalItem): ResolvedIdentity | null {
  if (!item.title?.trim() && !doiOf(item)) return null;
  const doi = doiOf(item);
  const resolved = resolveConnectorIdentity({
    connectorId: item.connectorId,
    externalId: item.externalId,
    doi,
    fallbackKey: item.title ?? item.externalId,
  }) as { kind: string; namespace: string; value: string } | null;
  if (!resolved) return null;
  if (doi) {
    return { entityId: paperIdForDoi(doi), namespace: "doi", value: doi, kind: "doi" };
  }
  const titleKey = normalizeName(item.title ?? item.externalId);
  if (!titleKey) return null;
  return {
    entityId: entityIdFor("paper", titleKey),
    namespace: resolved.namespace,
    value: resolved.value,
    kind: "provider",
  };
}

/** Stable external key for link/dedupe tables: `<namespace>:<value>`. */
export function externalKeyFor(namespace: string, value: string): string {
  return `${namespace}:${value}`;
}

/** All namespaced identifiers that should be attached to the paper entity. */
export function identifiersForItem(item: ExternalItem, resolved: ResolvedIdentity): { namespace: string; value: string }[] {
  const out = new Map<string, { namespace: string; value: string }>();
  for (const id of item.identifiers) {
    out.set(`${id.namespace}:${id.value.toLowerCase()}`, id);
  }
  out.set(`${resolved.namespace}:${resolved.value.toLowerCase()}`, {
    namespace: resolved.namespace,
    value: resolved.value,
  });
  return [...out.values()].slice(0, 32);
}
