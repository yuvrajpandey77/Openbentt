import React, { useState } from "react";
import { Link } from "react-router-dom";
import { OpenCodePanel } from "@/components/agent/OpenCodePanel";
import { isDesktopApp } from "@/lib/isDesktopApp";

const WORKSPACE_KEY = "openbentt-agent-workspace-root";

/**
 * Desktop Agent workspace: local execution (OpenCode) + local AI gateway
 * (OmniRoute) + local voice, governed by Openbentt permissions.
 * Desktop-only; the panel itself explains when the bridge is unavailable.
 */
const AgentPage: React.FC = () => {
  const [workspaceRoot, setWorkspaceRoot] = useState(() => {
    try {
      return localStorage.getItem(WORKSPACE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const onWorkspaceRootChange = (v: string) => {
    setWorkspaceRoot(v);
    try {
      localStorage.setItem(WORKSPACE_KEY, v);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <header className="mb-4">
          <h1 className="text-lg font-semibold text-foreground">Agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isDesktopApp()
              ? "Describe a software task. Openbentt runs it locally, asks before anything sensitive, and keeps a full audit trail."
              : "Local execution is available in the Openbentt desktop app."}
          </p>
          <p className="mt-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Execution now lives inside every conversation — just ask in{" "}
            <Link to="/chat" className="font-medium text-primary hover:underline">Chat</Link>{" "}
            or a project and OpenCode runs underneath. This page remains as an advanced view.
          </p>
        </header>
        <OpenCodePanel workspaceRoot={workspaceRoot} onWorkspaceRootChange={onWorkspaceRootChange} />
      </div>
    </div>
  );
};

export default AgentPage;
