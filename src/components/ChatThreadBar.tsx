import React, { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useChat } from "@/context/ChatContext";
import { buildChatMarkdownExport, downloadTextFile } from "@/lib/chatExportMarkdown";
import { useToast } from "@/components/ui/use-toast";
import { Download, FileText, Search } from "lucide-react";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { threadToLatexDraft } from "@/lib/research/threadToPaper";
import { useNavigate } from "react-router-dom";
import { KeyboardShortcutsSheet } from "@/components/KeyboardShortcutsSheet";

interface ChatThreadBarProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
}

export const ChatThreadBar: React.FC<ChatThreadBarProps> = ({ searchQuery, onSearchQueryChange }) => {
  const { chats, currentChatId } = useChat();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { project, setDraftTex, linkThread } = useResearchProject();
  const chat = useMemo(() => chats.find((c) => c.id === currentChatId), [chats, currentChatId]);

  const exportMd = () => {
    if (!chat?.messages.length) {
      toast({ title: "Nothing to export", description: "Send a message first.", variant: "destructive" });
      return;
    }
    const md = buildChatMarkdownExport(chat);
    const safe = chat.title.replace(/[^\w-]+/g, "-").slice(0, 48) || "chat";
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`openbentt-${safe}-${stamp}.md`, md);
    toast({ title: "Markdown exported", description: "File download started." });
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
      <div className="relative min-w-[12rem] flex-1 max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search this chat…"
          className="h-8 pl-8 text-xs"
          aria-label="Search messages in this chat"
        />
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={exportMd}
          disabled={!chat?.messages.length}
        >
          <Download className="h-3.5 w-3.5" />
          Export .md
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={!chat?.messages.length}
          onClick={() => {
            if (!chat) return;
            const preamble = project?.draftTex.includes("\\documentclass")
              ? project.draftTex.split("\\begin{document}")[0]
              : undefined;
            void setDraftTex(threadToLatexDraft(chat, preamble));
            void linkThread(chat.id);
            navigate("/notebook");
            toast({ title: "Thread exported", description: "Open Notebook → Write to edit the draft." });
          }}
        >
          <FileText className="h-3.5 w-3.5" />
          To Notebook
        </Button>
        <KeyboardShortcutsSheet />
      </div>
    </div>
  );
};
