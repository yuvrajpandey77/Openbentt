import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  FolderKanban,
  BookOpen,
  NotebookPen,
  Settings,
  Cpu,
  Plus,
  FileStack,
  Files,
  ListTodo,
  Bot,
  Plug,
  FileType2,
} from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useLocalAI } from "@/context/LocalAIContext";
import { friendlyModelLabel } from "@/lib/ollama/selection";

/**
 * Desktop command palette (Cmd/Ctrl+K). Real destinations only.
 */
export const CommandMenu: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void }> = ({
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();
  const { chats, selectChat, createNewChat } = useChat();
  const { projects } = useResearchProject();
  const { modelNames } = useLocalAI();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  const chatHits = useMemo(
    () => chats.filter((c) => match(c.title)).slice(-8).reverse(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chats, q]
  );
  const projectHits = useMemo(
    () => projects.filter((p) => match(p.title ?? p.id)).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, q]
  );
  const modelHits = useMemo(
    () => modelNames.filter(match).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modelNames, q]
  );

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center bg-black/50 px-4 pt-[12vh]"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats, projects, models, commands…"
          aria-label="Search chats, projects, models, commands"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          <Section title="Go to">
            <Item
              icon={<Plus size={15} />}
              label="New chat"
              hint="⌘N"
              onSelect={() => {
                createNewChat();
                go("/chat");
              }}
            />
            <Item icon={<MessageSquare size={15} />} label="Chat" onSelect={() => go("/chat")} />
            <Item icon={<FolderKanban size={15} />} label="Projects" onSelect={() => go("/projects")} />
            <Item
              icon={<NotebookPen size={15} />}
              label="Notebook · Compile"
              onSelect={() => go("/notebook")}
            />
            <Item icon={<FileStack size={15} />} label="Documents" onSelect={() => go("/documents")} />
            <Item icon={<BookOpen size={15} />} label="Research library" onSelect={() => go("/labs")} />
            <Item icon={<Files size={15} />} label="Files" onSelect={() => go("/files")} />
            <Item icon={<ListTodo size={15} />} label="Tasks" onSelect={() => go("/tasks")} />
            <Item icon={<FileType2 size={15} />} label="Math / LaTeX" onSelect={() => go("/write")} />
            <Item icon={<Bot size={15} />} label="Agent · Voice" onSelect={() => go("/agent")} />
            <Item icon={<Plug size={15} />} label="Integrations / Setup" onSelect={() => go("/setup")} />
            <Item icon={<Settings size={15} />} label="Settings" hint="⌘," onSelect={() => go("/settings")} />
          </Section>
          {modelHits.length > 0 && (
            <Section title="Local models">
              {modelHits.map((m) => (
                <Item
                  key={m}
                  icon={<Cpu size={15} />}
                  label={friendlyModelLabel(m)}
                  sub="Local · Ollama"
                  onSelect={() => go("/settings")}
                />
              ))}
            </Section>
          )}
          {chatHits.length > 0 && (
            <Section title="Chats">
              {chatHits.map((c) => (
                <Item
                  key={c.id}
                  icon={<MessageSquare size={15} />}
                  label={c.title || "Untitled chat"}
                  onSelect={() => {
                    selectChat(c.id);
                    go(c.projectId ? `/projects/${c.projectId}/chat/${c.id}` : `/chat/${c.id}`);
                  }}
                />
              ))}
            </Section>
          )}
          {projectHits.length > 0 && (
            <Section title="Projects">
              {projectHits.map((p) => (
                <Item
                  key={p.id}
                  icon={<FolderKanban size={15} />}
                  label={p.title || p.id}
                  onSelect={() => go(`/projects/${p.id}`)}
                />
              ))}
            </Section>
          )}
          {q && chatHits.length === 0 && projectHits.length === 0 && modelHits.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              No results for “{query.trim()}”.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function Item({
  icon,
  label,
  sub,
  hint,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
      {sub && <span className="shrink-0 text-[11px] text-muted-foreground">{sub}</span>}
      {hint && (
        <kbd className="shrink-0 rounded border border-border bg-muted px-1 text-[10px] text-muted-foreground">
          {hint}
        </kbd>
      )}
    </button>
  );
}
