
import React, { useEffect } from "react";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";
import { useChat } from "@/context/ChatContext";
import { Button } from "@/components/ui/button";
import { Menu, PanelLeft } from "lucide-react";
import { canSendChat } from "@/types/chat";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { CapabilitiesSheet } from "@/components/CapabilitiesSheet";
import { ContextMeter } from "@/components/ContextMeter";
import { ProviderQuotaMeter } from "@/components/ProviderQuotaMeter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ChatContainerProps {
  onOpenMobileSidebar: () => void;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  onOpenMobileSidebar,
  sidebarCollapsed = false,
  onExpandSidebar,
}) => {
  const {
    currentChatId,
    chats,
    createNewChat,
    isLoading,
    apiConfig,
  } = useChat();

  useEffect(() => {
    if (!currentChatId && canSendChat(apiConfig)) {
      createNewChat();
    }
  }, [currentChatId, createNewChat, apiConfig]);

  const currentChat = chats.find(chat => chat.id === currentChatId);
  const messages = currentChat?.messages || [];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border/80 bg-background/85 px-2 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            onClick={onOpenMobileSidebar}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </Button>
          {sidebarCollapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden h-9 w-9 shrink-0 md:inline-flex"
                  onClick={onExpandSidebar}
                  aria-label="Show sidebar: workspace & chats"
                >
                  <PanelLeft size={20} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open sidebar — workspace tools & chat history</TooltipContent>
            </Tooltip>
          )}
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-xs font-medium text-muted-foreground md:text-sm">Chat</p>
            <p className="truncate text-[10px] text-muted-foreground/80 md:text-[11px]">
              Workspace tools live in the sidebar
            </p>
          </div>
        </div>
        <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2">
          {canSendChat(apiConfig) && (
            <div className="flex min-w-0 max-w-full flex-wrap items-start justify-end gap-2">
              {currentChatId ? (
                <div className="max-w-[min(100%,300px)] min-w-0">
                  <ContextMeter />
                </div>
              ) : null}
              <ProviderQuotaMeter />
            </div>
          )}
          <CapabilitiesSheet />
          <ShareLinkButton />
        </div>
      </header>

      <ChatMessages messages={messages} isLoading={isLoading} />
      
      <ChatInput isLoading={isLoading} />
    </div>
  );
};

export default ChatContainer;
