import { useCallback, useState } from "react";
import { getDesktopApi } from "@/lib/desktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";

/**
 * Native workspace folder picker (Cursor / VS Code style Browse…).
 * Falls back to manual entry when unavailable (web). The picked path is
 * always re-validated for containment by the main process on task creation.
 */
export function useWorkspaceFolderPicker() {
  const [picking, setPicking] = useState(false);
  const supported = isDesktopApp() && typeof getDesktopApi()?.pickWorkspaceFolder === "function";

  const pick = useCallback(async (currentPath?: string): Promise<string | null> => {
    const api = getDesktopApi();
    if (!api?.pickWorkspaceFolder) return null;
    setPicking(true);
    try {
      const res = await api.pickWorkspaceFolder(currentPath);
      const p = res?.path?.trim();
      return p ? p : null;
    } catch {
      return null;
    } finally {
      setPicking(false);
    }
  }, []);

  return { pick, picking, supported };
}
