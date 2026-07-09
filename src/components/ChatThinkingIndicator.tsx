import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isWebClient } from "@/config/platformSurface";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const loadingMessages = [
  "Thinking...",
  "Generating...",
  "Working on it...",
  "Almost there...",
  "Composing a reply...",
  "Running on-device...",
];

const cloudLoadingMessages = [
  "Thinking...",
  "Reasoning...",
  "Synthesizing...",
  "Orchestrating...",
  "Routing your request...",
  "Coordinating models...",
  "Searching the semantic space...",
  "Encoding context...",
  "Streaming inference...",
  "Aggregating intelligences...",
  "Parsing the epistemic field...",
  "Routing through Meridian...",
];

type ChatThinkingIndicatorProps = {
  className?: string;
  compact?: boolean;
  /** Prefer short on-device copy when local inference is active. */
  localOnDevice?: boolean;
};

export function ChatThinkingIndicator({ className, compact, localOnDevice }: ChatThinkingIndicatorProps) {
  const pool = localOnDevice ? loadingMessages : cloudLoadingMessages;
  const [msg, setMsg] = useState(pool[0]);

  useEffect(() => {
    const pick = () => {
      const next = pool[Math.floor(Math.random() * pool.length)];
      setMsg(next);
    };
    pick();
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = 800 + Math.floor(Math.random() * 400);
      timeoutId = setTimeout(() => {
        pick();
        schedule();
      }, ms);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [pool]);

  const content = (
    <div
      className={cn("flex items-center gap-3", className)}
      role="status"
      aria-live="polite"
      aria-label="Generating response"
    >
      <div className={cn("shrink-0", compact ? "h-7 w-7" : "h-9 w-9")}>
        <img
          src="/cobentt-logo.png"
          alt=""
          className={cn(
            "h-full w-full object-contain animate-spin",
            compact ? "[animation-duration:3s]" : "[animation-duration:3s]"
          )}
        />
      </div>
      <span className={cn("text-[#888888] font-normal", compact ? "text-xs" : "text-sm")}>
        {msg}
      </span>
    </div>
  );

  if (isWebClient()) return content;

  return (
    <div
      className={cn("flex items-center", className)}
      role="status"
      aria-live="polite"
      aria-label="Generating response"
    >
      <Avatar
        className={cn(
          "rounded-2xl shadow-sm ring-1 ring-border/40 animate-pulse",
          compact ? "h-8 w-8" : "h-10 w-10"
        )}
      >
        <AvatarImage src="/openbentt-logo.svg" alt="" />
        <AvatarFallback className="font-display text-xs">OB</AvatarFallback>
      </Avatar>
      {msg}
    </div>
  );
}

export function ChatStreamingCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] rounded-sm bg-primary chat-stream-cursor"
      aria-hidden
    />
  );
}
