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
      <ActivityBar />
      <span className="text-xs text-muted-foreground">Working…</span>
    </div>
  );
}

function ActivityBar() {
  return (
    <div className="flex items-end gap-[2px] h-4">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div
          key={i}
          className="bg-primary/60 rounded-sm"
          style={{
            height: `${8 + (i % 4) * 4}px`,
            width: "3px",
            animation: `activity-bounce 1.2s ease-in-out ${i * 0.12}s infinite`,
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
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
