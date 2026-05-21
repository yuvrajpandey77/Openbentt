import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ResearchPanelId, WorkspaceLayoutState, WorkspaceMode, WorkspacePresetId } from "@/lib/research/workspaceLayout";
import {
  applyPreset,
  DEFAULT_LAYOUT,
  loadWorkspaceLayout,
  saveWorkspaceLayout,
} from "@/lib/research/workspaceLayout";

export type SaveStatus = "saved" | "saving" | "unsaved";

export type NotebookWorkspaceActions = {
  compilePdf?: () => void | Promise<void>;
  openPdf?: () => void;
  openTex?: () => void;
  loadLastReplyToReview?: () => void;
  focusSource?: () => void;
  focusPreview?: () => void;
  insertCitation?: (key?: string) => void;
  runSynthesis?: () => void;
  openPaperPicker?: () => void;
  compareDrafts?: () => void;
};

type ResearchWorkspaceContextValue = {
  layout: WorkspaceLayoutState;
  setMode: (mode: WorkspaceMode) => void;
  cycleMode: () => void;
  applyWorkspacePreset: (preset: Exclude<WorkspacePresetId, "custom">) => void;
  setActiveSidePanel: (id: ResearchPanelId) => void;
  /** Open the floating tool drawer (studio) — use instead of setActiveSidePanel alone. */
  openResearchToolPanel: (id: Exclude<ResearchPanelId, "editor">) => void;
  closeResearchToolPanel: () => void;
  sidePanelDrawerOpen: boolean;
  toggleSidePanel: (id: ResearchPanelId) => void;
  moveSidePanel: (id: ResearchPanelId, direction: "up" | "down") => void;
  setSidePanelSize: (size: number) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  openCommandPalette: () => void;
  saveStatus: SaveStatus;
  setSaveStatus: (s: SaveStatus) => void;
  notebookActions: NotebookWorkspaceActions;
  registerNotebookActions: (actions: NotebookWorkspaceActions) => void;
  pushDraftHistory: (tex: string) => void;
  undoDraft: () => string | null;
  redoDraft: () => string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Section jump targets parsed from draft (for keyboard nav). */
  sectionHeadings: { label: string; line: number }[];
  setSectionHeadings: (h: { label: string; line: number }[]) => void;
  focusSectionLine: number | null;
  requestFocusSection: (line: number) => void;
  clearFocusSection: () => void;
  requestZoteroPanel: () => void;
};

const ResearchWorkspaceContext = createContext<ResearchWorkspaceContextValue | null>(null);

const MAX_HISTORY = 50;

