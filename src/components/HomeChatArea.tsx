import React, { useEffect } from "react";
import ChatMessages from "@/components/ChatMessages";
import { ChatHome } from "@/components/ChatHome";
import { useChat } from "@/context/ChatContext";
import { useIsMobile } from "@/hooks/use-mobile";

const HomeChatArea: React.FC = () => {
  const { chats, currentChatId, isLoading } = useChat();
  const isMobile = useIsMobile();

  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages ?? [];
  const activeTaskId = currentChat?.taskIds?.length ? currentChat.taskIds[currentChat.taskIds.length - 1] : undefined;

  useEffect(() => {
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {messages.length === 0 && !isLoading ? (
        <ChatHome />
      ) : (
        <ChatMessages messages={messages} isLoading={isLoading} activeTaskId={activeTaskId} overlayChrome />
      )}
    </div>
  );
};

export default HomeChatArea;