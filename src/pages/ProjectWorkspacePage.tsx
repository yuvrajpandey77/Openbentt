import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ChatMessages from "@/components/ChatMessages";
import { useChat, resolveExecutionWorkspace } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspaceFolderPicker } from "@/hooks/useWorkspaceFolderPicker";
import { ExecutionBadge } from "@/components/conversation/ExecutionBadge";
import { Plus, FolderOpen, FolderKanban, Files, BookOpen, FileStack, NotebookPen, ListTodo, MoreHorizontal, ChevronRight, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

/**
 * Project workspace: the primary context boundary.
 * Project → conversation → files/tasks/research contextually.
 * The default landing surface is the project's conversation (the
 * global composer in AppLayout stays the ONE composer).
 */
const ProjectWorkspacePage: React.FC = () => {
  const { projectId, conversationId } = useParams<{ projectId: string; conversationId?: string }>();
  const navigate = useNavigate();
  const {
    chats,
    currentChatId,
    selectChat,
    createNewChat,
    isLoading,
    activeProjectId,
    setActiveProjectId,
    setProjectWorkspace,
  } = useChat();
  const { projects } = useResearchProject();
  const { pick, picking, supported } = useWorkspaceFolderPicker();
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showFilesBrowser, setShowFilesBrowser] = useState(false);
  const [filesBrowserData, setFilesBrowserData] = useState<{ path: string; kind: string }[] | null>(null);
  const [filesBrowserLoading, setFilesBrowserLoading] = useState(false);
  const [filesBrowserError, setFilesBrowserError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const project = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  );

  // Entering a project sets the workspace context; leaving restores global.
  useEffect(() => {
    if (projectId) setActiveProjectId(projectId);
    return () => setActiveProjectId(null);
  }, [projectId, setActiveProjectId]);

  useEffect(() => {
    if (conversationId && conversationId !== currentChatId) selectChat(conversationId);
  }, [conversationId, currentChatId, selectChat]);

  useEffect(() => {
    if (projectId) setWorkspaceRoot(resolveExecutionWorkspace(projectId));
  }, [projectId]);

  const projectChats = useMemo(
    () => chats.filter((c) => c.projectId === projectId).slice(-20).reverse(),
    [chats, projectId]
  );
  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages ?? [];
  const inProject = currentChat?.projectId === projectId || (!currentChat && projectChats.length === 0);

  const startConversation = () => {
    const id = createNewChat("New conversation", projectId ?? null);
    navigate(`/projects/${projectId}/chat/${id}`);
  };

  const fetchFilesBrowser = async () => {
    const { resolveExecutionWorkspace } = await import("@/context/ChatContext");
    const { openCodeAgentApi } = await import("@/lib/agent/openCodeAgentApi");
    const workspaceRoot = resolveExecutionWorkspace(projectId);
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
  };

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  };

  const handleSelectProject = (pid: string) => {
    navigate(`/projects/${pid}`);
    setShowProjectDropdown(false);
  };

  if (!projectId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        No project selected. <Link to="/projects" className="ml-1 underline">Open projects</Link>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Project context header */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 md:px-4">
          <Link to="/projects" className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">
            ← Projects
          </Link>
          <div className="flex-1 flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  aria-expanded={showProjectDropdown}
                  aria-label="Switch project"
                >
                  <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate text-foreground font-medium text-sm">
                    {project?.title || "Project"}
                  </span>
                  <ChevronRight className={cn(
                    "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                    showProjectDropdown && "rotate-90"
                  )} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Switch project</TooltipContent>
            </Tooltip>
            {showProjectDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg bg-card border border-border py-1 shadow-lg animate-fade-in-up">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProject(p.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{p.title}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { navigate("/projects"); setShowProjectDropdown(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span>New project</span>
                </button>
              </div>
            )}
            <span className="hidden truncate font-mono text-[10px] text-muted-foreground md:inline">
              {workspaceRoot || "no workspace linked"}
            </span>
          </div>
          <span className="ml-auto flex items-center gap-2">
            <ExecutionBadge />
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={startConversation}>
              <Plus className="h-3.5 w-3.5" /> New conversation
            </Button>
          </span>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Project sidebar — matches main sidebar design */}
          <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-muted/20 md:flex" aria-label="Project workspace">
            {/* Conversations section */}
            <div className="flex shrink-0 flex-col">
              <div className="flex items-center gap-2 mb-2 px-1">
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-[12px] leading-[16px] text-muted-foreground font-medium">Conversations</span>
              </div>
              <nav className="flex shrink-0 flex-col gap-0.5 mb-4" aria-label="Project conversations">
                {projectChats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate(`/projects/${projectId}/chat/${c.id}`)}
                    className={cn(
                      "sidebar-nav-item",
                      currentChatId === c.id && "sidebar-nav-item--active"
                    )}
                  >
                    <MessageSquare className="shrink-0 h-4 w-4" strokeWidth={1.5} />
                    <span className="sidebar-nav-label truncate">{c.title || "Untitled conversation"}</span>
                  </button>
                ))}
                {projectChats.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">No conversations yet.</p>
                )}
              </nav>

              {/* Workspace files section */}
              <div className="flex shrink-0 items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <Files className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-[12px] leading-[16px] text-muted-foreground font-medium">Files</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowFilesBrowser((v) => {
                      if (!v) fetchFilesBrowser();
                      return !v;
                    });
                  }}
                  className={cn(
                    "flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground p-1 rounded",
                    showFilesBrowser && "bg-muted"
                  )}
                  aria-expanded={showFilesBrowser}
                >
                  <ChevronRight className={cn("h-3 w-3 transition-transform", showFilesBrowser && "rotate-90")} />
                  <span className="hidden md:inline">{showFilesBrowser ? "Hide" : "Show"}</span>
                </button>
              </div>
              {showFilesBrowser && (
                <div className={cn("space-y-1 overflow-y-auto max-h-56 mb-4")}>
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
                    <button type="button" onClick={fetchFilesBrowser} className="w-full text-left text-[11px] text-primary hover:underline py-2">
                      Load workspace files
                    </button>
                  )}
                </div>
              )}

              {/* Workspace folder picker */}
              <div className="border-t border-border p-2">
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  Workspace folder
                  <span className="flex gap-1">
                    <Input
                      value={workspaceRoot}
                      onChange={(e) => setWorkspaceRoot(e.target.value)}
                      placeholder="~/projects/…"
                      className="h-7 font-mono text-[11px]"
                    />
                    {supported && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 text-[11px]"
                        disabled={picking}
                        onClick={() => void pick(workspaceRoot || undefined).then((p) => { if (p) setWorkspaceRoot(p); })}
                      >
                        …
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 text-[11px]"
                      onClick={() => projectId && setProjectWorkspace(projectId, workspaceRoot)}
                    >
                      Save
                    </Button>
                  </span>
                </label>
              </div>
            </div>
          </aside>

          {/* Main conversation area */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!inProject && currentChat ? (
              <div className="shrink-0 border-b border-border/50 px-3 py-2 text-xs text-muted-foreground">
                Viewing a global conversation inside {project?.title ?? "this project"}.{" "}
                <button type="button" className="underline hover:text-foreground" onClick={startConversation}>
                  Start a project conversation
                </button>
              </div>
            ) : null}
            {messages.length === 0 && !isLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm font-medium text-foreground">
                  {project ? `Conversation in ${project.title}` : "Project conversation"}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Ask anything — explanations, research, or actions like "Inspect this project and fix the
                  failing tests." Openbentt decides whether OpenCode needs to run, right here.
                </p>
              </div>
            ) : (
              <ChatMessages messages={messages} isLoading={isLoading} />
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default ProjectWorkspacePage;

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
      <div className="flex items-center gap-2 pl-6 py-0.5 text-[11px] text-muted-foreground">
        <FileText className="h-3 w-3 shrink-0" />
        <span className="truncate">{name}</span>
      </div>
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
  const { getDesktopApi } = require("@/lib/desktopApi");
  const { toggleDir } = require("@/components/Sidebar").toggleDir; // Not accessible, we'll use a local version

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