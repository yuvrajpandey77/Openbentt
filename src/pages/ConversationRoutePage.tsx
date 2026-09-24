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
  const { chats, selectChat } = useChat();

  useEffect(() => {
    if (!conversationId) {
      navigate("/chat", { replace: true });
      return;
    }
    if (chats.some((c) => c.id === conversationId)) {
      selectChat(conversationId);
    } else if (chats.length > 0) {
      // Unknown id (e.g. cleared storage): fall back to chat root.
      navigate("/chat", { replace: true });
    }
  }, [conversationId, chats, selectChat, navigate]);

  return (
    <ThreadContextProvider>
      <HomeChatArea />
    </ThreadContextProvider>
  );
};

export default ConversationRoutePage;
