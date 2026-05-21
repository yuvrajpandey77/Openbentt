import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { PaperReviewStatus, ResearchProjectData } from "@/types/researchProject";

export type ChatConnections = {
  texFileKeys: string[];
  pdfPaperId?: string;
};

export type ChatPanelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PendingConnection = {
  from: "chat-tex" | "chat-pdf";
} | null;

export type ConnectionDrag = {
  from: "chat-tex" | "chat-pdf";
  x: number;
  y: number;
  startX: number;
  startY: number;
  /** Nearest valid target within snap radius while dragging. */
  snapTargetId?: string | null;
} | null;

const CHAT_PANEL_RECT_KEY = "openbentt-notebook-chat-panel-rect";
const EXPLORER_OPEN_KEY = "openbentt-notebook-explorer-open";
const DEFAULT_CHAT_RECT: ChatPanelRect = { x: -1, y: -1, width: 420, height: 520 };

export const NOTEBOOK_EXPLORER_FLYOUT_WIDTH = 240;
export const NOTEBOOK_EXPLORER_LEFT_PX = 4;
/** Gap between toolbar row and flyout top edge. */
export const NOTEBOOK_EXPLORER_TOP_OFFSET_PX = 6;
/** Search + toggle cluster width in the studio toolbar row (two tab-sized icon pills + gap). */
export const NOTEBOOK_EXPLORER_DOCK_WIDTH = 60;
/** Left offset + flyout width — main column padding when explorer is open. */
export const NOTEBOOK_EXPLORER_INSET_PX = NOTEBOOK_EXPLORER_LEFT_PX + NOTEBOOK_EXPLORER_FLYOUT_WIDTH;
/** Extra tabs-row padding when explorer flyout is open (clears flyout beside dock). */
export const NOTEBOOK_EXPLORER_TABS_PADDING_OPEN_PX =
  NOTEBOOK_EXPLORER_INSET_PX - NOTEBOOK_EXPLORER_LEFT_PX - NOTEBOOK_EXPLORER_DOCK_WIDTH + 12;
/** Studio toolbar row height — flyout anchors below this. */
export const NOTEBOOK_STUDIO_TOOLBAR_HEIGHT_PX = 40;

