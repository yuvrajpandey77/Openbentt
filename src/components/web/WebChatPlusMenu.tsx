import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Bot,
  Columns2,
  FileText,
  ImageIcon,
  Mic,
  Paperclip,
  Plus,
  Search,
  Settings2,
  Video,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { shortModelLabel } from "@/lib/openrouter";

type MenuRow = {
  id: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type WebChatPlusMenuProps = {
  onPickAccept: (accept: string) => void;
  onOpenSearch: () => void;
  onOpenTools: () => void;
  onOpenSnippets: () => void;
  onToggleCompare: () => void;
  onOpenSpecs: () => void;
  onOpenSetup?: () => void;
  showSetup?: boolean;
  compareOn: boolean;
  modelId: string;
  models: { id: string; name?: string }[];
  onModelChange: (id: string) => void;
  hasMessages: boolean;
  onExportMd?: () => void;
  className?: string;
};

function MenuScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("web-plus-menu-scroll", className)} role="menu">
      {children}
    </div>
  );
}

function CircleIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/70 md:h-11 md:w-11">
      {children}
    </span>
  );
}

export function WebChatPlusMenu({
  onPickAccept,
  onOpenSearch,
  onOpenTools,
  onOpenSnippets,
  onToggleCompare,
  onOpenSpecs,
  onOpenSetup,
  showSetup,
  compareOn,
  modelId,
  models,
  onModelChange,
  hasMessages,
  onExportMd,
  className,
}: WebChatPlusMenuProps) {
  const [open, setOpen] = useState(false);
  const [showModels, setShowModels] = useState(false);

  const close = () => {
    setOpen(false);
    setShowModels(false);
  };

  const rows: MenuRow[] = [
    {
      id: "photos",
      icon: ImageIcon,
      label: "Photos",
      onClick: () => {
        onPickAccept("image/*");
        close();
      },
    },
    {
      id: "files",
      icon: Paperclip,
      label: "Files & PDFs",
      onClick: () => {
        onPickAccept("image/*,audio/*,video/*,.pdf,application/pdf");
        close();
      },
    },
    {
      id: "audio",
      icon: Mic,
      label: "Audio",
      onClick: () => {
        onPickAccept("audio/*");
        close();
      },
    },
    {
      id: "video",
      icon: Video,
      label: "Video",
      onClick: () => {
        onPickAccept("video/*");
        close();
      },
    },
    {
      id: "search",
      icon: Search,
      label: "Search chat",
      onClick: () => {
        onOpenSearch();
        close();
      },
      disabled: !hasMessages,
    },
    {
      id: "tools",
      icon: Wrench,
      label: "Tools",
      onClick: () => {
        onOpenTools();
        close();
      },
    },
    {
      id: "snippets",
      icon: FileText,
      label: "Prompt snippets",
      onClick: () => {
        onOpenSnippets();
        close();
      },
    },
    {
      id: "compare",
      icon: Columns2,
      label: compareOn ? "Compare models (on)" : "Compare models",
      onClick: () => {
        onToggleCompare();
        close();
      },
    },
    {
      id: "specs",
      icon: Settings2,
      label: "Model specs",
      onClick: () => {
        onOpenSpecs();
        close();
      },
    },
  ];

  if (hasMessages && onExportMd) {
    rows.splice(5, 0, {
      id: "export",
      icon: FileText,
      label: "Export .md",
      onClick: () => {
        onExportMd();
        close();
      },
    });
  }

  if (showSetup && onOpenSetup) {
    rows.unshift({
      id: "setup",
      icon: Bot,
      label: "Set up on-device model",
      onClick: () => {
        onOpenSetup();
        close();
      },
    });
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowModels(false); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-10 w-10 shrink-0 rounded-full bg-sidebar-accent/70 text-sidebar-foreground hover:bg-sidebar-accent md:h-11 md:w-11",
            open && "bg-sidebar-accent",
            className
          )}
          aria-label="Add attachment or option"
          aria-expanded={open}
        >
          <Plus className={cn("h-5 w-5 transition-transform md:h-[1.35rem] md:w-[1.35rem]", open && "rotate-45")} strokeWidth={1.75} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={14}
        collisionPadding={16}
        className="z-[200] w-[min(19rem,calc(100vw-1.5rem))] rounded-2xl border border-border/50 bg-popover p-1 shadow-2xl md:w-80"
      >
        {showModels ? (
          <div className="flex flex-col">
            <button
              type="button"
              className="rounded-xl px-4 py-3 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40"
              onClick={() => setShowModels(false)}
            >
              ← Back
            </button>
            <MenuScroll>
              <ul className="px-1 pb-2">
                {models.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onModelChange(m.id);
                        close();
                      }}
                      className={cn(
                        "flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                        m.id === modelId && "bg-muted/60"
                      )}
                    >
                      <span className="text-sm font-medium text-foreground">{m.name || shortModelLabel(m.id)}</span>
                      <span className="text-[11px] text-muted-foreground">{m.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </MenuScroll>
          </div>
        ) : (
          <MenuScroll>
            <ul className="py-1">
              {rows.map(({ id, icon: Icon, label, onClick, disabled }) => (
                <li key={id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={onClick}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/50 disabled:opacity-40"
                  >
                    <CircleIcon>
                      <Icon className="h-4 w-4 text-foreground/85 md:h-[1.1rem] md:w-[1.1rem]" strokeWidth={1.75} />
                    </CircleIcon>
                    <span>{label}</span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setShowModels(true)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/50"
                >
                  <CircleIcon>
                    <Bot className="h-4 w-4 text-foreground/85" strokeWidth={1.75} />
                  </CircleIcon>
                  <span className="min-w-0 flex-1 truncate">Model · {shortModelLabel(modelId)}</span>
                </button>
              </li>
            </ul>
          </MenuScroll>
        )}
      </PopoverContent>
    </Popover>
  );
}
