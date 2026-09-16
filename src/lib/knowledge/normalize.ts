/**
 * Phase 3 — Deterministic normalization (typed facade over knowledgeCore.mjs).
 * The .mjs core is the single source shared with Electron; this module adds
 * types only. Normalization proposes CANDIDATES, never identity.
 */
import {
  normalizeDoi as coreNormalizeDoi,
  normalizeName as coreNormalizeName,
  normalizePersonName as coreNormalizePersonName,
  splitAuthorNames as coreSplitAuthorNames,
} from "@/lib/knowledge/knowledgeCore.mjs";

export function normalizeName(raw: string): string {
  return coreNormalizeName(raw) as string;
}

export function normalizePersonName(raw: string): string {
  return coreNormalizePersonName(raw) as string;
}

export function splitAuthorNames(raw: string): string[] {
  return coreSplitAuthorNames(raw) as string[];
}

export function normalizeDoi(raw: string): string {
  return coreNormalizeDoi(raw) as string;
}
