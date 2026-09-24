import React, { useState, useEffect, useCallback, useMemo } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import {
  Plus,
  Home,
  MessageSquare,
  FolderKanban,
  FolderOpen,
  Files,
  BookOpen,
  FileStack,
  NotebookPen,
  ListTodo,
  FlaskConical,
  ServerCog,
  Settings,
  Menu,
  Search,
  Bot,
  Mic,
  Cpu,
  GitBranch,
  Plug,
  Stethoscope,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FolderTree,
  FileText,
  ChevronUp,
  User,
  LogOut,
  HelpCircle,
  Pin,
  PinOff,
  MoreHorizontal,
  Image,
  Calendar,
  Zap,
  Compass,
  ChevronLeft,
  X,
  Activity,
  Terminal,
  Brain,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { AccountMenu } from "@/components/AccountMenu";
import { LocalAIStatus } from "@/components/LocalAIStatus";
import { getDesktopApi } from "@/lib/desktopApi";
import { resolveExecutionWorkspace } from "@/context/ChatContext";
import { openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";
import { Tabs, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Right Sidebar — Files, Activity, Tools, Settings
 * Opens via Cmd+J or header button
 */

interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const RightSidebar: React.FC<RightSidebarProps> = ({ isOpen, onClose }) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    chats, 
    currentChatId, 
    activeProjectId 
  } = useChat();
  const { projects: researchProjects } = useResearchProject();

  const [showFilesBrowser, setShowFilesBrowser] = useState(false);
  const [filesBrowserData, setFilesBrowserData] = useState<{ path: string; kind: string }[] | null>(null);
  const [filesBrowserLoading, setFilesBrowserLoading] = useState(false);
  const [filesBrowserError, setFilesBrowserError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"files" | "activity" | "tools" | "settings">("files");
  const [filesBrowserDataRef, setFilesBrowserDataRef] = useState<{ path: string; kind: string }[] | null>(null);

  const fetchFilesBrowser = useCallback(async () => {
    const workspaceRoot = resolveExecutionWorkspace(activeProjectId);
    let root = workspaceRoot;
    if (!root) {
      try {
        const res = await openCodeAgentApi.defaultWorkspace();
        root = res?.path;
      } catch {
        root = "";
      }
    }
    if (!root) {
      setFilesBrowserError("No workspace folder selected");
      return;
    }
    setFilesBrowserLoading(true);
    setFilesBrowserError(null);
    try {
      const api = getDesktopApi();
      if (!api?.workspaceList) {
        setFilesBrowserError("File listing not available");
        return;
      }
      const entries = await api.workspaceList(root, ".", 2);
      setFilesBrowserData(entries);
    } catch (e) {
      setFilesBrowserError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setFilesBrowserLoading(false);
    }
  }, [activeProjectId]);

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-[var(--z-sidebar)] flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "bg-background border-l border-border",
          isOpen ? "w-[320px] translate-x-0" : "w-0 translate-x-full",
          isMobile ? "w-full" : ""
        )}
        aria-label="Right sidebar"
      >
        {!isMobile && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent" onClick={onClose} />
        )}
        
        <div className={cn("flex h-full flex-col", "px-3")}>
          {/* HEADER */}
          <div className="flex shrink-0 items-center justify-between gap-2 py-3 px-1 h-[52px]">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="flex gap-1" role="tablist" aria-label="Right sidebar tabs">
                <button
                  role="tab"
                  aria-selected={activeTab === "files"}
                  onClick={() => setActiveTab("files")}
                  className={cn(
                    "px-2 py-1.5 text-[12px] leading-[16px] rounded-lg transition-colors",
                    activeTab === "files"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Files className="h-4 w-4 mr-1" /> Files
                </button>
                <button
                  role="tab"
                  aria-selected={activeTab === "activity"}
                  onClick={() => setActiveTab("activity")}
                  className={cn(
                    "px-2 py-1.5 text-[12px] leading-[16px] rounded-lg transition-colors",
                    activeTab === "activity"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Activity className="h-4 w-4 mr-1" /> Activity
                </button>
                <button
                  role="tab"
                  aria-selected={activeTab === "tools"}
                  onClick={() => setActiveTab("tools")}
                  className={cn(
                    "px-2 py-1.5 text-[12px] leading-[16px] rounded-lg transition-colors",
                    activeTab === "tools"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Terminal className="h-4 w-4 mr-1" /> Tools
                </button>
                <button
                  role="tab"
                  aria-selected={activeTab === "settings"}
                  onClick={() => setActiveTab("settings")}
                  className={cn(
                    "px-2 py-1.5 text-[12px] leading-[16px] rounded-lg transition-colors",
                    activeTab === "settings"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Settings className="h-4 w-4 mr-1" /> Settings
                </button>
              </div>
            </div>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onClose}
                  className="sidebar-nav-item p-1.5 rounded-lg"
                  aria-label="Close sidebar"
                >
                  <X className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Close</TooltipContent>
            </Tooltip>
          </div>

          {/* CONTENT */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hide">
            <FeatureErrorBoundary feature="right-sidebar">
              
              {/* FILES TAB */}
              {activeTab === "files" && (
                <>
                  <div className="flex shrink-0 items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-[12px] leading-[16px] text-muted-foreground font-medium">Files</span>
                    </div>
                  </div>
                  {showFilesBrowser ? (
                    <div className={cn("space-y-1 overflow-y-auto max-h-[calc(100vh-200px)]", "pr-1")}>
                      {filesBrowserLoading ? (
                        <div className="flex items-center justify-center py-4 text-[11px] text-muted-foreground">
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                          Loading files…
                        </div>
                      ) : filesBrowserError ? (
                        <div className="flex flex-col items-center gap-1.5 py-4 text-[11px] text-muted-foreground">
                          <p>{filesBrowserError}</p>
                          <button type="button" onClick={fetchFilesBrowser} className="text-primary hover:underline text-[10px]">Retry</button>
                        </div>
                      ) : filesBrowserData ? (
                        <>
                          {filesBrowserData.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground/70 py-2">Empty folder</p>
                          ) : (
                            filesBrowserData.map((entry) => (
                              <FileBrowserEntry
                                key={entry.path}
                                entry={entry}
                                expandedDirs={expandedDirs}
                                onToggleDir={toggleDir}
                                isMobile={false}
                              />
                            ))
                          )}
                        </>
                      ) : (
                        <button type="button" onClick={fetchFilesBrowser} className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground py-2">
                          Load workspace files
                        </button>
                      )}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowFilesBrowser((v) => {
                      if (!v) fetchFilesBrowser();
                      return !v;
                    })}
                    className={cn(
                      "w-full flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground p-1 rounded mb-4",
                      showFilesBrowser && "bg-muted"
                    )}
                    aria-expanded={showFilesBrowser}
                  >
                    <ChevronRight className={cn("h-3 w-3 transition-transform", showFilesBrowser && "rotate-90")} />
                    <span>{showFilesBrowser ? "Hide files" : "Show files"}</span>
                  </button>
                </>
              )}

              {/* ACTIVITY TAB */}
              {activeTab === "activity" && (
                <div className="space-y-2">
                  <div className="text-[11px] text-muted-foreground font-medium px-1">Recent Activity</div>
                  <nav className="flex flex-col gap-1" aria-label="Activity">
                    {[
                      { icon: Brain, label: "AI Research", to: "/labs" },
                      { icon: Terminal, label: "Terminal", to: "/terminal" },
                      { icon: Globe, label: "Web Search", to: "/search" },
                      { icon: FileStack, label: "Documents", to: "/documents" },
                      { icon: NotebookPen, label: "Editor", to: "/notebook" },
                    ].map((item) => (
                      <NavLink
                        key={item.id}
                        to={item.to}
                        onClick={onClose}
                        className={cn(
                          "sidebar-nav-item",
                          location.pathname === item.to && "sidebar-nav-item--active"
                        )}
                      >
                        <item.icon className="shrink-0 h-4 w-4" strokeWidth={1.5} />
                        <span className="sidebar-nav-label truncate">{item.label}</span>
                      </NavLink>
                    ))}
                  </nav>
                </div>
              )}

              {/* TOOLS TAB */}
              {activeTab === "tools" && (
                <div className="space-y-2">
                  <div className="text-[11px] text-muted-foreground font-medium px-1">Tools</div>
                  <nav className="flex flex-col gap-1" aria-label="Tools">
                    {[
                      { icon: Bot, label: "Computer Use", to: "/diagnostics" },
                      { icon: Cpu, label: "Models", to: "/settings" },
                      { icon: GitBranch, label: "Git", to: "/files" },
                      { icon: Plug, label: "Integrations", to: "/setup" },
                      { icon: FlaskConical, label: "Developer", to: "/benchmark" },
                      { icon: ServerCog, label: "Providers", to: "/setup" },
                      { icon: Stethoscope, label: "Diagnostics", to: "/diagnostics" },
                    ].map((item) => (
                      <NavLink
                        key={item.id}
                        to={item.to}
                        onClick={onClose}
                        className={cn(
                          "sidebar-nav-item",
                          location.pathname === item.to && "sidebar-nav-item--active"
                        )}
                      >
                        <item.icon className="shrink-0 h-4 w-4" strokeWidth={1.5} />
                        <span className="sidebar-nav-label truncate">{item.label}</span>
                      </NavLink>
                    ))}
                  </nav>
                </div>
              )}

              {/* SETTINGS TAB */}
              {activeTab === "settings" && (
                <div className="space-y-2">
                  <div className="text-[11px] text-muted-foreground font-medium px-1">Settings</div>
                  <nav className="flex flex-col gap-1" aria-label="Settings">
                    {[
                      { icon: Settings, label: "Settings", to: "/settings" },
                      { icon: HelpCircle, label: "Help & Docs", to: "/help" },
                      { icon: User, label: "Account", to: "/account" },
                    ].map((item) => (
                      <NavLink
                        key={item.id}
                        to={item.to}
                        onClick={onClose}
                        className={cn(
                          "sidebar-nav-item",
                          location.pathname === item.to && "sidebar-nav-item--active"
                        )}
                      >
                        <item.icon className="shrink-0 h-4 w-4" strokeWidth={1.5} />
                        <span className="sidebar-nav-label truncate">{item.label}</span>
                      </NavLink>
                    ))}
                  </nav>
                </div>
              )}

            </FeatureErrorBoundary>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
};

export default RightSidebar;

// File browser entry component
function FileBrowserEntry({
  entry,
  expandedDirs,
  onToggleDir,
}: {
  entry: { path: string; kind: string };
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const isDir = entry.kind === "directory";
  const isExpanded = expandedDirs.has(entry.path);
  const name = entry.path.split("/").pop() || entry.path;

  if (!isDir) {
    return (
      <button
        type="button"
        onClick={() => getDesktopApi()?.openPath?.(entry.path)}
        className="flex items-center gap-2 pl-6 py-0.5 text-left text-[11px] text-muted-foreground hover:text-foreground rounded w-full"
        title={`Open ${name}`}
      >
        <FileText className="h-3 w-3 shrink-0" />
        <span className="truncate">{name}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => onToggleDir(entry.path)}
        className="flex items-center gap-2 pl-4 py-0.5 text-left text-[11px] text-muted-foreground hover:text-foreground rounded"
        aria-expanded={isExpanded}
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", isExpanded && "rotate-90")} />
        <FolderTree className="h-3 w-3 shrink-0" />
        <span className="truncate">{name}</span>
      </button>
      {isExpanded && (
        <div className="pl-6">
          <LoadDirContents path={entry.path} expandedDirs={expandedDirs} onToggleDir={toggleDir} />
        </div>
      )}
    </div>
  );
}

function LoadDirContents({
  path: dirPath,
  expandedDirs,
  onToggleDir,
}: {
  path: string;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const [entries, setEntries] = useState<{ path: string; kind: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDesktopApi()?.workspaceList?.(dirPath, ".", 1).then((res) => {
      if (!cancelled) {
        setEntries(res);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setEntries([]);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [dirPath]);

  if (loading) {
    return <div className="flex items-center gap-2 pl-6 py-1 text-[11px] text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" /> Loading…</div>;
  }
  if (!entries || entries.length === 0) {
    return <div className="pl-6 py-1 text-[11px] text-muted-foreground/70">Empty</div>;
  }
  return (
    <>
      {entries.map((entry) => (
        <FileBrowserEntry
          key={entry.path}
          entry={entry}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
        />
      ))}
    </>
  );
}