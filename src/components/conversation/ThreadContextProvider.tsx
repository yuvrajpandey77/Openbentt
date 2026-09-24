import React, { useEffect, useCallback } from "react";
import { useChat } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";

export const ThreadContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { chats, currentChatId, activeProjectId } = useChat();
  const { project: activeResearchProject } = useResearchProject();
  const { registerThreadContextProvider } = useChat();

  const buildThreadContext = useCallback((): string | null => {
    if (!activeProjectId || !currentChatId) return null;

    // Find all other chats in the same project
    const projectChats = chats.filter(
      (c) => c.projectId === activeProjectId && c.id !== currentChatId
    );

    if (projectChats.length === 0) return null;

    // Sort by most recent first
    const sortedChats = projectChats
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5); // Limit to 5 most recent threads

    const lines = [`[THREAD CONTEXT — other conversations in this project]`];

    for (const chat of sortedChats) {
      if (!chat.messages.length) continue;

      // Get last 4 messages from each thread
      const recentMessages = chat.messages.slice(-4);
      const msgText = recentMessages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${typeof m.content === "string" ? m.content.slice(0, 300) : ""}`)
        .join("\n");

      if (msgText.trim()) {
        lines.push(`\n--- Thread: ${chat.title || "Untitled"} ---`);
        lines.push(msgText);
      }
    }

    if (lines.length === 1) return null;

    lines.push("\n(Use this context for continuity across project conversations. Do not repeat information already discussed.)");
    return lines.join("\n");
  }, [activeProjectId, currentChatId, chats]);

  useEffect(() => {
    registerThreadContextProvider(buildThreadContext);
    return () => registerThreadContextProvider(null);
  }, [buildThreadContext, registerThreadContextProvider]);

  return <>{children}</>;
};