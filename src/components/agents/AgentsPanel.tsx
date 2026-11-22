/**
 * Settings → Agents: role configs + auto-detected external agent CLIs
 * (OpenCode, Claude Code, Codex, Cursor, Aider, Gemini, …).
 */
import { useCallback, useEffect, useState } from "react";
import { Bot, Plug, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { agentRolesApi } from "@/lib/agent/agentDesktopApi";
import type { AgentRoleMeta } from "@/lib/agent/agentRoles";
import {
  detectExternalAgents,
  type DetectedExternalAgent,
} from "@/lib/agent/externalAgentsApi";
import { isDesktopApp } from "@/lib/isDesktopApp";

const PREFERRED_AGENT_KEY = "openbentt-preferred-external-agent";

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
  const [agents, setAgents] = useState<DetectedExternalAgent[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [preferredAgent, setPreferredAgent] = useState<string>(() => {
    try {
      return localStorage.getItem(PREFERRED_AGENT_KEY) ?? "opencode";
    } catch {
      return "opencode";
    }
  });

  useEffect(() => {
    agentRolesApi.list().then(setRoles).catch((e) => {
      setError(e instanceof Error ? e.message : "Failed to load agents");
    });
  }, []);

  const scanAgents = useCallback(async () => {
    if (!isDesktopApp()) {
      setAgents([]);
      setDetectMsg("External agent detection runs in the desktop app (PATH scan).");
      return;
    }
    setDetecting(true);
    setDetectMsg(null);
    try {
      const r = await detectExternalAgents();
      setAgents(r.agents);
      if (!r.ok) setDetectMsg(r.message ?? "Detection failed");
      setPreferredAgent((prev) => {
        const available = r.agents.filter((a) => a.available);
        if (available.length && !available.some((a) => a.id === prev)) {
          const next = available[0].id;
          try {
            localStorage.setItem(PREFERRED_AGENT_KEY, next);
          } catch {
            /* ignore */
          }
          return next;
        }
        return prev;
      });
    } catch (e) {
      setDetectMsg(e instanceof Error ? e.message : String(e));
      setAgents([]);
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    void scanAgents();
  }, [scanAgents]);

  function choose(id: string) {
    setActiveRole(id);
    try {
      localStorage.setItem("openbentt-agent-role", id);
    } catch {
      /* non-critical */
    }
  }

  function chooseExternal(id: string) {
    setPreferredAgent(id);
    try {
      localStorage.setItem(PREFERRED_AGENT_KEY, id);
    } catch {
      /* ignore */
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!roles) return <p className="text-sm text-muted-foreground">Loading agents…</p>;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Plug className="h-4 w-4" /> Detected AI providers
          </h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={detecting}
            onClick={() => void scanAgents()}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${detecting ? "animate-spin" : ""}`} />
            Rescan PATH
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Openbentt auto-detects coding agents on your machine — not only OpenCode. Prefer any
          available CLI; chat still respects Approvals and role tool allowlists.
        </p>
        {detectMsg && <p className="text-xs text-muted-foreground">{detectMsg}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {(agents ?? []).map((a) => {
            const active = a.id === preferredAgent && a.available;
            return (
              <Card key={a.id} className={active ? "border-primary/60" : undefined}>
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    <Bot className="h-4 w-4" />
                    <span>{a.name}</span>
                    {a.available ? (
                      <Badge variant="secondary">Detected</Badge>
                    ) : (
                      <Badge variant="outline">Not found</Badge>
                    )}
                    {active && <Badge>Preferred</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-3 pb-3 text-xs text-muted-foreground">
                  {a.version && <p className="font-mono truncate" title={a.version}>{a.version}</p>}
                  {a.path && <p className="font-mono truncate" title={a.path}>{a.path}</p>}
                  {a.available && !active && (
                    <Button size="sm" variant="outline" onClick={() => chooseExternal(a.id)}>
                      Prefer this agent
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {agents && agents.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full">
              No external agents reported. Install OpenCode, Claude Code, Codex, Cursor, Aider, or
              Gemini CLI and rescan.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Role configurations</h3>
        <p className="text-sm text-muted-foreground">
          Roles propose actions; policy and your approval decide. The model never grants itself
          permission.
        </p>
        {roles.map((r) => {
          const writes = r.toolAllowlist.filter(
            (t) =>
              t.includes(".send") ||
              t.includes("create_") ||
              t.includes("send_message") ||
              t.includes("pull_request")
          );
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
                  Tasks: {r.taskCategories.join(", ")} · Steps {r.limits.maxSteps} · Tools{" "}
                  {r.limits.maxToolCalls}
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
      </section>
    </div>
  );
}
