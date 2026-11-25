import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChat, AGENT_WORKSPACE_KEY, resolveExecutionWorkspace } from "@/context/ChatContext";
import { useWorkspaceFolderPicker } from "@/hooks/useWorkspaceFolderPicker";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { loadWorkspaceHistory, rememberWorkspacePath } from "@/lib/workspaceHistory";
import { cn } from "@/lib/utils";
import { ChevronDown, FolderOpen } from "lucide-react";

/**
 * Working-folder control for OpenCode execution.
 * Shows recent folders under the picker; Browse is a clear primary action.
 */
export const WorkspaceSelector: React.FC<{ className?: string }> = ({ className }) => {
  const { activeProjectId, setProjectWorkspace } = useChat();
  const { pick, picking, supported } = useWorkspaceFolderPicker();
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState("");
  const [history, setHistory] = useState<string[]>(() => loadWorkspaceHistory());

  useEffect(() => {
    if (!open) return;
    const currentPath = resolveExecutionWorkspace(activeProjectId);
    setRoot(currentPath);
    if (currentPath) setHistory(rememberWorkspacePath(currentPath));
    else setHistory(loadWorkspaceHistory());
  }, [open, activeProjectId]);

  if (!isDesktopApp()) return null;

  const current = resolveExecutionWorkspace(activeProjectId);
  const shortName = current
    ? current.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() || current
    : "";

  const applyPath = (path: string) => {
    const v = path.trim();
    if (!v) return;
    try {
      localStorage.setItem(AGENT_WORKSPACE_KEY, v);
    } catch {
      /* ignore */
    }
    if (activeProjectId) setProjectWorkspace(activeProjectId, v);
    setHistory(rememberWorkspacePath(v));
    setRoot(v);
    setOpen(false);
  };

  const browse = async () => {
    const p = await pick(root || undefined);
    if (p) {
      setRoot(p);
      applyPath(p);
    }
  };

  const recent = history.filter((p) => p !== current).slice(0, 6);

  return (
    <div className={cn("w-full", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={current || "No workspace selected"}
        className={cn(
          "inline-flex w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-left text-[11px] transition-colors",
          current
            ? "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            : "border-border bg-muted/40 text-foreground hover:bg-muted/60"
        )}
      >
        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {current ? (
            <span className="font-mono">{shortName}</span>
          ) : (
            <span className="font-medium">Set workspace</span>
          )}
        </span>
        <ChevronDown
          className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="mt-1.5 space-y-2 rounded-md border border-border/60 bg-card p-2 shadow-sm">
          <div className="flex gap-1.5">
            <Input
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              placeholder="/path/to/project"
              className="h-8 flex-1 font-mono text-xs"
              aria-label="Workspace folder"
              onKeyDown={(e) => {
                if (e.key === "Enter") applyPath(root);
              }}
            />
            {supported && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 shrink-0 border border-border bg-foreground text-background hover:bg-foreground/90"
                disabled={picking}
                onClick={() => void browse()}
              >
                {picking ? "…" : "Browse"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              onClick={() => applyPath(root)}
              disabled={!root.trim()}
            >
              Save
            </Button>
          </div>

          {(recent.length > 0 || current) && (
            <div className="space-y-0.5">
              <p className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Recent
              </p>
              {current ? (
                <div className="rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-foreground">
                  {current}
                </div>
              ) : null}
              {recent.map((path) => {
                const name = path.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() || path;
                return (
                  <button
                    key={path}
                    type="button"
                    title={path}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    onClick={() => applyPath(path)}
                  >
                    <FolderOpen className="h-3 w-3 shrink-0 opacity-70" />
                    <span className="min-w-0 truncate font-mono">{name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
