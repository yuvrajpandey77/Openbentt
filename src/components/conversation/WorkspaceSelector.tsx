import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChat, AGENT_WORKSPACE_KEY, resolveExecutionWorkspace } from "@/context/ChatContext";
import { useWorkspaceFolderPicker } from "@/hooks/useWorkspaceFolderPicker";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { cn } from "@/lib/utils";
import { ChevronDown, FolderGit2 } from "lucide-react";

/**
 * Always-visible working-folder / project control for the unified
 * conversation. Shows which folder OpenCode will work in (global or
 * per-project override), lets the user change it inline, and links to
 * project selection. This is the permission boundary surface: execution
 * is contained to this folder.
 */
export const WorkspaceSelector: React.FC<{ className?: string }> = ({ className }) => {
  const { activeProjectId, setProjectWorkspace } = useChat();
  const { pick, picking, supported } = useWorkspaceFolderPicker();
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState("");

  useEffect(() => {
    if (open) setRoot(resolveExecutionWorkspace(activeProjectId));
  }, [open, activeProjectId]);

  if (!isDesktopApp()) return null;

  const current = resolveExecutionWorkspace(activeProjectId);

  const save = () => {
    const v = root.trim();
    if (!v) return;
    try {
      localStorage.setItem(AGENT_WORKSPACE_KEY, v);
    } catch {
      /* ignore */
    }
    if (activeProjectId) setProjectWorkspace(activeProjectId, v);
    setOpen(false);
  };

  return (
    <div className={cn("w-full", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      >
        <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0 truncate">
          {activeProjectId ? "Project workspace" : "Workspace"}:{" "}
          <span className="font-mono">{current || "not set"}</span>
        </span>
        <ChevronDown className={cn("ml-auto h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-md border border-border/60 bg-card p-2 shadow-sm">
          <label className="grid gap-1.5 text-[11px] text-muted-foreground">
            {activeProjectId
              ? "Folder for this project (overrides the default)"
              : "Default folder OpenCode works in"}
            <span className="flex gap-1.5">
              <Input
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder="/home/you/projects/my-app"
                className="h-8 font-mono text-xs"
                aria-label="Workspace folder"
              />
              {supported && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0"
                  disabled={picking}
                  onClick={() =>
                    void pick(root || undefined).then((p) => {
                      if (p) setRoot(p);
                    })
                  }
                >
                  {picking ? "…" : "Browse…"}
                </Button>
              )}
              <Button type="button" size="sm" className="h-8 shrink-0" onClick={save} disabled={!root.trim()}>
                Save
              </Button>
            </span>
          </label>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Execution stays inside this folder and pauses for approval before
            sensitive steps.{" "}
            <Link to="/projects" className="font-medium text-primary hover:underline">
              Choose a project
            </Link>{" "}
            ·{" "}
            <Link to="/agent" className="font-medium text-primary hover:underline">
              Advanced view
            </Link>
          </p>
        </div>
      )}
    </div>
  );
};
