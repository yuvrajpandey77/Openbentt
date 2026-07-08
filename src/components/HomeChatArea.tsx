import React from "react";
import ChatMessages from "@/components/ChatMessages";
import { useChat } from "@/context/ChatContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { enableChatPwa, disableChatPwa } from "@/lib/chatPwa";

/** Main thread view (route `/chat`) — messages scroll above the global composer. */
const HomeChatArea: React.FC = () => {
  const { chats, currentChatId, isLoading } = useChat();
  const isMobile = useIsMobile();

  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages ?? [];
  const isEmpty = messages.length === 0;

  React.useEffect(() => {
    void enableChatPwa();
    return () => {
      void disableChatPwa();
    };
  }, []);

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
      <ChatMessages
        messages={messages}
        isLoading={isLoading}
        webCleanEmpty={isEmpty}
      />
    </div>
  );
};

export default HomeChatArea;
