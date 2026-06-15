import React, { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChat } from "@/context/ChatContext";
import { buildChatMarkdownExport, downloadTextFile } from "@/lib/chatExportMarkdown";
import { useToast } from "@/components/ui/use-toast";
import { Download, FileText, Keyboard, MoreHorizontal, Search, X } from "lucide-react";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const chat = useMemo(() => chats.find((c) => c.id === currentChatId), [chats, currentChatId]);

  const searchActive = searchOpen || searchQuery.trim().length > 0;

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

  const exportToNotebook = () => {
    if (!chat) return;
    const preamble = project?.draftTex.includes("\\documentclass")
      ? project.draftTex.split("\\begin{document}")[0]
      : undefined;
    void setDraftTex(threadToLatexDraft(chat, preamble));
    void linkThread(chat.id);
    navigate("/notebook");
    toast({ title: "Thread exported", description: "Open Notebook → Write to edit the draft." });
  };

  const closeSearch = () => {
    onSearchQueryChange("");
    setSearchOpen(false);
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/40 bg-background/70 px-2 sm:px-3">
      {searchActive ? (
        <>
          <div className="relative min-w-0 flex-1 max-w-lg">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search this chat…"
              className="h-8 border-border/50 bg-muted/20 pl-8 pr-2 text-xs"
              aria-label="Search messages in this chat"
              autoFocus={searchOpen}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={closeSearch}
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            onClick={() => setSearchOpen(true)}
            aria-label="Search this chat"
          >
            <Search className="h-4 w-4" />
          </Button>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  aria-label="Chat actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  disabled={!chat?.messages.length}
                  onClick={exportMd}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export .md
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  disabled={!chat?.messages.length}
                  onClick={exportToNotebook}
                >
                  <FileText className="h-3.5 w-3.5" />
                  To Notebook
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-xs" onClick={() => setShortcutsOpen(true)}>
                  <Keyboard className="h-3.5 w-3.5" />
                  Shortcuts
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <KeyboardShortcutsSheet
              open={shortcutsOpen}
              onOpenChange={setShortcutsOpen}
              showTrigger={false}
            />
          </div>
        </>
      )}
    </div>
  );
};
