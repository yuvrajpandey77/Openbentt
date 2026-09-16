/**
 * Phase 3 — Entity identity helpers (typed facade over knowledgeCore.mjs).
 * Stable ids: `ent_<type>_<fnv8>`; DOI-anchored papers; namespaced external ids.
 */
import {
  entityIdFor as coreEntityIdFor,
  paperIdForDoi as corePaperIdForDoi,
} from "@/lib/knowledge/knowledgeCore.mjs";
import { normalizeName, normalizePersonName } from "@/lib/knowledge/normalize";

export function entityIdFor(type: string, normalizedName: string): string {
  return coreEntityIdFor(type, normalizedName) as string;
}

export function paperIdForDoi(doi: string): string {
  return corePaperIdForDoi(doi) as string;
}

export function personNameFor(type: string, raw: string): { canonical: string; normalized: string; id: string } {
  const canonical = String(raw ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 300);
  const normalized = type === "person" ? normalizePersonName(raw) : normalizeName(raw);
  return { canonical, normalized, id: entityIdFor(type, normalized) };
}

export function externalKey(namespace: string, value: string): string {
  return `${namespace}:${value}`;
}
