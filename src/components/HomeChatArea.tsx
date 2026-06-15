import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ChatMessages from "@/components/ChatMessages";
import { OpenRouterKeyPrompt } from "@/components/OpenRouterKeyPrompt";
import { WebChatStarterPrompts } from "@/components/web/WebChatStarterPrompts";
import { WebChatInstallDialog } from "@/components/web/WebChatInstallDialog";
import { useChat } from "@/context/ChatContext";
import { useWebChatUi } from "@/context/WebChatUiContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Search, X } from "lucide-react";
import { enableChatPwa, disableChatPwa } from "@/lib/chatPwa";

/** Main thread view (route `/chat`) — messages scroll above the global composer. */
const HomeChatArea: React.FC = () => {
  const { chats, currentChatId, isLoading } = useChat();
  const webUi = useWebChatUi();
  const isMobile = useIsMobile();
  const [threadSearch, setThreadSearch] = React.useState("");

  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages ?? [];
  const isEmpty = messages.length === 0;
  const searchActive = webUi?.searchOpen || threadSearch.trim().length > 0;

  const closeSearch = () => {
    setThreadSearch("");
    webUi?.closeSearch();
  };

  React.useEffect(() => {
    void enableChatPwa();
    return () => {
      void disableChatPwa();
    };
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("install") !== "1") return;
    webUi?.openInstall();
    params.delete("install");
    const next = params.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, [webUi]);

  React.useEffect(() => {
    if (!isMobile) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [isMobile]);

  return (
    <div className="web-chat-thread flex min-h-0 flex-1 flex-col overflow-hidden">
      <OpenRouterKeyPrompt />
      <WebChatInstallDialog open={webUi?.installOpen ?? false} onOpenChange={(v) => (v ? webUi?.openInstall() : webUi?.closeInstall())} />

      {!isEmpty && searchActive && (
        <div className="z-10 flex shrink-0 items-center gap-1 border-b border-border/40 bg-background px-3 py-2">
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

      <ChatMessages
        messages={messages}
        isLoading={isLoading}
        searchQuery={threadSearch}
        webCleanEmpty={isEmpty}
        webStarterSlot={
          isEmpty ? (
            <WebChatStarterPrompts onSelect={(text) => webUi?.setComposerSeed(text)} />
          ) : undefined
        }
      />
    </div>
  );
};

export default HomeChatArea;
