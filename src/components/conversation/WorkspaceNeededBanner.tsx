import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useChat, AGENT_WORKSPACE_KEY, resolveExecutionWorkspace } from "@/context/ChatContext";
import { useWorkspaceFolderPicker } from "@/hooks/useWorkspaceFolderPicker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Contextual workspace prompt: shown inline when an execution task
 * needs files but no workspace is selected. Never a technical error,
 * never a redirect to Settings.
 */
export const WorkspaceNeededBanner: React.FC = () => {
  const { workspaceNeeded, setWorkspaceNeeded, activeProjectId, setProjectWorkspace } = useChat();
  const { pick, picking, supported } = useWorkspaceFolderPicker();
  const [root, setRoot] = useState(() => resolveExecutionWorkspace(activeProjectId));

  if (!workspaceNeeded) return null;

  const save = () => {
    const v = root.trim();
    if (!v) return;
    try {
      localStorage.setItem(AGENT_WORKSPACE_KEY, v);
    } catch {
      /* ignore */
    }
    if (activeProjectId) setProjectWorkspace(activeProjectId, v);
    setWorkspaceNeeded(false);
  };

  return (
    <Alert variant="default" className="border-primary/40 bg-primary/5">
      <AlertTitle className="text-sm">This task needs a workspace</AlertTitle>
      <AlertDescription className="text-xs">
        <span className="block text-muted-foreground">
          Pick a project folder so OpenCode can work with files — right here, no setup maze.
        </span>
        <span className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="/home/you/projects/my-app"
            className="h-8 font-mono text-xs"
            aria-label="Workspace folder"
          />
          <span className="flex shrink-0 gap-2">
            {supported && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
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
            <Button type="button" size="sm" className="h-8" onClick={save} disabled={!root.trim()}>
              Use folder
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8" asChild>
              <Link to="/projects">Choose project</Link>
            </Button>
          </span>
        </span>
      </AlertDescription>
    </Alert>
  );
};
