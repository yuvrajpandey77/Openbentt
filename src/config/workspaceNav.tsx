import type { LucideIcon } from "lucide-react";
import { BookOpen, FlaskConical, FileCode2, Gauge, Cpu } from "lucide-react";
import { isWebClient } from "@/config/platformSurface";

export interface WorkspaceNavItem {
  to: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  /** When false, hidden from sidebar and empty-state chips on web. Default true. */
  web?: boolean;
}

const ALL_WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  {
    to: "/notebook",
    label: "Notebook",
    description: "PDF, LaTeX source, compile & preview",
    Icon: BookOpen,
    web: true,
  },
  {
    to: "/labs",
    label: "Research labs",
    description: "BibTeX, citation graph, HF datasets (desktop: local GGUF hub)",
    Icon: FlaskConical,
    web: false,
  },
  {
    to: "/write",
    label: "LaTeX write",
    description: "Compose and compile LaTeX documents",
    Icon: FileCode2,
    web: false,
  },
  {
    to: "/benchmark",
    label: "Benchmark",
    description: "Compare model latency and throughput",
    Icon: Gauge,
    web: false,
  },
  {
    to: "/webgpu",
    label: "WebGPU lab",
    description: "On-device Transformers.js diagnostics",
    Icon: Cpu,
    web: false,
  },
];

/** Sidebar + welcome chips — filtered for web vs desktop. */
export function getWorkspaceNavItems(): WorkspaceNavItem[] {
  if (isWebClient()) {
    return ALL_WORKSPACE_NAV_ITEMS.filter((item) => item.web !== false);
  }
  return ALL_WORKSPACE_NAV_ITEMS;
}

/** @deprecated Use getWorkspaceNavItems() */
export const WORKSPACE_NAV_ITEMS = ALL_WORKSPACE_NAV_ITEMS;
