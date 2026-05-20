import type { ZoteroLibrarySnapshot, ZoteroSyncResult } from "@/types/zotero";
import { mergeBibliographies } from "@/lib/zotero/betterBibTeX";

export function buildSyncResult(
  snapshot: ZoteroLibrarySnapshot,
  localBib: string,
  preferIncoming = true
): ZoteroSyncResult {
  const { bibliography, conflicts, warnings } = mergeBibliographies(localBib, snapshot.bibliography, {
    preferIncoming,
    preserveCitekeys: snapshot.mode === "better-bibtex",
  });

  const partial = warnings.length > 0 || conflicts.some((c) => c.resolution === "unresolved");

  return {
    ok: true,
    partial,
    snapshot,
    conflicts,
    bibliography,
    warnings: [...snapshot.warnings, ...warnings],
  };
}

export function emptySnapshot(mode: ZoteroLibrarySnapshot["mode"] = "disconnected"): ZoteroLibrarySnapshot {
  return {
    syncedAt: new Date().toISOString(),
    mode,
    itemCount: 0,
    collections: [],
    tags: [],
    items: [],
    notes: [],
    attachments: [],
    annotations: [],
    bibliography: "",
    warnings: [],
  };
}
