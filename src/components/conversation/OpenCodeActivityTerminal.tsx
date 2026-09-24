import React, { useEffect, useRef } from "react";
import { useChat } from "@/context/ChatContext";
import { cn } from "@/lib/utils";
import { Terminal, ChevronDown, ChevronUp, X } from "lucide-react";
import type { OpenCodeAgentEvent } from "@/lib/agent/openCodeTypes";

export const OpenCodeActivityTerminal: React.FC<{ taskId: string | null }> = ({ taskId }) => {
  const { executionEvents } = useChat();
  const [open, setOpen] = React.useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const events = taskId ? (executionEvents[taskId] ?? []) : [];

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, open]);

  if (!taskId) return null;

  return (
    <div
      className={cn(
        "border border-border/60 bg-[#0d1117] rounded-lg text-xs font-mono overflow-hidden transition-all",
        open ? "max-h-64" : "max-h-7"
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 bg-[#161b22] hover:bg-[#1c2128] transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Collapse activity" : "Expand activity"}
      >
        <Terminal size={12} className="text-muted-foreground shrink-0" />
        <span className="text-[11px] text-muted-foreground font-sans">
          OpenCode activity {events.length > 0 && `(${events.length})`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      {open && (
        <div ref={scrollRef} className="max-h-48 overflow-y-auto scrollbar-hide p-2 space-y-0.5">
          {events.length === 0 ? (
            <span className="text-muted-foreground/50">Waiting for activity…</span>
          ) : (
            events.map((evt, i) => (
              <div key={evt.eventId ?? i} className={cn("flex gap-2 py-0.5", evt.type.startsWith("agent.error") || evt.type.startsWith("agent.failed") ? "text-red-400" : evt.type.startsWith("agent.completed") || evt.type.startsWith("agent.file.changed") ? "text-emerald-400" : "text-muted-foreground")}>
                <span className="shrink-0 text-[10px] opacity-60">
                  {new Date(evt.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className="shrink-0 text-[10px] opacity-40">[{evt.type.replace(/^agent\./, "")}]</span>
                <span className="break-all">{formatPayload(evt.payload)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

function formatPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const parts: string[] = [];
    if (p.file) parts.push(String(p.file));
    if (p.action) parts.push(String(p.action));
    if (p.command) parts.push(String(p.command));
    if (p.message) parts.push(String(p.message));
    if (p.path) parts.push(String(p.path));
    if (parts.length) return parts.join(" → ");
    return JSON.stringify(payload).slice(0, 120);
  }
  return String(payload ?? "");
}
