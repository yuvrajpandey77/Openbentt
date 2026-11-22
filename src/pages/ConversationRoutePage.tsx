import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import HomeChatArea from "@/components/HomeChatArea";
import { useChat } from "@/context/ChatContext";
import { ThreadContextProvider } from "@/components/conversation/ThreadContextProvider";

/**
 * Deep-linkable global conversation: /chat/:conversationId selects the
 * canonical conversation and renders the SAME chat surface. Preserves
 * history; never duplicates chats.
 */
const ConversationRoutePage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { chats, chatsReady, selectChat } = useChat();

  useEffect(() => {
    if (!chatsReady) return;
    if (!conversationId || !chats.some((c) => c.id === conversationId)) {
      navigate("/chat", { replace: true });
      return;
    }
    selectChat(conversationId);
  }, [conversationId, chats, chatsReady, selectChat, navigate]);

  return (
    <ThreadContextProvider>
      <HomeChatArea />
    </ThreadContextProvider>
  );
};

export default ConversationRoutePage;
