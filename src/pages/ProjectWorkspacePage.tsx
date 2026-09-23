import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ChatMessages from "@/components/ChatMessages";
import { useChat, resolveExecutionWorkspace } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspaceFolderPicker } from "@/hooks/useWorkspaceFolderPicker";
import { ExecutionBadge } from "@/components/conversation/ExecutionBadge";
import { Plus, FolderOpen } from "lucide-react";

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

  if (!projectId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        No project selected. <Link to="/projects" className="ml-1 underline">Open projects</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Subtle project context bar (not a separate product surface). */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2 md:px-4">
        <Link to="/projects" className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">
          ← Projects
        </Link>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <FolderOpen className="h-3.5 w-3.5 text-primary" />
          {project?.title ?? "Project"}
        </span>
        <span className="hidden truncate font-mono text-[10px] text-muted-foreground md:inline">
          {workspaceRoot || "no workspace linked"}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <ExecutionBadge />
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={startConversation}>
            <Plus className="h-3.5 w-3.5" /> New conversation
          </Button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Recent conversations in this project (same model, filtered view). */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border/60 bg-muted/10 p-2 md:flex" aria-label="Project conversations">
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Conversations
          </p>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {projectChats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/projects/${projectId}/chat/${c.id}`)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                  currentChatId === c.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <span className="truncate">{c.title || "Untitled conversation"}</span>
              </button>
            ))}
            {projectChats.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">No conversations yet.</p>
            )}
          </div>
          <div className="border-t border-border/60 p-2">
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
                    onClick={() =>
                      void pick(workspaceRoot || undefined).then((p) => {
                        if (p) setWorkspaceRoot(p);
                      })
                    }
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
        </aside>

        {/* Default landing surface: the project's conversation. */}
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
                Ask anything — explanations, research, or actions like “Inspect this project and fix the
                failing tests.” Openbentt decides whether OpenCode needs to run, right here.
              </p>
            </div>
          ) : (
            <ChatMessages messages={messages} isLoading={isLoading} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectWorkspacePage;
