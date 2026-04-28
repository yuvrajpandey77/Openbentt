import type { LucideIcon } from "lucide-react";
import { BookOpen, FlaskConical, BarChart2, Cpu } from "lucide-react";

export interface WorkspaceNavItem {
  to: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  /** Shown in sidebar but not navigable (muted). LaTeX lives under Notebook — no separate route here. */
  disabled?: boolean;
}

/** Routes under “Workspace” in the sidebar. */
export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  {
    to: "/notebook",
    label: "Notebook",
    description: "PDF, LaTeX source, compile & preview",
    Icon: BookOpen,
  },
  {
    to: "/labs",
    label: "Labs",
    description: "BibTeX, datasets, WebGPU probe — local GGUF hub planned (see docs)",
    Icon: FlaskConical,
  },
  {
    to: "/benchmark",
    label: "Benchmark",
    description: "Latency runs (coming later)",
    Icon: BarChart2,
    disabled: true,
  },
  {
    to: "/webgpu",
    label: "WebGPU",
    description: "Browser GPU probe (coming later)",
    Icon: Cpu,
    disabled: true,
  },
];
