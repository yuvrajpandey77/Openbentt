/**
 * Floating `/` command list above the composer — snippets + notebook actions.
 */
import { useMemo } from "react";
import { FileText, Hash, Quote, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildSlashItems, type SlashItem } from "@/lib/composerSlash";

const ICONS = {
  file: FileText,
  hash: Hash,
  quote: Quote,
  sparkles: Sparkles,
} as const;

type ComposerSlashMenuProps = {
  query: string;
  notebook?: boolean;
  activeIndex: number;
  onHoverIndex: (i: number) => void;
  onPick: (item: SlashItem) => void;
  className?: string;
};

export function ComposerSlashMenu({
  query,
  notebook,
  activeIndex,
  onHoverIndex,
  onPick,
  className,
}: ComposerSlashMenuProps) {
  const items = useMemo(() => {
    const all = buildSlashItems({ notebook });
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (i) =>
        i.command.includes(q) ||
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
    );
  }, [query, notebook]);

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "absolute bottom-full left-0 z-50 mb-2 w-[min(100%,22rem)] rounded-xl border border-border/60 bg-popover p-3 text-xs text-muted-foreground shadow-xl",
          className
        )}
      >
        No commands match `/{query}`
      </div>
    );
  }

  return (
    <div
      className={cn(
        "absolute bottom-full left-0 z-50 mb-2 max-h-[min(50vh,20rem)] w-[min(100%,24rem)] overflow-y-auto rounded-xl border border-border/60 bg-popover py-1 shadow-xl",
        className
      )}
      role="listbox"
      aria-label="Slash commands"
    >
      {items.map((item, i) => {
        const Icon = ICONS[item.icon ?? "sparkles"] ?? Sparkles;
        const active = i === activeIndex;
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={active}
            className={cn(
              "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
              active ? "bg-muted" : "hover:bg-muted/60"
            )}
            onMouseEnter={() => onHoverIndex(i)}
            onClick={() => onPick(item)}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{item.title}</span>
              <span className="block text-[11px] text-muted-foreground line-clamp-2">{item.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
