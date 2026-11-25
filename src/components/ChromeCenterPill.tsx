import React, { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@/context/ChatContext";
import { pendingPermission, pendingQuestion } from "@/lib/agent/executionView";
import { loadChatProviderChoice } from "@/lib/agent/chatProviderChoice";
import { BotIcon, ChevronDownIcon, ShieldAlertIcon, ShieldCheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const RUNTIME_LABELS: Record<string, string> = {
  opencode: "OpenCode",
  claude: "Claude",
  codex: "Codex",
  "cursor-agent": "Cursor",
  aider: "Aider",
  gemini: "Gemini",
  ollama: "Ollama",
  openrouter: "OpenRouter",
  local_gguf: "Local",
};

type ChromeCenterPillProps = {
  open: boolean;
  onToggle: () => void;
  className?: string;
};

/**
 * Single intelligent status pill for app chrome.
 * Summarizes approvals / agent wait state; click opens the right inspector card.
 */
export function ChromeCenterPill({ open, onToggle, className }: ChromeCenterPillProps) {
  const { executionTasks, executionEvents, executionMode } = useChat();
  const [pendingCount, setPendingCount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      let count = 0;
      for (const [taskId, events] of Object.entries(executionEvents)) {
        const task = executionTasks[taskId];
        if (!task || !["WAITING_FOR_PERMISSION", "RUNNING"].includes(task.status)) continue;
        if (pendingPermission(events)) count += 1;
        if (pendingQuestion(events)) count += 1;
      }
      setPendingCount(count);
    }, 250);
    return () => clearTimeout(timeoutRef.current);
  }, [executionEvents, executionTasks]);

  const label = useMemo(() => {
    if (pendingCount > 0) {
      return pendingCount === 1 ? "1 approval needed" : `${pendingCount} approvals needed`;
    }
    const running = Object.values(executionTasks ?? {}).some((t) => t.status === "RUNNING");
    if (running) return "Agent working…";
    const choiceId = loadChatProviderChoice()?.id ?? "opencode";
    const cli = RUNTIME_LABELS[choiceId] ?? choiceId;
    const mode = executionMode || "chat";
    return `${cli} · ${mode}`;
  }, [executionMode, executionTasks, pendingCount]);

  const needsAttention = pendingCount > 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      aria-label={open ? `Close inspector — ${label}` : `Open inspector — ${label}`}
      className={cn(
        "inline-flex max-w-[min(100%,18rem)] items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[11px] font-medium transition-colors",
        needsAttention
          ? "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
          : open
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className
      )}
    >
      {needsAttention ? (
        <ShieldAlertIcon size={16} active tone="warn" />
      ) : open ? (
        <ShieldCheckIcon size={16} active />
      ) : (
        <BotIcon size={16} />
      )}
      <span className="min-w-0 truncate">{label}</span>
      <ChevronDownIcon
        size={16}
        active={open}
        className={cn("opacity-60 transition-transform", open && "[&_svg]:rotate-180")}
      />
    </button>
  );
}
