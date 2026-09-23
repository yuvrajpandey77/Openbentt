import { useCallback, useEffect, useRef, useState } from "react";
import { getDesktopApi } from "@/lib/desktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";

export interface ExternalChange {
  changed: string[];
  at: string;
}

/**
 * Phase C — safe filesystem watcher subscription. Watches the canonical
 * workspace root (debounced main-side), surfaces external changes.
 * Never overwrites editor state; the UI decides reload vs keep.
 */
export function useWorkspaceWatcher(rootPath: string | null) {
  const [externalChange, setExternalChange] = useState<ExternalChange | null>(null);
  const rootRef = useRef<string | null>(null);
  rootRef.current = rootPath;

  useEffect(() => {
    if (!isDesktopApp() || !rootPath) return;
    const api = getDesktopApi();
    if (!api?.workspaceWatch || !api?.onWorkspaceFilesChanged) return;
    let disposed = false;
    void api.workspaceWatch(rootPath).catch(() => {});
    const off = api.onWorkspaceFilesChanged((payload) => {
      if (disposed) return;
      if (payload.root !== rootRef.current) return;
      if (!payload.changed?.length) return;
      setExternalChange({ changed: payload.changed, at: payload.at });
    });
    return () => {
      disposed = true;
      off?.();
      void api.workspaceUnwatch?.(rootPath).catch(() => {});
    };
  }, [rootPath]);

  const acknowledge = useCallback(() => setExternalChange(null), []);
  return { externalChange, acknowledge };
}
