import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  DEFAULT_DOCUMENT_STYLE,
  loadDocumentStyle,
  saveDocumentStyle,
  type NotebookDocumentStyle,
} from "@/lib/notebookDocumentStyle";
import {
  loadNotebookCompileSettings,
  saveNotebookCompileSettings,
  type CompileBackend,
  type NotebookCompileSettings,
} from "@/lib/notebookCompileSettings";
import type { CitationStyle } from "@/types/researchProject";

export type NotebookPaneId = "editor" | "preview" | "files" | "chat" | "global";

export type NotebookPaneSettings = {
  editorFontSize: number;
  editorWordWrap: boolean;
  editorLineNumbers: boolean;
  editorUseCodeMirror: boolean;
  previewDefaultZoom: number;
  previewFitWidth: boolean;
  previewShowTextLayer: boolean;
  compileOnSave: boolean;
  citationStyle: CitationStyle;
};

const PANE_STORAGE_KEY = "openbentt-notebook-pane-settings";

const DEFAULT_PANE: NotebookPaneSettings = {
  editorFontSize: 13,
  editorWordWrap: true,
  editorLineNumbers: true,
  editorUseCodeMirror: true,
  previewDefaultZoom: 1.1,
  previewFitWidth: true,
  previewShowTextLayer: true,
  compileOnSave: false,
  citationStyle: "ieee",
};

function loadPaneSettings(): NotebookPaneSettings {
  try {
    const raw = localStorage.getItem(PANE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PANE };
    return { ...DEFAULT_PANE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PANE };
  }
}

type NotebookStudioSettingsContextValue = {
  pane: NotebookPaneSettings;
  compile: NotebookCompileSettings;
  documentStyle: NotebookDocumentStyle;
  activePane: NotebookPaneId;
  setActivePane: (p: NotebookPaneId) => void;
  updatePane: (patch: Partial<NotebookPaneSettings>) => void;
  updateCompile: (patch: Partial<NotebookCompileSettings>) => void;
  updateDocumentStyle: (patch: Partial<NotebookDocumentStyle>) => void;
};

const NotebookStudioSettingsContext = createContext<NotebookStudioSettingsContextValue | null>(null);

export function NotebookStudioSettingsProvider({ children }: { children: React.ReactNode }) {
  const [pane, setPane] = useState(loadPaneSettings);
  const [compile, setCompile] = useState(loadNotebookCompileSettings);
  const [documentStyle, setDocumentStyle] = useState(loadDocumentStyle);
  const [activePane, setActivePane] = useState<NotebookPaneId>("global");

  const updatePane = useCallback((patch: Partial<NotebookPaneSettings>) => {
    setPane((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(PANE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateCompile = useCallback((patch: Partial<NotebookCompileSettings>) => {
    setCompile((prev) => saveNotebookCompileSettings({ ...prev, ...patch }));
  }, []);

  const updateDocumentStyle = useCallback((patch: Partial<NotebookDocumentStyle>) => {
    setDocumentStyle((prev) => saveDocumentStyle({ ...prev, ...patch }));
  }, []);

  const value = useMemo(
    () => ({
      pane,
      compile,
      documentStyle,
      activePane,
      setActivePane,
      updatePane,
      updateCompile,
      updateDocumentStyle,
    }),
    [pane, compile, documentStyle, activePane, updatePane, updateCompile, updateDocumentStyle]
  );

  return (
    <NotebookStudioSettingsContext.Provider value={value}>{children}</NotebookStudioSettingsContext.Provider>
  );
}

export function useNotebookStudioSettings() {
  const ctx = useContext(NotebookStudioSettingsContext);
  if (!ctx) throw new Error("useNotebookStudioSettings requires provider");
  return ctx;
}

export function useNotebookStudioSettingsOptional() {
  return useContext(NotebookStudioSettingsContext);
}

export { DEFAULT_DOCUMENT_STYLE, DEFAULT_PANE };
export type { CompileBackend, NotebookCompileSettings, NotebookDocumentStyle };