function loadExplorerOpen(): boolean {
  try {
    return localStorage.getItem(EXPLORER_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export const CHAT_PANEL_EXPANDED: Pick<ChatPanelRect, "width" | "height"> = {
  width: 560,
  height: 640,
};

function loadChatPanelRect(): ChatPanelRect {
  try {
    const raw = sessionStorage.getItem(CHAT_PANEL_RECT_KEY);
    if (raw) return { ...DEFAULT_CHAT_RECT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_CHAT_RECT;
}

export type NotebookStudioFileRef =
  | { type: "draft" }
  | { type: "bib" }
  | { type: "paper"; paperId: string }
  | { type: "projectFile"; fileId: string };

export function editorFileKey(f: NotebookStudioFileRef): string {
  if (f.type === "projectFile") return `pf-${f.fileId}`;
  if (f.type === "paper") return `paper-${f.paperId}`;
  return f.type;
}

export function fileRefEquals(a: NotebookStudioFileRef, b: NotebookStudioFileRef): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "projectFile" && b.type === "projectFile") return a.fileId === b.fileId;
  if (a.type === "paper" && b.type === "paper") return a.paperId === b.paperId;
  return true;
}

export function isEditableEditorFile(f: NotebookStudioFileRef): boolean {
  return f.type === "draft" || f.type === "bib" || f.type === "projectFile";
}

export function editorFileLabel(f: NotebookStudioFileRef, project: ResearchProjectData | null): string {
  if (!project) return "file";
  if (f.type === "draft") return "main.tex";
  if (f.type === "bib") return "references.bib";
  if (f.type === "projectFile") {
    const pf = project.projectFiles?.find((p) => p.id === f.fileId);
    return pf?.path.split("/").pop() ?? pf?.path ?? "file";
  }
  if (f.type === "paper") {
    const p = project.papers.find((x) => x.id === f.paperId);
    return p?.metadata.title ?? p?.fileName ?? "PDF";
  }
  return "file";
}

type NotebookStudioContextValue = {
  /** Tree / sidebar selection (includes PDF papers). */
  activeFile: NotebookStudioFileRef;
  setActiveFile: (f: NotebookStudioFileRef) => void;
  /** File shown in the LaTeX editor pane. */
  activeEditorFile: NotebookStudioFileRef;
  setActiveEditorFile: (f: NotebookStudioFileRef) => void;
  editorTabs: NotebookStudioFileRef[];
  openEditorTab: (f: NotebookStudioFileRef) => void;
  closeEditorTab: (f: NotebookStudioFileRef) => void;
  reviewFilter: "all" | "unread" | "reviewed";
  setReviewFilter: (f: "all" | "unread" | "reviewed") => void;
  /** Registered by left rail — J/K file navigation */
  fileNav: { next: () => void; prev: () => void } | null;
  registerFileNav: (nav: { next: () => void; prev: () => void } | null) => void;
  /** PDF page state (synced from viewer) */
  pdfPage: number;
  pdfNumPages: number;
  setPdfPageInfo: (page: number, numPages: number) => void;
  activePaperId: string | null;
  setActivePaperId: (id: string | null) => void;
  /** Floating chat panel */
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;
  openChatPanel: () => void;
  chatPanelRect: ChatPanelRect;
  setChatPanelRect: (rect: ChatPanelRect | ((prev: ChatPanelRect) => ChatPanelRect)) => void;
  /** n8n-style context connections */
  chatConnections: ChatConnections;
  setChatConnection: (kind: "tex" | "pdf", value: string | undefined) => void;
  toggleChatConnection: (kind: "tex" | "pdf", value: string) => void;
  pendingConnection: PendingConnection;
  setPendingConnection: (p: PendingConnection) => void;
  connectionDrag: ConnectionDrag;
  setConnectionDrag: (d: ConnectionDrag) => void;
  registerConnectionAnchor: (id: string, el: HTMLElement | null) => void;
  getConnectionAnchorCenter: (id: string) => { x: number; y: number } | null;
  bumpConnectionLayout: () => void;
  connectionLayoutTick: number;
  /** Top-left explorer flyout — persisted; shifts main editor/preview when open. */
  explorerOpen: boolean;
  setExplorerOpen: (open: boolean) => void;
  toggleExplorer: () => void;
};

const NotebookStudioContext = createContext<NotebookStudioContextValue | null>(null);

const DEFAULT_EDITOR_TAB: NotebookStudioFileRef = { type: "draft" };

export function NotebookStudioProvider({ children }: { children: React.ReactNode }) {
  const [activeFile, setActiveFile] = useState<NotebookStudioFileRef>(DEFAULT_EDITOR_TAB);
  const [activeEditorFile, setActiveEditorFile] = useState<NotebookStudioFileRef>(DEFAULT_EDITOR_TAB);
  const [editorTabs, setEditorTabs] = useState<NotebookStudioFileRef[]>([DEFAULT_EDITOR_TAB]);
  const [reviewFilter, setReviewFilter] = useState<"all" | "unread" | "reviewed">("all");
  const [fileNav, setFileNav] = useState<{ next: () => void; prev: () => void } | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [chatPanelRect, setChatPanelRectState] = useState<ChatPanelRect>(loadChatPanelRect);
  const [chatConnections, setChatConnections] = useState<ChatConnections>({ texFileKeys: [] });
  const [pendingConnection, setPendingConnection] = useState<PendingConnection>(null);
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDrag>(null);
  const [connectionLayoutTick, setConnectionLayoutTick] = useState(0);
  const [explorerOpen, setExplorerOpenState] = useState(loadExplorerOpen);
  const anchorMapRef = useRef<Map<string, HTMLElement>>(new Map());

  const setExplorerOpen = useCallback((open: boolean) => {
    setExplorerOpenState(open);
    try {
      localStorage.setItem(EXPLORER_OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleExplorer = useCallback(() => {
    setExplorerOpenState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(EXPLORER_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const setChatPanelRect = useCallback((rect: ChatPanelRect | ((prev: ChatPanelRect) => ChatPanelRect)) => {
    setChatPanelRectState((prev) => {
      const next = typeof rect === "function" ? rect(prev) : rect;
      try {
        sessionStorage.setItem(CHAT_PANEL_RECT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const openChatPanel = useCallback(() => setChatPanelOpen(true), []);

  const setChatConnection = useCallback((kind: "tex" | "pdf", value: string | undefined) => {
    setChatConnections((c) => {
      if (kind === "tex") {
        if (!value) return { ...c, texFileKeys: [] };
        if (c.texFileKeys.includes(value)) return c;
        return { ...c, texFileKeys: [...c.texFileKeys, value] };
      }
      return { ...c, pdfPaperId: value };
    });
    setPendingConnection(null);
  }, []);

  const toggleChatConnection = useCallback((kind: "tex" | "pdf", value: string) => {
    setChatConnections((c) => {
      if (kind === "tex") {
        const has = c.texFileKeys.includes(value);
        return {
          ...c,
          texFileKeys: has ? c.texFileKeys.filter((k) => k !== value) : [...c.texFileKeys, value],
        };
      }
      if (c.pdfPaperId === value) {
        const next = { ...c };
        delete next.pdfPaperId;
        return next;
      }
      return { ...c, pdfPaperId: value };
    });
    setPendingConnection(null);
  }, []);

  const registerConnectionAnchor = useCallback((id: string, el: HTMLElement | null) => {
    if (el) anchorMapRef.current.set(id, el);
    else anchorMapRef.current.delete(id);
    setConnectionLayoutTick((n) => n + 1);
  }, []);

  const getConnectionAnchorCenter = useCallback((id: string) => {
    const el = anchorMapRef.current.get(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, []);

  const bumpConnectionLayout = useCallback(() => {
    setConnectionLayoutTick((n) => n + 1);
  }, []);

  const registerFileNav = useCallback((nav: { next: () => void; prev: () => void } | null) => {
    setFileNav(nav);
  }, []);

  const setPdfPageInfo = useCallback((page: number, numPages: number) => {
    setPdfPage(page);
    setPdfNumPages(numPages);
  }, []);

  const openEditorTab = useCallback((f: NotebookStudioFileRef) => {
    if (!isEditableEditorFile(f)) return;
    setEditorTabs((tabs) => (tabs.some((t) => fileRefEquals(t, f)) ? tabs : [...tabs, f]));
    setActiveEditorFile(f);
    setActiveFile(f);
  }, []);

  const closeEditorTab = useCallback((f: NotebookStudioFileRef) => {
    setEditorTabs((tabs) => {
      if (tabs.length <= 1) return tabs;
      const idx = tabs.findIndex((t) => fileRefEquals(t, f));
      if (idx < 0) return tabs;
      const nextTabs = tabs.filter((_, i) => i !== idx);
      const fallback = nextTabs[Math.max(0, idx - 1)] ?? nextTabs[0];
      setActiveEditorFile((cur) => (fileRefEquals(cur, f) ? fallback : cur));
      setActiveFile((cur) => (fileRefEquals(cur, f) ? fallback : cur));
      return nextTabs;
    });
  }, []);

  const value = useMemo(
    () => ({
      activeFile,
      setActiveFile,
      activeEditorFile,
      setActiveEditorFile,
      editorTabs,
      openEditorTab,
      closeEditorTab,
      reviewFilter,
      setReviewFilter,
      fileNav,
      registerFileNav,
      pdfPage,
      pdfNumPages,
      setPdfPageInfo,
      activePaperId,
      setActivePaperId,
      chatPanelOpen,
      setChatPanelOpen,
      openChatPanel,
      chatPanelRect,
      setChatPanelRect,
      chatConnections,
      setChatConnection,
      toggleChatConnection,
      pendingConnection,
      setPendingConnection,
      connectionDrag,
      setConnectionDrag,
      registerConnectionAnchor,
      getConnectionAnchorCenter,
      bumpConnectionLayout,
      connectionLayoutTick,
      explorerOpen,
      setExplorerOpen,
      toggleExplorer,
    }),
    [
      activeFile,
      activeEditorFile,
      editorTabs,
      openEditorTab,
      closeEditorTab,
      reviewFilter,
      fileNav,
      registerFileNav,
      pdfPage,
      pdfNumPages,
      setPdfPageInfo,
      activePaperId,
      chatPanelOpen,
      openChatPanel,
      chatPanelRect,
      setChatPanelRect,
      chatConnections,
      setChatConnection,
      toggleChatConnection,
      pendingConnection,
      connectionDrag,
      registerConnectionAnchor,
      getConnectionAnchorCenter,
      bumpConnectionLayout,
      connectionLayoutTick,
      explorerOpen,
      setExplorerOpen,
      toggleExplorer,
    ]
  );

  return <NotebookStudioContext.Provider value={value}>{children}</NotebookStudioContext.Provider>;
}

export function useNotebookStudio() {
  const ctx = useContext(NotebookStudioContext);
  if (!ctx) throw new Error("useNotebookStudio requires NotebookStudioProvider");
  return ctx;
}

export function useNotebookStudioOptional() {
  return useContext(NotebookStudioContext);
}

export function texContentForFileKey(project: ResearchProjectData, fileKey: string): string {
  if (fileKey === "draft") return project.draftTex;
  if (fileKey === "bib") return project.bibliography;
  if (fileKey.startsWith("pf-")) {
    return project.projectFiles?.find((p) => p.id === fileKey.slice(3))?.content ?? "";
  }
  return "";
}

export function reviewStatusLabel(status?: PaperReviewStatus): string {
  switch (status) {
    case "reviewed":
      return "Reviewed";
    case "reviewing":
      return "In progress";
    default:
      return "Unread";
  }
}
