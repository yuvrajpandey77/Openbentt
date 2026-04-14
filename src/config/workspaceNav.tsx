import type { LucideIcon } from "lucide-react";
import { BookOpen, FlaskConical, Sigma, BarChart2, Cpu } from "lucide-react";

export interface WorkspaceNavItem {
  to: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

/** Routes shown in the sidebar under “Workspace” (same tools that were in the chat header). */
export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  {
    to: "/notebook",
    label: "Notebook",
    description: "Scratchpad, charts, send to chat",
    Icon: BookOpen,
  },
  {
    to: "/labs",
    label: "Labs",
    description: "Research experiments & prompts",
    Icon: FlaskConical,
  },
  {
    to: "/write",
    label: "LaTeX",
    description: "Math preview & export",
    Icon: Sigma,
  },
  {
    to: "/benchmark",
    label: "Benchmark",
    description: "Latency & token runs",
    Icon: BarChart2,
  },
  {
    to: "/webgpu",
    label: "WebGPU",
    description: "Browser GPU capability check",
    Icon: Cpu,
  },
];
