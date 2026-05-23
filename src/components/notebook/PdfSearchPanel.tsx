import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PdfSearchHit } from "@/lib/pdfViewer";
import { cn } from "@/lib/utils";
import { Loader2, Search, X } from "lucide-react";

type PdfSearchPanelProps = {
  open: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  hits: PdfSearchHit[];
  searching: boolean;
  onSelectHit: (hit: PdfSearchHit) => void;
  onClose: () => void;
};

export function PdfSearchPanel({
  open,
  query,
  onQueryChange,
  hits,
  searching,
  onSelectHit,
  onClose,
}: PdfSearchPanelProps) {
  if (!open) return null;

  return (
    <div className="flex w-56 shrink-0 flex-col border-l border-border/50 bg-card/95">
      <div className="flex items-center gap-1 border-b border-border/50 px-2 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          className="h-7 flex-1 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
          placeholder="Search in PDF…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          autoFocus
        />
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Close search">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {searching && (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </div>
          )}
          {!searching && query.trim().length >= 2 && hits.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">No matches</p>
          )}
          {!searching &&
            hits.map((hit) => (
              <button
                key={`${hit.page}-${hit.index}`}
                type="button"
                className={cn(
                  "mb-1.5 w-full rounded-md border border-border/40 px-2 py-1.5 text-left text-[11px]",
                  "hover:border-primary/40 hover:bg-muted/50"
                )}
                onClick={() => onSelectHit(hit)}
              >
                <span className="font-medium text-primary">p.{hit.page}</span>
                <p className="mt-0.5 line-clamp-2 text-muted-foreground">{hit.snippet}</p>
              </button>
            ))}
          {query.trim().length < 2 && !searching && (
            <p className="py-4 text-center text-xs text-muted-foreground">Type 2+ characters</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
