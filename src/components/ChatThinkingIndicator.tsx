import { cn } from "@/lib/utils";

type ChatThinkingIndicatorProps = {
  className?: string;
  compact?: boolean;
  localOnDevice?: boolean;
};

export function ChatThinkingIndicator({ className, compact }: ChatThinkingIndicatorProps) {
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="status"
      aria-live="polite"
      aria-label="Generating response"
    >
      <ShimmerText />
    </div>
  );
}

function ShimmerText() {
  return (
    <span className="relative inline-block text-xs font-medium">
      <span className="text-muted-foreground/30">Thinking</span>
      <span className="absolute inset-0 overflow-hidden">
        <span className="relative inline-block bg-gradient-to-r from-transparent via-muted-foreground/60 to-transparent bg-[length:200%_100%] animate-shimmer-wave text-transparent bg-clip-text">
          Thinking
        </span>
      </span>
    </span>
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