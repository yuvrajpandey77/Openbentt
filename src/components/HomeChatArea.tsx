import React from "react";
import ChatMessages from "@/components/ChatMessages";
import { useChat } from "@/context/ChatContext";

/** Main thread view (route `/` only) — messages scroll above the global composer. */
const HomeChatArea: React.FC = () => {
  const { chats, currentChatId, isLoading } = useChat();

  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatMessages messages={messages} isLoading={isLoading} />
    </div>
  );
};

export default HomeChatArea;
