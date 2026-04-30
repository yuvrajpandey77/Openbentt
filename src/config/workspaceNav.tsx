import type { LucideIcon } from "lucide-react";
import { BookOpen, FlaskConical } from "lucide-react";

export interface WorkspaceNavItem {
  to: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

/** Routes under "Workspace" in the sidebar — only shipped features. */
export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  {
    to: "/notebook",
    label: "Notebook",
    description: "PDF, LaTeX source, compile & preview",
    Icon: BookOpen,
  },
  {
    to: "/labs",
    label: "Research labs",
    description: "BibTeX, citation graph, Hugging Face dataset cards",
    Icon: FlaskConical,
  },
];
