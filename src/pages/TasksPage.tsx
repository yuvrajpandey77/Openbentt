import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { hasOpenCodeDesktopApi, openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";
import { useChat } from "@/context/ChatContext";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";
import { FilterInput } from "@/components/FilterInput";
import { isDesktopApp } from "@/lib/isDesktopApp";
import type { OpenCodeTask } from "@/lib/agent/openCodeTypes";

/**
 * Phase J — Tasks view: ONE task lifecycle surfaced (research, voice,
 * computer, latex, code tasks are all Tasks). Opens details in the
 * execution inspector; the conversation stays primary.
 */
const TasksPage: React.FC = () => {
  const { setExecutionDrawerTaskId, cancelExecutionTask, executionTasks } = useChat();
  const [tasks, setTasks] = useState<OpenCodeTask[]>([]);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    if (!isDesktopApp() || !hasOpenCodeDesktopApi()) return;
    try {
      setTasks(await openCodeAgentApi.listTasks());
    } catch {
      /* degraded */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const liveStatus = (t: OpenCodeTask) => executionTasks[t.id]?.status ?? t.status;
  const q = query.trim().toLowerCase();
  const visible = q
    ? tasks.filter((t) =>
        `${t.title ?? ""} ${t.category ?? ""} ${t.mode ?? ""} ${liveStatus(t)}`.toLowerCase().includes(q)
      )
    : tasks;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6">
      <div className="flex items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Activity className="h-5 w-5 text-primary" /> Tasks
        </h1>
        <Button type="button" size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every execution — code, research, voice, computer, LaTeX — is one task lifecycle.
      </p>
      <div className="mt-3">
        <FilterInput value={query} onChange={setQuery} placeholder="Filter tasks…" className="max-w-xs" />
      </div>
      {!isDesktopApp() ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Task history lives in the desktop app. <Link to="/chat" className="underline">Back to chat</Link>
        </p>
      ) : tasks.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No tasks yet. Ask Openbentt to do something in <Link to="/chat" className="underline">chat</Link>.
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No tasks match “{query.trim()}”. <button type="button" className="underline" onClick={() => setQuery("")}>Clear filter</button>
        </p>
      ) : (
        <ul className="mt-4 space-y-2 pb-10">
          {visible.map((t) => (
            <li key={t.id} className="rounded-xl border border-border/60 bg-card p-3">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{t.title || t.id.slice(0, 8)}</p>
                <span className="shrink-0 rounded-full border border-border/60 px-2 py-px text-[10px] text-muted-foreground">
                  {liveStatus(t)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t.category} · {t.mode ?? "build"} · {t.inputSource === "voice" ? "voice" : "text"}
                {t.model ? ` · ${t.model}` : ""} · {new Date(t.updatedAt).toLocaleString()}
              </p>
              <div className="mt-2 flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setExecutionDrawerTaskId(t.id)}
                >
                  Details
                </Button>
                {["RUNNING", "WAITING_FOR_PERMISSION", "STARTING", "QUEUED"].includes(liveStatus(t)) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => void cancelExecutionTask(t.id).then(() => refresh())}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TasksPage;
