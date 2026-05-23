import { Button } from "@/components/ui/button";
import { useChat } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import {
  editorFileKey,
  editorFileLabel,
  fileRefEquals,
  useNotebookStudio,
  type NotebookStudioFileRef,
} from "@/context/NotebookStudioContext";
import { ConnectionHandle } from "@/components/notebook/ConnectionHandle";
import { texTabAnchorId } from "@/components/notebook/NotebookConnectionCables";
import { cn } from "@/lib/utils";
import { BookMarked, FileCode2, MessageSquare, X } from "lucide-react";

function TabIcon({ file }: { file: NotebookStudioFileRef }) {
  if (file.type === "bib") return <BookMarked className="h-3 w-3 shrink-0 opacity-70" />;
  return <FileCode2 className="h-3 w-3 shrink-0 opacity-70" />;
}

export function NotebookEditorTabs({ embedded = false }: { embedded?: boolean }) {
  const { project } = useResearchProject();
  const { createNewChat, selectChat, chats } = useChat();
  const {
    editorTabs,
    activeEditorFile,
    setActiveEditorFile,
    setActiveFile,
    closeEditorTab,
    chatConnections,
    toggleChatConnection,
    pendingConnection,
    setChatConnection,
    registerConnectionAnchor,
    connectionDrag,
    openChatPanel,
  } = useNotebookStudio();

  if (!project) return null;

  const openChatForFile = (tab: NotebookStudioFileRef, label: string) => {
    const tabKey = editorFileKey(tab);
    const existing = chats.find((c) => c.title === `📄 ${label}`);
    if (existing) {
      selectChat(existing.id);
    } else {
      createNewChat(`📄 ${label}`);
    }
    if (!chatConnections.texFileKeys.includes(tabKey)) {
      setChatConnection("tex", tabKey);
    }
    setActiveEditorFile(tab);
    setActiveFile(tab);
    openChatPanel();
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1 overflow-x-auto",
        embedded
          ? "gap-1"
          : "shrink-0 gap-0.5 border-b border-border/50 bg-muted/15 px-2 py-1"
      )}
    >
      {editorTabs.map((tab) => {
        const active = fileRefEquals(tab, activeEditorFile);
        const label = editorFileLabel(tab, project);
        const canClose = editorTabs.length > 1;
        const tabKey = editorFileKey(tab);
        const anchorId = texTabAnchorId(tabKey);
        const texConnected = chatConnections.texFileKeys.includes(tabKey);
        const snapHighlight = connectionDrag?.snapTargetId === anchorId;
        return (
          <div
            key={editorFileKey(tab)}
            className={cn(
              "group flex max-w-[240px] shrink-0 items-center rounded-md border text-xs transition-colors",
              embedded ? "min-h-8" : "",
              active
                ? "border-primary/40 bg-background text-foreground shadow-sm ring-1 ring-primary/15"
                : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              pendingConnection?.from === "chat-tex" && "ring-1 ring-sky-500/50"
            )}
          >
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left",
                embedded ? "py-1.5 font-medium" : "py-1"
              )}
              onClick={() => {
                setActiveEditorFile(tab);
                setActiveFile(tab);
                if (pendingConnection?.from === "chat-tex") {
                  setChatConnection("tex", tabKey);
                }
              }}
              title={label}
            >
              <TabIcon file={tab} />
              <span className="truncate">{label}</span>
            </button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-70 hover:!opacity-100"
              aria-label={`Open chat for ${label}`}
              title={`Chat about ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                openChatForFile(tab, label);
              }}
            >
              <MessageSquare className="h-3 w-3" />
            </Button>
            <ConnectionHandle
              id={anchorId}
              kind="tex-tab"
              label={`Connect chat to ${label}`}
              connected={texConnected}
              highlight={pendingConnection?.from === "chat-tex"}
              snapHighlight={snapHighlight}
              registerAnchor={registerConnectionAnchor}
              onClick={() => toggleChatConnection("tex", tabKey)}
              className="mr-1"
            />
            {canClose && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 rounded-md opacity-60 hover:opacity-100 group-hover:opacity-100"
                aria-label={`Close ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeEditorTab(tab);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
