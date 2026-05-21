/** Panel IDs for the unified research workspace. */
export type ResearchPanelId =
  | "editor"
  | "citations"
  | "zotero"
  | "assistant"
  | "notes"
  | "search"
  | "revisions"
  | "papers"
  | "submit";

/** Side-rail panels (everything except the main editor). */
export type ResearchSidePanelId = Exclude<ResearchPanelId, "editor">;

export const RESEARCH_SIDE_PANEL_IDS: ResearchSidePanelId[] = [
  "citations",
  "zotero",
  "assistant",
  "notes",
  "search",
  "revisions",
  "papers",
  "submit",
];

export type WorkspaceMode = "default" | "focus" | "distraction-free";

export type WorkspacePresetId =
  | "thesis-writing"
  | "literature-review"
  | "revision-pass"
  | "submission"
  | "custom";

export interface WorkspaceLayoutState {
  preset: WorkspacePresetId;
  mode: WorkspaceMode;
  /** Ordered tool panels shown in the left rail. */
  sidePanelOrder: ResearchPanelId[];
  activeSidePanel: ResearchPanelId;
  /** Persisted left rail width hint (percent). */
  sidePanelSize: number;
}

export const PANEL_LABELS: Record<ResearchPanelId, string> = {
  editor: "Editor",
  citations: "Citations",
  zotero: "Zotero",
  assistant: "AI assist",
  notes: "Notes",
  search: "Similarity",
  revisions: "Revisions",
  papers: "Papers",
  submit: "Submit",
};

export const WORKSPACE_PRESETS: Record<
  Exclude<WorkspacePresetId, "custom">,
  { label: string; description: string; panels: ResearchPanelId[]; active: ResearchPanelId; sideSize: number }
> = {
  "thesis-writing": {
    label: "Thesis writing",
    description: "Editor + citations — minimal chrome",
    panels: ["citations", "assistant", "notes"],
    active: "citations",
    sideSize: 28,
  },
  "literature-review": {
    label: "Literature review",
    description: "Papers, search, and bibliography",
    panels: ["papers", "search", "citations", "zotero"],
    active: "papers",
    sideSize: 32,
  },
  "revision-pass": {
    label: "Revision pass",
    description: "Tracked changes and reviewer comments",
    panels: ["revisions", "assistant", "citations"],
    active: "revisions",
    sideSize: 34,
  },
  submission: {
    label: "Submission",
    description: "Venue checks and final polish",
    panels: ["submit", "citations", "revisions"],
    active: "submit",
    sideSize: 30,
  },
};

const STORAGE_KEY = "openbentt-research-workspace-layout";

export const DEFAULT_LAYOUT: WorkspaceLayoutState = {
  preset: "thesis-writing",
  mode: "default",
  sidePanelOrder: WORKSPACE_PRESETS["thesis-writing"].panels,
  activeSidePanel: "citations",
  sidePanelSize: 28,
};

export function loadWorkspaceLayout(): WorkspaceLayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<WorkspaceLayoutState>;
    return {
      ...DEFAULT_LAYOUT,
      ...parsed,
      sidePanelOrder: parsed.sidePanelOrder?.length ? parsed.sidePanelOrder : DEFAULT_LAYOUT.sidePanelOrder,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveWorkspaceLayout(state: WorkspaceLayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function applyPreset(preset: Exclude<WorkspacePresetId, "custom">): WorkspaceLayoutState {
  const p = WORKSPACE_PRESETS[preset];
  return {
    preset,
    mode: "default",
    sidePanelOrder: [...p.panels],
    activeSidePanel: p.active,
    sidePanelSize: p.sideSize,
  };
}
