import type { LucideIcon } from "lucide-react";
import { BookOpen, FlaskConical, FileCode2, Gauge, Cpu } from "lucide-react";
import { isWebClient } from "@/config/platformSurface";

export type WorkspaceNavTier = "primary" | "developer";

export interface WorkspaceNavItem {
  to: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  /** When false, hidden from sidebar and empty-state chips on web. Default true. */
  web?: boolean;
  /** Primary = everyday workspace; developer = diagnostics / power tools. */
  tier?: WorkspaceNavTier;
}

const ALL_WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  {
    to: "/projects",
    label: "Projects",
    description: "LaTeX studio, PDF library, proofreading",
    Icon: BookOpen,
    web: false,
    tier: "primary",
  },
  {
    to: "/labs",
    label: "Library",
    description: "Papers, bibliography, synthesis, local GGUF (desktop)",
    Icon: FlaskConical,
    web: false,
    tier: "primary",
  },
  {
    to: "/write",
    label: "LaTeX write",
    description: "Legacy standalone LaTeX page (use Projects studio instead)",
    Icon: FileCode2,
    web: false,
    tier: "developer",
  },
  {
    to: "/benchmark",
    label: "Benchmark",
    description: "Compare model latency and throughput",
    Icon: Gauge,
    web: false,
    tier: "developer",
  },
  {
    to: "/webgpu",
    label: "WebGPU lab",
    description: "On-device Transformers.js diagnostics",
    Icon: Cpu,
    web: false,
    tier: "developer",
  },
];

function filterForPlatform(items: WorkspaceNavItem[]): WorkspaceNavItem[] {
  if (isWebClient()) {
    return items.filter((item) => item.web !== false);
  }
  return items;
}

/** Primary sidebar + welcome chips (web: empty on desktop-only items). */
export function getPrimaryWorkspaceNavItems(): WorkspaceNavItem[] {
  return filterForPlatform(ALL_WORKSPACE_NAV_ITEMS.filter((item) => item.tier !== "developer"));
}

/** Diagnostics routes — sidebar footer on desktop, hidden from chat welcome. */
export function getDeveloperWorkspaceNavItems(): WorkspaceNavItem[] {
  return filterForPlatform(ALL_WORKSPACE_NAV_ITEMS.filter((item) => item.tier === "developer"));
}

/** @deprecated Prefer getPrimaryWorkspaceNavItems on desktop. */
export function getWorkspaceNavItems(): WorkspaceNavItem[] {
  return filterForPlatform(ALL_WORKSPACE_NAV_ITEMS);
}

/** @deprecated Use getPrimaryWorkspaceNavItems() */
export const WORKSPACE_NAV_ITEMS = ALL_WORKSPACE_NAV_ITEMS;
