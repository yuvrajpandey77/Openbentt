import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ChatThinkingIndicatorProps = {
  className?: string;
  compact?: boolean;
};

/** Pre-token / waiting state for assistant replies — Openbentt logo (matches empty state). */
export function ChatThinkingIndicator({ className, compact }: ChatThinkingIndicatorProps) {
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
