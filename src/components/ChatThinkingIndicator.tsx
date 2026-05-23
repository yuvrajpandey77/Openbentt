import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

const STATUS_LINES = [
  "Analyzing your request…",
  "Gathering context…",
  "Building a response…",
  "Curating the best answer…",
  "Cooking something useful…",
  "Connecting the dots…",
  "Almost there…",
] as const;

type ChatThinkingIndicatorProps = {
  className?: string;
  compact?: boolean;
};

/** Animated pre-token / waiting state for assistant replies. */
export function ChatThinkingIndicator({ className, compact }: ChatThinkingIndicatorProps) {
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLineIdx((i) => (i + 1) % STATUS_LINES.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={cn("flex items-start gap-3", className)}
      role="status"
      aria-live="polite"
      aria-label={STATUS_LINES[lineIdx]}
    >
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary",
          compact ? "h-7 w-7" : "h-9 w-9"
        )}
      >
        <Sparkles className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "animate-pulse")} />
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" style={{ animationDuration: "2s" }} />
      </div>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <p
          key={lineIdx}
          className={cn(
            "font-medium text-foreground",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {STATUS_LINES[lineIdx]}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="chat-shimmer-bar h-1.5 w-16 rounded-full" />
          <span className="chat-shimmer-bar h-1.5 w-10 rounded-full opacity-70" style={{ animationDelay: "0.15s" }} />
          <span className="chat-shimmer-bar h-1.5 w-6 rounded-full opacity-50" style={{ animationDelay: "0.3s" }} />
        </div>
        <div className="flex gap-1 pt-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce"
              style={{ animationDelay: `${i * 140}ms` }}
            />
          ))}
        </div>
      </div>
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
