import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import ChatMessages from "@/components/ChatMessages";
import ChatInput from "@/components/ChatInput";
import { useChat } from "@/context/ChatContext";
import { cn } from "@/lib/utils";

const CHAT_OPEN_KEY = "openbentt-notebook-chat-open";

type NotebookChatDockProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Collapsed composer bar; thread slides up above it when expanded (Prism-style). */
export function NotebookChatDock({ open: openProp, onOpenChange }: NotebookChatDockProps) {
  const [openInternal, setOpenInternal] = useState(() => {
    try {
      return localStorage.getItem(CHAT_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  const open = openProp ?? openInternal;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp === undefined) setOpenInternal(next);
    try {
      localStorage.setItem(CHAT_OPEN_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const { chats, currentChatId, isLoading } = useChat();
  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages ?? [];

  return (
    <div className="relative z-20 shrink-0">
      {open && (
        <div
          className={cn(
            "absolute bottom-full left-0 right-0 flex min-h-0 flex-col border-t border-border/50 bg-background shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.45)]",
            "max-h-[min(300px,36vh)]"
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">Project chat</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => setOpen(false)}
              aria-label="Hide chat thread"
            >
              Hide
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ChatMessages messages={messages} isLoading={isLoading} emptyVariant="studio" />
          </div>
        </div>
      )}

      <div className="flex items-end gap-1.5 border-t border-border/40 bg-background/98 px-2 py-1.5 backdrop-blur-sm">
        <Button
          type="button"
          size="sm"
          variant={open ? "secondary" : "ghost"}
          className="mb-0.5 h-8 shrink-0 gap-1 px-2 text-xs"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Hide chat thread" : "Show chat thread"}
          aria-expanded={open}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{open ? "Hide" : "Chat"}</span>
          {open ? <ChevronDown className="h-3 w-3 opacity-60" /> : <ChevronUp className="h-3 w-3 opacity-60" />}
        </Button>
        <div className="min-w-0 flex-1">
          <ChatInput
            isLoading={isLoading}
            placeholderOverride="Ask about your draft, PDFs, or compile errors…"
            variant="studio"
          />
        </div>
      </div>
    </div>
  );
}
