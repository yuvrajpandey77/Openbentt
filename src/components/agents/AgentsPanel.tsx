/**
 * Phase 8 — Settings → Agents: role configurations over the shared runtime.
 * Shows name, sources, tools, permissions, risk, limits, status.
 */
import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { agentRolesApi } from "@/lib/agent/agentDesktopApi";
import type { AgentRoleMeta } from "@/lib/agent/agentRoles";

function accessBadge(level: AgentRoleMeta["accessLevel"]) {
  if (level === "read-only") return <Badge variant="secondary">Read-only</Badge>;
  if (level === "read-draft") return <Badge variant="outline">Read + drafts</Badge>;
  return <Badge variant="outline">Read + approved actions</Badge>;
}

export function AgentsPanel() {
  const [roles, setRoles] = useState<AgentRoleMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<string>(() => {
    try {
      return localStorage.getItem("openbentt-agent-role") ?? "research-assistant";
    } catch {
      return "research-assistant";
    }
  });

  useEffect(() => {
    agentRolesApi.list().then(setRoles).catch((e) => {
      setError(e instanceof Error ? e.message : "Failed to load agents");
    });
  }, []);

  function choose(id: string) {
    setActiveRole(id);
    try {
      localStorage.setItem("openbentt-agent-role", id);
    } catch {
      /* non-critical */
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!roles) return <p className="text-sm text-muted-foreground">Loading agents…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Role configurations over one controlled runtime. Roles can propose actions;
        policy and your approval decide. The model never grants itself permission.
      </p>
      {roles.map((r) => {
        const writes = r.toolAllowlist.filter((t) => t.includes(".send") || t.includes("create_") || t.includes("send_message") || t.includes("pull_request") || t.includes("create_"));
        const isActive = r.id === activeRole;
        return (
          <Card key={r.id} className={isActive ? "border-primary/60" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <Bot className="h-4 w-4" />
                <span>{r.name}</span>
                {accessBadge(r.accessLevel)}
                {isActive && <Badge>Active in chat</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">{r.description}</p>
              <p>
                <span className="text-muted-foreground">{r.toolAllowlist.length} tools · </span>
                <span className="text-muted-foreground">Sources: </span>
                {r.suggestedConnectors.join(", ")}
              </p>
              <p className="text-muted-foreground">
                Tasks: {r.taskCategories.join(", ")} · Steps {r.limits.maxSteps} · Tools {r.limits.maxToolCalls}
                {writes.length > 0 && <> · Proposes: {writes.join(", ")}</>}
              </p>
              {!isActive && (
                <Button size="sm" variant="outline" onClick={() => choose(r.id)}>
                  Use in chat
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
