import React, { useState, useEffect, useCallback } from "react";
import { useChat, resolveExecutionWorkspace } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import {
  FolderTree,
  FileText,
  ChevronRight,
  RefreshCw,
  X,
  Activity,
  FolderOpen,
  ListTodo,
  PanelLeft,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { getDesktopApi } from "@/lib/desktopApi";
import { openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";
import { DESKTOP_CHROME_TOP_OFFSET_CLASS, RIGHT_SIDEBAR_WIDTH_PX } from "@/lib/sidebarLayout";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { PermissionPill } from "@/components/conversation/PermissionPill";
import { ComposerRuntimePicker } from "@/components/composer/ComposerRuntimePicker";

type TabId = "files" | "activity" | "more";

interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onExpandLeftSidebar?: () => void;
  leftSidebarCollapsed?: boolean;
}

type FsEntry = { path: string; kind: string };

function isDirectory(kind: string): boolean {
  return kind === "dir" || kind === "directory";
}

const RightSidebar: React.FC<RightSidebarProps> = ({
  isOpen,
  onClose,
  onExpandLeftSidebar,
  leftSidebarCollapsed,
}) => {
  const { activeProjectId, executionTasks, executionMode, setExecutionMode } = useChat();
  const { project } = useResearchProject();
  const [activeTab, setActiveTab] = useState<TabId>("more");
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [root, setRoot] = useState<string>("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let workspaceRoot = resolveExecutionWorkspace(activeProjectId);
      if (!workspaceRoot) {
        try {
          const res = await openCodeAgentApi.defaultWorkspace();
          workspaceRoot = res?.path ?? "";
        } catch {
          workspaceRoot = "";
        }
      }
      if (!workspaceRoot) {
        setError("No workspace folder linked. Open a project or set a folder in Agent setup.");
        setEntries(null);
        setRoot("");
        return;
      }
      setRoot(workspaceRoot);
      const api = getDesktopApi();
      if (!api?.workspaceList) {
        setError("File listing needs the desktop app.");
        setEntries(null);
        return;
      }
      const list = await api.workspaceList(workspaceRoot, ".", 2);
      setEntries(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files");
      setEntries(null);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (!isOpen || activeTab !== "files") return;
    void loadFiles();
  }, [isOpen, activeTab, loadFiles]);

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const recentTasks = Object.values(executionTasks ?? {})
    .slice()
    .reverse()
    .slice(0, 12);

  if (!isOpen) return null;

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "fixed bottom-0 right-0 z-[var(--z-sidebar)] flex flex-col border-l border-border bg-background",
          isDesktopApp() ? DESKTOP_CHROME_TOP_OFFSET_CLASS : "top-0"
        )}
        style={{ width: RIGHT_SIDEBAR_WIDTH_PX }}
        aria-label="Inspector"
      >
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 px-2">
          {(
            [
              { id: "more" as const, label: "Controls", icon: Settings2 },
              { id: "files" as const, label: "Files", icon: FolderTree },
              { id: "activity" as const, label: "Activity", icon: Activity },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8 cursor-pointer"
            onClick={onClose}
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <FeatureErrorBoundary feature="right-sidebar">
            {activeTab === "more" && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Session controls</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Agent, approvals, feedback, and layout — opened from the center status pill.
                  </p>
                </div>

                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Agent runtime
                  </p>
                  <ComposerRuntimePicker />
                </div>

                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Mode
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { id: "chat" as const, label: "Chat" },
                      { id: "plan" as const, label: "Plan" },
                      { id: "build" as const, label: "Build" },
                      { id: "task" as const, label: "Task" },
                    ]).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setExecutionMode(m.id)}
                        className={cn(
                          "rounded-lg border px-2 py-1.5 text-xs transition-colors",
                          executionMode === m.id
                            ? "border-primary/40 bg-primary/10 font-medium text-foreground"
                            : "border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Approvals
                  </p>
                  <PermissionPill />
                  <p className="text-[11px] text-muted-foreground">
                    When the agent needs permission or an answer, review it here or from the task drawer.
                  </p>
                </div>

                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Layout
                  </p>
                  {leftSidebarCollapsed && onExpandLeftSidebar ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-full cursor-pointer justify-start gap-2 text-xs"
                      onClick={onExpandLeftSidebar}
                    >
                      <PanelLeft className="h-3.5 w-3.5" />
                      Show left sidebar
                    </Button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Left sidebar is visible.</p>
                  )}
                </div>

                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Share & feedback
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <ShareLinkButton />
                    <FeedbackDialog />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "files" && (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {project?.title?.trim() || "Workspace files"}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={root}>
                      {root || "No folder"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 cursor-pointer gap-1 text-xs"
                    onClick={() => void loadFiles()}
                    disabled={loading}
                  >
                    <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>

                {loading ? (
                  <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : error ? (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                    <p>{error}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 cursor-pointer"
                      onClick={() => void loadFiles()}
                    >
                      Retry
                    </Button>
                  </div>
                ) : !entries || entries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">
                    <FolderOpen className="mx-auto mb-2 h-5 w-5 opacity-60" />
                    Empty folder
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {entries.map((entry) => (
                      <FileBrowserEntry
                        key={entry.path}
                        entry={entry}
                        workspaceRoot={root}
                        expandedDirs={expandedDirs}
                        onToggleDir={toggleDir}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "activity" && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Recent agent activity</p>
                {recentTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">
                    <ListTodo className="mx-auto mb-2 h-5 w-5 opacity-60" />
                    No tasks yet. Ask the agent to do something in chat.
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {recentTasks.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs"
                      >
                        <p className="font-medium text-foreground">{t.status}</p>
                        <p className="mt-0.5 truncate text-muted-foreground">
                          {t.title || t.id}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </FeatureErrorBoundary>
        </div>
      </aside>
    </TooltipProvider>
  );
};

export default RightSidebar;

function FileBrowserEntry({
  entry,
  workspaceRoot,
  expandedDirs,
  onToggleDir,
}: {
  entry: FsEntry;
  workspaceRoot: string;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const isDir = isDirectory(entry.kind);
  const isExpanded = expandedDirs.has(entry.path);
  const name = entry.path.split("/").pop() || entry.path;
  const absolute = entry.path.startsWith("/")
    ? entry.path
    : `${workspaceRoot.replace(/\/$/, "")}/${entry.path.replace(/^\.\//, "")}`;

  if (!isDir) {
    return (
      <button
        type="button"
        onClick={() => void getDesktopApi()?.openPath?.(absolute)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        title={`Open ${name}`}
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{name}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => onToggleDir(entry.path)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-expanded={isExpanded}
      >
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isExpanded && "rotate-90")} />
        <FolderTree className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-medium">{name}</span>
      </button>
      {isExpanded && (
        <div className="ml-3 border-l border-border/40 pl-2">
          <LoadDirContents
            dirPath={absolute}
            workspaceRoot={workspaceRoot}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
          />
        </div>
      )}
    </div>
  );
}

function LoadDirContents({
  dirPath,
  workspaceRoot,
  expandedDirs,
  onToggleDir,
}: {
  dirPath: string;
  workspaceRoot: string;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDesktopApi()
      ?.workspaceList?.(dirPath, ".", 1)
      .then((res) => {
        if (!cancelled) {
          setEntries(Array.isArray(res) ? res : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dirPath]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
        <RefreshCw className="h-3 w-3 animate-spin" /> Loading…
      </div>
    );
  }
  if (!entries || entries.length === 0) {
    return <div className="py-1 text-[11px] text-muted-foreground/70">Empty</div>;
  }
  return (
    <>
      {entries.map((entry) => (
        <FileBrowserEntry
          key={entry.path}
          entry={entry}
          workspaceRoot={workspaceRoot}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
        />
      ))}
    </>
  );
}
