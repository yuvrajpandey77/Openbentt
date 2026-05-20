import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  ZoteroConnectionStatus,
  ZoteroLibrarySnapshot,
  ZoteroSyncProgress,
  ZoteroSyncResult,
} from "@/types/zotero";
import {
  getZoteroApi,
  mergeSnapshotIntoProject,
  syncZoteroWebInRenderer,
  zoteroAvailable,
} from "@/lib/zotero/desktopApi";
import { buildMockZoteroSnapshot } from "@/lib/zotero/mockZotero";
import { useToast } from "@/components/ui/use-toast";

const WEB_CREDS_KEY = "openbentt-zotero-web-creds";

type ZoteroContextValue = {
  available: boolean;
  status: ZoteroConnectionStatus;
  snapshot: ZoteroLibrarySnapshot | null;
  syncing: boolean;
  progress: ZoteroSyncProgress | null;
  lastSyncResult: ZoteroSyncResult | null;
  refreshStatus: () => Promise<void>;
  connectWeb: (userId: string, apiKey: string) => Promise<void>;
  disconnect: () => Promise<void>;
  syncLibrary: (opts?: { useBbt?: boolean; bbtExportPath?: string }) => Promise<ZoteroSyncResult | null>;
  setBbtExportPath: (path: string) => Promise<void>;
  startBbtWatch: (path?: string) => Promise<void>;
  stopBbtWatch: () => Promise<void>;
  mergeIntoBibliography: (localBib: string, preferIncoming?: boolean) => ZoteroSyncResult | null;
  useMockLibrary: () => void;
};

const defaultStatus: ZoteroConnectionStatus = {
  mode: "disconnected",
  connected: false,
  local: { found: false, platform: "unknown" },
  betterBibTeX: { detected: false, watching: false, citekeyField: "key" },
  syncing: false,
};

const ZoteroContext = createContext<ZoteroContextValue | null>(null);

