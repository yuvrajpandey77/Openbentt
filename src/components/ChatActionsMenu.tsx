import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChat } from "@/context/ChatContext";

type Props = {
  chatId?: string | null;
  /** Compact icon for a sidebar row. Header uses the labeled trigger. */
  compact?: boolean;
};

export function ChatActionsMenu({ chatId, compact = false }: Props) {
  const navigate = useNavigate();
  const { chats, createNewChat, deleteChat, renameChat, clearChats } = useChat();
  const chat = chats.find((c) => c.id === chatId);

  const goNew = () => {
    createNewChat();
    navigate("/chat");
  };

  const rename = () => {
    if (!chat) return;
    const next = window.prompt("Rename chat", chat.title || "Untitled chat");
    if (next == null) return;
    renameChat(chat.id, next);
  };

  const remove = () => {
    if (!chat) return;
    if (!window.confirm(`Delete “${chat.title || "Untitled chat"}”?`)) return;
    const projectId = chat.projectId;
    deleteChat(chat.id);
    navigate(projectId ? `/projects/${projectId}` : "/chat");
  };

  const clearAll = () => {
    if (chats.length === 0) return;
    if (!window.confirm(`Delete all ${chats.length} chats? This cannot be undone.`)) return;
    clearChats();
    navigate("/chat");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? "icon" : "sm"}
          className={compact ? "h-7 w-7 shrink-0" : "h-8 gap-1.5 px-2 text-xs"}
          aria-label="Chat actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
          {!compact && <span className="hidden sm:inline">Chat</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={goNew}>
          <Plus className="mr-2 h-4 w-4" />
          New chat
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!chat} onClick={rename}>
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!chat} className="text-destructive focus:text-destructive" onClick={remove}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete chat
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={chats.length === 0} className="text-destructive focus:text-destructive" onClick={clearAll}>
          <Trash2 className="mr-2 h-4 w-4" />
          Clear all chats
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
