import type {
  ZoteroConnectionStatus,
  ZoteroLibrarySnapshot,
  ZoteroSyncProgress,
  ZoteroSyncResult,
} from "@/types/zotero";
import { buildSyncResult } from "@/lib/zotero/zoteroSync";
import {
  mapZoteroApiToSnapshot,
  zoteroFetchAllItems,
  zoteroFetchCollections,
  zoteroFetchTags,
  zoteroWhoami,
} from "@/lib/zotero/zoteroWebApi";
import { isDesktopApp } from "@/lib/isDesktopApp";

export interface OpenbenttZoteroApi {
  detectLocal: () => Promise<{
    local: ZoteroConnectionStatus["local"];
    betterBibTeX: ZoteroConnectionStatus["betterBibTeX"];
  }>;
  status: () => Promise<ZoteroConnectionStatus & { hasApiKey?: boolean; bbtExportPath?: string }>;
  setCredentials: (userId: string, apiKey: string) => Promise<{ ok: boolean }>;
  clearCredentials: () => Promise<{ ok: boolean }>;
  setBbtExportPath: (path: string) => Promise<{ ok: boolean }>;
  sync: (opts?: {
    mode?: "web" | "better-bibtex";
    useBbt?: boolean;
    bbtExportPath?: string;
  }) => Promise<{ ok: boolean; snapshot?: ZoteroLibrarySnapshot; error?: string; warnings?: string[] }>;
  getLibrarySnapshot: () => Promise<ZoteroLibrarySnapshot | null>;
  watchBetterBibTeX: (exportPath?: string) => Promise<{ ok: boolean; error?: string }>;
  stopWatch: () => Promise<{ ok: boolean }>;
  secretStatus: () => Promise<{ stored: boolean; encryptionAvailable: boolean }>;
  secretSet: (apiKey: string) => Promise<{ ok: boolean }>;
  secretClear: () => Promise<{ ok: boolean }>;
  onSyncProgress: (cb: (p: ZoteroSyncProgress) => void) => () => void;
  onLibraryChanged: (cb: (payload: { snapshot: ZoteroLibrarySnapshot }) => void) => () => void;
}

declare global {
  interface Window {
    openbenttZotero?: OpenbenttZoteroApi;
  }
}

export function getZoteroApi(): OpenbenttZoteroApi | null {
  if (typeof window === "undefined") return null;
  return window.openbenttZotero ?? null;
}

export function zoteroAvailable(): boolean {
  return isDesktopApp() && Boolean(getZoteroApi());
}

/** Web-mode sync using Zotero Web API directly (for tests / manual key entry in browser). */
export async function syncZoteroWebInRenderer(
  userId: string,
  apiKey: string,
  onProgress?: (current: number, total: number) => void
): Promise<ZoteroLibrarySnapshot> {
  const fetchFn = globalThis.fetch.bind(globalThis);
  await zoteroWhoami(fetchFn, apiKey);
  const [items, collections, tags] = await Promise.all([
    zoteroFetchAllItems(fetchFn, userId, apiKey, onProgress),
    zoteroFetchCollections(fetchFn, userId, apiKey),
    zoteroFetchTags(fetchFn, userId, apiKey),
  ]);
  const mapped = mapZoteroApiToSnapshot(items, collections, tags, userId);
  return {
    syncedAt: new Date().toISOString(),
    mode: "web",
    userId,
    itemCount: mapped.items.length,
    warnings: [],
    ...mapped,
  };
}

export function mergeSnapshotIntoProject(
  snapshot: ZoteroLibrarySnapshot,
  localBib: string,
  preferIncoming = true
): ZoteroSyncResult {
  return buildSyncResult(snapshot, localBib, preferIncoming);
}
