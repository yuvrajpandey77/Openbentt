/**
 * Phase 3 — Stale knowledge semantics.
 * Evidence records the document version it was captured against. When the
 * document moves on, evidence becomes `stale` — historically understandable,
 * never silently false, never auto-deleted.
 */
import type { Evidence } from "@/lib/knowledge/types";

/** Resolve from a version id like `doc_ab12@v3` → 3 (undefined when unparsable). */
export function versionIntFromId(versionId?: string): number | undefined {
  if (!versionId) return undefined;
  const m = /@v(\d+)\s*$/.exec(versionId);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : undefined;
}

export function isEvidenceStale(
  evidence: Pick<Evidence, "evidenceDocVersion" | "status">,
  currentDocVersion?: number
): boolean {
  if (evidence.status === "retracted") return false;
  if (evidence.evidenceDocVersion === undefined || currentDocVersion === undefined) return false;
  return currentDocVersion > evidence.evidenceDocVersion;
}

/** Mark a list of evidence stale against a version map (pure helper for stores). */
export function markStale<T extends { id: string; evidenceDocVersion?: number; status: string }>(
  rows: T[],
  currentVersionFor: (documentId: string) => number | undefined,
  documentIdFor: (row: T) => string | undefined
): { id: string; stale: boolean }[] {
  return rows.map((r) => {
    const docId = documentIdFor(r);
    const current = docId ? currentVersionFor(docId) : undefined;
    return {
      id: r.id,
      stale: r.evidenceDocVersion !== undefined && current !== undefined && current > r.evidenceDocVersion,
    };
  });
}
