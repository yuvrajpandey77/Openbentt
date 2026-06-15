import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ChatMessages from "@/components/ChatMessages";
import { OpenRouterKeyPrompt } from "@/components/OpenRouterKeyPrompt";
import { WebChatStarterPrompts } from "@/components/web/WebChatStarterPrompts";
import { useChat } from "@/context/ChatContext";
import { useWebChatUi } from "@/context/WebChatUiContext";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Main thread view (route `/chat`) — messages scroll above the global composer. */
const HomeChatArea: React.FC = () => {
  const { chats, currentChatId, isLoading } = useChat();
  const webUi = useWebChatUi();
  const [threadSearch, setThreadSearch] = React.useState("");

  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages ?? [];
  const isEmpty = messages.length === 0;
  const searchActive = webUi?.searchOpen || threadSearch.trim().length > 0;

  const closeSearch = () => {
    setThreadSearch("");
    webUi?.closeSearch();
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <OpenRouterKeyPrompt />

      {!isEmpty && searchActive && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-1 bg-background/95 px-3 py-2 backdrop-blur-md">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search this chat…"
              className="h-9 border-0 bg-muted/30 pl-8 text-sm shadow-none"
              aria-label="Search messages in this chat"
              autoFocus={webUi?.searchOpen}
            />
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 md:h-11 md:w-11" onClick={closeSearch} aria-label="Close search">
            <X className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
        </div>
      )}

      <ChatMessages messages={messages} isLoading={isLoading} searchQuery={threadSearch} webCleanEmpty={isEmpty} />

      {isEmpty && (
        <div className={cn("shrink-0 px-2 pb-2 md:mx-auto md:w-full md:max-w-5xl md:px-6")}>
          <WebChatStarterPrompts onSelect={(text) => webUi?.setComposerSeed(text)} />
        </div>
      )}
    </div>
  );
};

export default HomeChatArea;
