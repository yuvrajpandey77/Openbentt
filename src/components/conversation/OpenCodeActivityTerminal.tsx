import React, { useEffect, useRef } from "react";
import { useChat } from "@/context/ChatContext";
import { cn } from "@/lib/utils";
import { Terminal, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import type { OpenCodeAgentEvent } from "@/lib/agent/openCodeTypes";
import { ChatThinkingIndicator } from "@/components/ChatThinkingIndicator";

const LIVE_LOGS_KEY = "openbentt-show-agent-logs";

function readShowLogsDefault(): boolean {
  try {
    const v = localStorage.getItem(LIVE_LOGS_KEY);
    if (v === "0" || v === "false") return false;
    if (v === "1" || v === "true") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function persistShowLogs(show: boolean) {
  try {
    localStorage.setItem(LIVE_LOGS_KEY, show ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export const OpenCodeActivityTerminal: React.FC<{
  taskId: string | null;
  /** When true, show a Thinking shimmer above the log while waiting for first events. */
  waiting?: boolean;
  /** Force logs visible (e.g. after ask failure). */
  forceShowLogs?: boolean;
  className?: string;
}> = ({ taskId, waiting = false, forceShowLogs = false, className }) => {
  const { executionEvents } = useChat();
  const [showLogs, setShowLogs] = React.useState(readShowLogsDefault);
  const [expanded, setExpanded] = React.useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const events = taskId ? (executionEvents[taskId] ?? []) : [];
  const logsVisible = forceShowLogs || showLogs;

  useEffect(() => {
    if (forceShowLogs) {
      setShowLogs(true);
      setExpanded(true);
      persistShowLogs(true);
    }
  }, [forceShowLogs]);

  useEffect(() => {
    if (logsVisible && expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, logsVisible, expanded]);

  if (!taskId) return null;

  const latest = events.length > 0 ? formatPayload(events[events.length - 1]?.payload) : "";
  const title =
    events.length > 0
      ? `Agent activity (${events.length})`
      : "Agent activity";

  return (
    <div
      className={cn(
        "mt-2 border border-border/60 bg-[#0d1117] rounded-lg text-xs font-mono overflow-hidden transition-all",
        className
      )}
    >
      <div className="flex w-full items-center gap-1 px-2 py-1.5 bg-[#161b22]">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 hover:bg-[#1c2128] transition-colors text-left"
          onClick={() => setExpanded((o) => !o)}
          aria-label={expanded ? "Collapse activity" : "Expand activity"}
        >
          <Terminal size={12} className="text-muted-foreground shrink-0" />
          <span className="min-w-0 truncate text-[11px] text-muted-foreground font-sans">
            {title}
            {!expanded && latest ? (
              <span className="opacity-70"> · {latest.slice(0, 80)}</span>
            ) : null}
          </span>
          {expanded ? (
            <ChevronUp size={14} className="shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
          )}
        </button>
        <button
          type="button"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-[#1c2128] hover:text-foreground transition-colors"
          onClick={() => {
            setShowLogs((prev) => {
              const next = !prev;
              persistShowLogs(next);
              if (next) setExpanded(true);
              return next;
            });
          }}
          aria-label={logsVisible ? "Hide agent logs" : "Show agent logs"}
          title={logsVisible ? "Hide logs" : "Show logs"}
        >
          {logsVisible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
      </div>
      {/* Always show Thinking while waiting — even if the user hid the log panel. */}
      {waiting && events.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-2">
          <ChatThinkingIndicator compact />
          <span className="text-muted-foreground/70 font-sans text-[11px]">Working…</span>
        </div>
      ) : null}
      {logsVisible && expanded && (
        <div ref={scrollRef} className="max-h-48 overflow-y-auto scrollbar-hide p-2 space-y-0.5">
          {events.length === 0 && !waiting ? (
            <div className="flex items-center gap-2 py-1">
              <ChatThinkingIndicator compact />
              <span className="text-muted-foreground/60 font-sans text-[11px]">
                Waiting for agent output…
              </span>
            </div>
          ) : (
            events.map((evt, i) => (
              <div
                key={evt.eventId ?? i}
                className={cn(
                  "flex gap-2 py-0.5",
                  evt.type.startsWith("agent.error") || evt.type.startsWith("agent.failed") || evt.type === "agent.tool.failed"
                    ? "text-red-400"
                    : evt.type.startsWith("agent.completed") ||
                        evt.type.startsWith("agent.file.changed") ||
                        evt.type === "agent.message.completed"
                      ? "text-emerald-400"
                      : "text-muted-foreground"
                )}
              >
                <span className="shrink-0 text-[10px] opacity-60">
                  {new Date(evt.timestamp).toLocaleTimeString([], {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="shrink-0 text-[10px] opacity-40">
                  [{shortType(evt.type)}]
                </span>
                <span className="break-all">{formatEventLine(evt)}</span>
              </div>
            ))
          )}
        </div>
      )}
      {!logsVisible && !waiting && (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground/70 font-sans">
          Logs hidden — click the eye to show what the agent is doing.
        </div>
      )}
    </div>
  );
};

function shortType(type: string): string {
  return type.replace(/^agent\./, "");
}

function formatEventLine(evt: OpenCodeAgentEvent): string {
  return formatPayload(evt.payload) || shortType(evt.type);
}

function formatPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const parts: string[] = [];
    if (p.file) parts.push(String(p.file));
    if (p.action) parts.push(String(p.action));
    if (p.command) parts.push(String(p.command));
    if (p.output) parts.push(String(p.output));
    if (p.message) parts.push(String(p.message));
    if (p.path) parts.push(String(p.path));
    if (p.delta) parts.push(String(p.delta));
    if (parts.length) return parts.join(" → ").slice(0, 240);
    try {
      return JSON.stringify(payload).slice(0, 120);
    } catch {
      return "";
    }
  }
  return String(payload ?? "");
}