export function ResearchWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [layout, setLayout] = useState<WorkspaceLayoutState>(() => loadWorkspaceLayout());
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [notebookActions, setNotebookActions] = useState<NotebookWorkspaceActions>({});
  const [sectionHeadings, setSectionHeadings] = useState<{ label: string; line: number }[]>([]);
  const [focusSectionLine, setFocusSectionLine] = useState<number | null>(null);
  const [sidePanelDrawerOpen, setSidePanelDrawerOpen] = useState(false);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  useEffect(() => {
    saveWorkspaceLayout(layout);
  }, [layout]);

  const setMode = useCallback((mode: WorkspaceMode) => {
    setLayout((prev) => ({ ...prev, mode }));
  }, []);

  const cycleMode = useCallback(() => {
    setLayout((prev) => {
      const next: WorkspaceMode =
        prev.mode === "default" ? "focus" : prev.mode === "focus" ? "distraction-free" : "default";
      return { ...prev, mode: next };
    });
  }, []);

  const applyWorkspacePreset = useCallback((preset: Exclude<WorkspacePresetId, "custom">) => {
    setLayout(applyPreset(preset));
  }, []);

  const setActiveSidePanel = useCallback((id: ResearchPanelId) => {
    setLayout((prev) => ({
      ...prev,
      activeSidePanel: id,
      preset: "custom",
      sidePanelOrder: prev.sidePanelOrder.includes(id)
        ? prev.sidePanelOrder
        : [...prev.sidePanelOrder, id],
    }));
  }, []);

  const openResearchToolPanel = useCallback((id: Exclude<ResearchPanelId, "editor">) => {
    setLayout((prev) => ({
      ...prev,
      activeSidePanel: id,
      preset: "custom",
      sidePanelOrder: prev.sidePanelOrder.includes(id) ? prev.sidePanelOrder : [...prev.sidePanelOrder, id],
    }));
    setSidePanelDrawerOpen(true);
  }, []);

  const closeResearchToolPanel = useCallback(() => {
    setSidePanelDrawerOpen(false);
  }, []);

  const toggleSidePanel = useCallback((id: ResearchPanelId) => {
    setLayout((prev) => {
      if (prev.activeSidePanel === id && prev.mode === "default") {
        return prev;
      }
      return { ...prev, activeSidePanel: id, preset: "custom" };
    });
  }, []);

  const moveSidePanel = useCallback((id: ResearchPanelId, direction: "up" | "down") => {
    setLayout((prev) => {
      const order = [...prev.sidePanelOrder];
      const idx = order.indexOf(id);
      if (idx < 0) return prev;
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= order.length) return prev;
      [order[idx], order[swap]] = [order[swap], order[idx]];
      return { ...prev, sidePanelOrder: order, preset: "custom" };
    });
  }, []);

  const setSidePanelSize = useCallback((sidePanelSize: number) => {
    setLayout((prev) => ({ ...prev, sidePanelSize, preset: "custom" }));
  }, []);

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);

  const registerNotebookActions = useCallback((actions: NotebookWorkspaceActions) => {
    setNotebookActions((prev) => ({ ...prev, ...actions }));
  }, []);

  const pushDraftHistory = useCallback((tex: string) => {
    const stack = undoStack.current;
    if (stack[stack.length - 1] === tex) return;
    stack.push(tex);
    if (stack.length > MAX_HISTORY) stack.shift();
    redoStack.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const undoDraft = useCallback(() => {
    const stack = undoStack.current;
    if (stack.length < 2) return null;
    const current = stack.pop()!;
    redoStack.current.push(current);
    setHistoryTick((t) => t + 1);
    return stack[stack.length - 1] ?? null;
  }, []);

  const redoDraft = useCallback(() => {
    const redo = redoStack.current;
    if (!redo.length) return null;
    const next = redo.pop()!;
    undoStack.current.push(next);
    setHistoryTick((t) => t + 1);
    return next;
  }, []);

  const canUndo = undoStack.current.length > 1;
  const canRedo = redoStack.current.length > 0;

  void historyTick;

  const requestFocusSection = useCallback((line: number) => setFocusSectionLine(line), []);
  const clearFocusSection = useCallback(() => setFocusSectionLine(null), []);
  const requestZoteroPanel = useCallback(() => {
    openResearchToolPanel("zotero");
  }, [openResearchToolPanel]);

  const value = useMemo(
    () => ({
      layout,
      setMode,
      cycleMode,
      applyWorkspacePreset,
      setActiveSidePanel,
      openResearchToolPanel,
      closeResearchToolPanel,
      sidePanelDrawerOpen,
      toggleSidePanel,
      moveSidePanel,
      setSidePanelSize,
      commandPaletteOpen,
      setCommandPaletteOpen,
      openCommandPalette,
      saveStatus,
      setSaveStatus,
      notebookActions,
      registerNotebookActions,
      pushDraftHistory,
      undoDraft,
      redoDraft,
      canUndo,
      canRedo,
      sectionHeadings,
      setSectionHeadings,
      focusSectionLine,
      requestFocusSection,
      clearFocusSection,
      requestZoteroPanel,
    }),
    [
      layout,
      setMode,
      cycleMode,
      applyWorkspacePreset,
      setActiveSidePanel,
      openResearchToolPanel,
      closeResearchToolPanel,
      sidePanelDrawerOpen,
      toggleSidePanel,
      moveSidePanel,
      setSidePanelSize,
      commandPaletteOpen,
      openCommandPalette,
      saveStatus,
      notebookActions,
      registerNotebookActions,
      pushDraftHistory,
      undoDraft,
      redoDraft,
      canUndo,
      canRedo,
      sectionHeadings,
      focusSectionLine,
      requestFocusSection,
      clearFocusSection,
      requestZoteroPanel,
    ]
  );

  return (
    <ResearchWorkspaceContext.Provider value={value}>{children}</ResearchWorkspaceContext.Provider>
  );
}

export function useResearchWorkspace() {
  const ctx = useContext(ResearchWorkspaceContext);
  if (!ctx) throw new Error("useResearchWorkspace must be used within ResearchWorkspaceProvider");
  return ctx;
}

export function useResearchWorkspaceOptional() {
  return useContext(ResearchWorkspaceContext);
}
