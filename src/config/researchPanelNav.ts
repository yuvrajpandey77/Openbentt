import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  FileText,
  GitCompare,
  Quote,
  Search,
  Send,
  Sparkles,
  StickyNote,
} from "lucide-react";
import {
  PANEL_LABELS,
  RESEARCH_SIDE_PANEL_IDS,
  type ResearchSidePanelId,
} from "@/lib/research/workspaceLayout";

export interface ResearchPanelNavItem {
  id: ResearchSidePanelId;
  label: string;
  description: string;
  Icon: LucideIcon;
}

const PANEL_DESCRIPTIONS: Record<ResearchSidePanelId, string> = {
  citations: "Bibliography keys and in-text cites",
  zotero: "Sync and import from Zotero",
  assistant: "AI writing help for the draft",
  notes: "Scratch notes tied to the project",
  search: "Similar passages across the corpus",
  revisions: "Review comments and tracked edits",
  papers: "Project PDF library",
  submit: "Venue checks before submission",
};

const PANEL_ICONS: Record<ResearchSidePanelId, LucideIcon> = {
  citations: Quote,
  zotero: BookMarked,
  assistant: Sparkles,
  notes: StickyNote,
  search: Search,
  revisions: GitCompare,
  papers: FileText,
  submit: Send,
};

export const RESEARCH_PANEL_NAV: ResearchPanelNavItem[] = RESEARCH_SIDE_PANEL_IDS.map((id) => ({
  id,
  label: PANEL_LABELS[id],
  description: PANEL_DESCRIPTIONS[id],
  Icon: PANEL_ICONS[id],
}));

export function researchPanelUrl(id: ResearchSidePanelId): string {
  return `/notebook?panel=${id}`;
}

export function parseResearchPanelFromSearch(search: string): ResearchSidePanelId | null {
  const raw = new URLSearchParams(search).get("panel");
  if (!raw) return null;
  return RESEARCH_SIDE_PANEL_IDS.includes(raw as ResearchSidePanelId)
    ? (raw as ResearchSidePanelId)
    : null;
}