export function ZoteroProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const api = getZoteroApi();
  const available = zoteroAvailable() || typeof fetch !== "undefined";

  const [status, setStatus] = useState<ZoteroConnectionStatus>(defaultStatus);
  const [snapshot, setSnapshot] = useState<ZoteroLibrarySnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<ZoteroSyncProgress | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<ZoteroSyncResult | null>(null);

  const refreshStatus = useCallback(async () => {
    if (api) {
      const s = await api.status();
      setStatus({
        mode: s.mode,
        connected: s.connected,
        userId: s.userId,
        userName: s.userName,
        local: s.local,
        betterBibTeX: s.betterBibTeX,
        lastSyncAt: s.lastSyncAt,
        lastError: s.lastError,
        syncing: false,
      });
      const lib = await api.getLibrarySnapshot();
      if (lib) setSnapshot(lib);
      return;
    }

    const raw = localStorage.getItem(WEB_CREDS_KEY);
    if (raw) {
      try {
        const { userId } = JSON.parse(raw) as { userId: string };
        setStatus((prev) => ({
          ...prev,
          mode: "web",
          connected: Boolean(snapshot),
          userId,
        }));
      } catch {
        /* ignore */
      }
    }
  }, [api, snapshot]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!api) return;
    const offProgress = api.onSyncProgress((p) => {
      setProgress(p);
      if (p.phase === "error") {
        toast({ title: "Zotero sync failed", description: p.message, variant: "destructive" });
      }
    });
    const offLib = api.onLibraryChanged(({ snapshot: s }) => {
      setSnapshot(s);
      setSyncing(false);
      setProgress({ phase: "complete", message: `Library updated (${s.itemCount} items)` });
      toast({ title: "Zotero library updated", description: `${s.itemCount} items synced` });
    });
    return () => {
      offProgress();
      offLib();
    };
  }, [api, toast]);

  const connectWeb = useCallback(
    async (userId: string, apiKey: string) => {
      if (api) {
        await api.secretSet(apiKey);
        await api.setCredentials(userId, apiKey);
        await refreshStatus();
        toast({ title: "Zotero credentials saved" });
        return;
      }
      localStorage.setItem(WEB_CREDS_KEY, JSON.stringify({ userId }));
      localStorage.setItem(`${WEB_CREDS_KEY}-key`, apiKey);
      setStatus((prev) => ({ ...prev, mode: "web", userId, connected: false }));
      toast({ title: "Zotero credentials saved (browser)" });
    },
    [api, refreshStatus, toast]
  );

  const disconnect = useCallback(async () => {
    if (api) {
      await api.clearCredentials();
      await api.secretClear();
      await api.stopWatch();
    }
    localStorage.removeItem(WEB_CREDS_KEY);
    localStorage.removeItem(`${WEB_CREDS_KEY}-key`);
    setSnapshot(null);
    setLastSyncResult(null);
    setStatus(defaultStatus);
    toast({ title: "Zotero disconnected" });
  }, [api, toast]);

  const syncLibrary = useCallback(
    async (opts?: { useBbt?: boolean; bbtExportPath?: string }) => {
      setSyncing(true);
      setProgress({ phase: "detecting", message: "Starting sync…" });

      try {
        if (api) {
          const res = await api.sync(opts?.useBbt ? { useBbt: true, bbtExportPath: opts.bbtExportPath } : {});
          if (!res.ok) {
            const fail: ZoteroSyncResult = {
              ok: false,
              partial: false,
              conflicts: [],
              warnings: res.warnings ?? [],
              error: res.error,
            };
            setLastSyncResult(fail);
            toast({
              title: "Zotero sync failed",
              description: res.error ?? "Unknown error",
              variant: "destructive",
            });
            return fail;
          }
          if (res.snapshot) setSnapshot(res.snapshot);
          await refreshStatus();
          setProgress({ phase: "complete", message: "Sync complete" });
          const result = res.snapshot ? mergeSnapshotIntoProject(res.snapshot, "") : null;
          if (result) {
            setLastSyncResult(result);
            toast({
              title: "Zotero synced",
              description: `${res.snapshot?.itemCount ?? 0} items`,
            });
          }
          return result;
        }

        const raw = localStorage.getItem(WEB_CREDS_KEY);
        const apiKey = localStorage.getItem(`${WEB_CREDS_KEY}-key`) ?? "";
        if (!raw || !apiKey) {
          throw new Error("Zotero credentials missing. Connect via Web API or use desktop app.");
        }
        const { userId } = JSON.parse(raw) as { userId: string };
        const snap = await syncZoteroWebInRenderer(userId, apiKey, (cur, tot) => {
          setProgress({
            phase: "fetching",
            message: `Fetching ${cur}/${tot}…`,
            current: cur,
            total: tot,
          });
        });
        setSnapshot(snap);
        setStatus((prev) => ({
          ...prev,
          mode: "web",
          connected: true,
          userId,
          lastSyncAt: snap.syncedAt,
        }));
        const result = mergeSnapshotIntoProject(snap, "");
        setLastSyncResult(result);
        setProgress({ phase: "complete", message: "Sync complete" });
        toast({ title: "Zotero synced", description: `${snap.itemCount} items` });
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setProgress({ phase: "error", message: msg });
        const fail: ZoteroSyncResult = {
          ok: false,
          partial: false,
          conflicts: [],
          warnings: [msg],
          error: msg,
        };
        setLastSyncResult(fail);
        toast({ title: "Zotero sync failed", description: msg, variant: "destructive" });
        return fail;
      } finally {
        setSyncing(false);
      }
    },
    [api, refreshStatus, toast]
  );

  const setBbtExportPath = useCallback(
    async (path: string) => {
      if (!api) throw new Error("Better BibTeX file watching requires the desktop app.");
      await api.setBbtExportPath(path);
      await refreshStatus();
    },
    [api, refreshStatus]
  );

  const startBbtWatch = useCallback(
    async (path?: string) => {
      if (!api) throw new Error("Better BibTeX watching requires the desktop app.");
      const res = await api.watchBetterBibTeX(path);
      if (!res.ok) throw new Error(res.error ?? "Failed to watch export file");
      await refreshStatus();
      toast({ title: "Watching Better BibTeX export" });
    },
    [api, refreshStatus, toast]
  );

  const stopBbtWatch = useCallback(async () => {
    if (api) await api.stopWatch();
    await refreshStatus();
  }, [api, refreshStatus]);

  const mergeIntoBibliography = useCallback(
    (localBib: string, preferIncoming = true) => {
      if (!snapshot) return null;
      const result = mergeSnapshotIntoProject(snapshot, localBib, preferIncoming);
      setLastSyncResult(result);
      if (result.partial) {
        toast({
          title: "Partial Zotero sync",
          description: result.warnings.join("; ") || "Some conflicts were kept local.",
        });
      }
      return result;
    },
    [snapshot, toast]
  );

  const useMockLibrary = useCallback(() => {
    const mock = buildMockZoteroSnapshot();
    setSnapshot(mock);
    setStatus((prev) => ({
      ...prev,
      mode: "web",
      connected: true,
      userId: "12345",
      userName: "mockuser",
      lastSyncAt: mock.syncedAt,
    }));
    toast({ title: "Mock Zotero library loaded", description: "For demo/testing" });
  }, [toast]);

  const value = useMemo<ZoteroContextValue>(
    () => ({
      available,
      status,
      snapshot,
      syncing,
      progress,
      lastSyncResult,
      refreshStatus,
      connectWeb,
      disconnect,
      syncLibrary,
      setBbtExportPath,
      startBbtWatch,
      stopBbtWatch,
      mergeIntoBibliography,
      useMockLibrary,
    }),
    [
      available,
      status,
      snapshot,
      syncing,
      progress,
      lastSyncResult,
      refreshStatus,
      connectWeb,
      disconnect,
      syncLibrary,
      setBbtExportPath,
      startBbtWatch,
      stopBbtWatch,
      mergeIntoBibliography,
      useMockLibrary,
    ]
  );

  return <ZoteroContext.Provider value={value}>{children}</ZoteroContext.Provider>;
}

export function useZotero() {
  const ctx = useContext(ZoteroContext);
  if (!ctx) throw new Error("useZotero must be used within ZoteroProvider");
  return ctx;
}
