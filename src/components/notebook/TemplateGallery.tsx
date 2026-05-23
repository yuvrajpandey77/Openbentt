import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  filterCatalogEntries,
  loadTemplateCatalog,
  type TemplateCatalogEntry,
} from "@/lib/research/templateCatalog";
import { cn } from "@/lib/utils";
import { LayoutTemplate, Loader2, Search } from "lucide-react";

type TemplateGalleryProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (entry: TemplateCatalogEntry) => void;
  applying?: boolean;
};

export function TemplateGallery({ open, onOpenChange, onApply, applying }: TemplateGalleryProps) {
  const [entries, setEntries] = useState<TemplateCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TemplateCatalogEntry | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void loadTemplateCatalog()
      .then((cat) => {
        if (!cancelled) setEntries(cat.templates);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (!entries.length) return [];
    return filterCatalogEntries({ version: "1", templates: entries }, query);
  }, [entries, query]);

  const handleApply = useCallback(() => {
    if (!selected) return;
    onApply(selected);
  }, [onApply, selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/50 px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <LayoutTemplate className="h-4 w-4" />
            Template gallery
          </DialogTitle>
          <DialogDescription>
            {entries.length > 0 ? `${entries.length} LaTeX starters — applies multi-file scaffolds to this project.` : "Loading catalog…"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
            placeholder="Filter by name or tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ScrollArea className="h-[min(52vh,420px)]">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading templates…
            </div>
          )}
          {!loading && (
            <div className="grid gap-1 p-2 sm:grid-cols-2">
              {filtered.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={cn(
                    "rounded-lg border border-border/50 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/40",
                    selected?.id === entry.id && "border-primary bg-primary/5"
                  )}
                  onClick={() => setSelected(entry)}
                >
                  <p className="text-sm font-medium leading-tight">{entry.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{entry.description}</p>
                  {entry.requiresLocalTex && (
                    <span className="mt-1 inline-block rounded bg-amber-500/15 px-1 text-[9px] text-amber-700 dark:text-amber-300">
                      Local TeX
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="flex items-center justify-end gap-2 border-t border-border/50 px-4 py-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!selected || applying} onClick={handleApply}>
            {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Apply template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
