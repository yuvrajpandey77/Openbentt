import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type NotebookViewerHandle = {
  /** Preview PDF bytes. Default `replaceSource: false` — never overwrites LaTeX files in studio. */
  loadPdfBytes: (
    bytes: ArrayBuffer,
    fileName: string,
    options?: { replaceSource?: boolean; paperId?: string }
  ) => void;
  focusSource: () => void;
  focusPreview: () => void;
  openPdfPicker: () => void;
  openTexPicker: () => void;
};

type NotebookViewerContextValue = {
  registerViewer: (handle: NotebookViewerHandle | null) => void;
  viewer: NotebookViewerHandle | null;
};

const NotebookViewerContext = createContext<NotebookViewerContextValue | null>(null);

export function NotebookViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = useState<NotebookViewerHandle | null>(null);

  const registerViewer = useCallback((handle: NotebookViewerHandle | null) => {
    setViewer(handle);
  }, []);

  const value = useMemo(
    () => ({
      registerViewer,
      viewer,
    }),
    [registerViewer, viewer]
  );

  return <NotebookViewerContext.Provider value={value}>{children}</NotebookViewerContext.Provider>;
}

export function useNotebookViewer() {
  const ctx = useContext(NotebookViewerContext);
  if (!ctx) throw new Error("useNotebookViewer requires NotebookViewerProvider");
  return ctx;
}

export function useNotebookViewerOptional() {
  return useContext(NotebookViewerContext);
}
