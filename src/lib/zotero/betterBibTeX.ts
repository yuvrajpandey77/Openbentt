import { parseBibtex, type BibEntry } from "@/lib/bibtex";
import type { ZoteroSyncConflict } from "@/types/zotero";

/** Detect Better BibTeX export by presence of citationKey fields. */
export function detectBetterBibTeX(bibText: string): boolean {
  if (!bibText.trim()) return false;
  return (
    /\bcitationkey\s*=/i.test(bibText) ||
    /\bbetter\s*bib\s*tex\b/i.test(bibText) ||
    /@string/i.test(bibText)
  );
}

/** Extract stable citekey from a BibEntry (BBT uses citationKey field when present). */
export function citekeyFromBibEntry(entry: BibEntry): string {
  const raw = entry.raw;
  const ck = raw.match(/\bcitationkey\s*=\s*[{"']?([^,"'}]+)/i);
  if (ck?.[1]) return ck[1].trim();
  return entry.key;
}

/** Build citekey → entry map preserving BBT keys. */
export function indexBibByCitekey(bibText: string): Map<string, BibEntry> {
  const map = new Map<string, BibEntry>();
  for (const e of parseBibtex(bibText)) {
    const ck = citekeyFromBibEntry(e);
    map.set(ck, e);
    if (ck !== e.key) map.set(e.key, e);
  }
  return map;
}

export interface BibMergeOptions {
  preferIncoming?: boolean;
  preserveCitekeys?: boolean;
}

/**
 * Merge project bibliography with Zotero/BBT export.
 * Returns merged bib text and any conflicts when both sides differ.
 */
export function mergeBibliographies(
  localBib: string,
  incomingBib: string,
  opts: BibMergeOptions = {}
): { bibliography: string; conflicts: ZoteroSyncConflict[]; warnings: string[] } {
  const warnings: string[] = [];
  const conflicts: ZoteroSyncConflict[] = [];
  const localMap = indexBibByCitekey(localBib);
  const incomingMap = indexBibByCitekey(incomingBib);
  const merged = new Map<string, BibEntry>();

  for (const [k, e] of localMap) merged.set(k, e);

  for (const [citekey, incoming] of incomingMap) {
    const existing = merged.get(citekey);
    if (!existing) {
      merged.set(citekey, incoming);
      continue;
    }
    const localRaw = existing.raw.trim();
    const remoteRaw = incoming.raw.trim();
    if (localRaw === remoteRaw) continue;

    if (opts.preferIncoming) {
      merged.set(citekey, incoming);
      conflicts.push({
        citekey,
        field: "bibtex",
        localValue: localRaw.slice(0, 200),
        remoteValue: remoteRaw.slice(0, 200),
        resolution: "keep-remote",
      });
    } else {
      conflicts.push({
        citekey,
        field: "bibtex",
        localValue: localRaw.slice(0, 200),
        remoteValue: remoteRaw.slice(0, 200),
        resolution: "keep-local",
      });
      warnings.push(`Conflict on citekey "${citekey}" — kept local version.`);
    }
  }

  if (opts.preserveCitekeys && detectBetterBibTeX(incomingBib)) {
    warnings.push("Better BibTeX citekeys preserved from auto-export.");
  }

  const bibliography = [...merged.values()].map((e) => e.raw).join("\n\n");
  return { bibliography, conflicts, warnings };
}

/** Resolve conflicts by user choice. */
export function applyConflictResolutions(
  localBib: string,
  incomingBib: string,
  conflicts: ZoteroSyncConflict[]
): string {
  const localMap = indexBibByCitekey(localBib);
  const incomingMap = indexBibByCitekey(incomingBib);
  const merged = new Map<string, BibEntry>(localMap);

  for (const c of conflicts) {
    if (c.resolution === "keep-remote") {
      const inc = incomingMap.get(c.citekey);
      if (inc) merged.set(c.citekey, inc);
    } else if (c.resolution === "keep-local") {
      const loc = localMap.get(c.citekey);
      if (loc) merged.set(c.citekey, loc);
    }
  }

  for (const [k, e] of incomingMap) {
    if (!merged.has(k)) merged.set(k, e);
  }

  return [...merged.values()].map((e) => e.raw).join("\n\n");
}
