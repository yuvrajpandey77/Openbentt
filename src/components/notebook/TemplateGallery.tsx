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
import { Badge } from "@/components/ui/badge";
import {
  featuredTemplateEntries,
  filterCatalogEntries,
  loadTemplateCatalog,
  type TemplateCatalogEntry,
} from "@/lib/research/templateCatalog";
import { cn } from "@/lib/utils";
import { CheckCircle2, LayoutTemplate, Loader2, Search, Sparkles } from "lucide-react";

export type TemplateGalleryMode = "apply" | "create";

type TemplateGalleryProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (entry: TemplateCatalogEntry) => void;
  applying?: boolean;
  mode?: TemplateGalleryMode;
  /** When creating, prefill project title from selection. */
  projectTitle?: string;
  onProjectTitleChange?: (title: string) => void;
  featuredOnly?: boolean;
};

function TemplateBadges({ entry }: { entry: TemplateCatalogEntry }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entry.verified && (
        <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">
          <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
          Verified
        </Badge>
      )}
      {entry.featured && (
        <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
          <Sparkles className="mr-0.5 h-2.5 w-2.5" />
          Featured
        </Badge>
      )}
      {entry.requiresLocalTex && (
        <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal text-primary">
          Local TeX
        </Badge>
      )}
      {!entry.requiresLocalTex && (
        <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
          WASM OK
        </Badge>
      )}
    </div>
  );
}

export function TemplateGallery({
  open,
  onOpenChange,
  onApply,
  applying,
  mode = "apply",
  projectTitle = "",
  onProjectTitleChange,
  featuredOnly = false,
}: TemplateGalleryProps) {
  const [entries, setEntries] = useState<TemplateCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TemplateCatalogEntry | null>(null);
  const [showAll, setShowAll] = useState(!featuredOnly);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void loadTemplateCatalog()
      .then((cat) => {
        if (!cancelled) {
          setEntries(showAll && !featuredOnly ? cat.templates : featuredTemplateEntries(cat));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, showAll, featuredOnly]);

  const filtered = useMemo(() => {
    if (!entries.length) return [];
    return filterCatalogEntries({ version: "1", templates: entries }, query);
  }, [entries, query]);

  const handleApply = useCallback(() => {
    if (!selected) return;
    onApply(selected);
  }, [onApply, selected]);

  const actionLabel = mode === "create" ? "Create project" : "Apply template";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/50 px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <LayoutTemplate className="h-4 w-4" />
            {mode === "create" ? "Start from template" : "Template gallery"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Pick a verified LaTeX scaffold — project opens in Notebook Studio with main.tex and references.bib."
              : entries.length > 0
                ? `${entries.length} starters — applies multi-file scaffolds to this project.`
                : "Loading catalog…"}
          </DialogDescription>
        </DialogHeader>
        {mode === "create" && onProjectTitleChange && (
          <div className="border-b border-border/40 px-4 py-2">
            <Input
              className="h-9"
              placeholder="Project name"
              value={projectTitle}
              onChange={(e) => onProjectTitleChange(e.target.value)}
            />
          </div>
        )}
        <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            className="h-8 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            placeholder="Filter by name or tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {featuredOnly && (
            <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 text-xs" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Featured" : "All packs"}
            </Button>
          )}
        </div>
        <div className="grid min-h-0 sm:grid-cols-[1fr_220px]">
          <ScrollArea className="h-[min(52vh,440px)]">
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
                    onClick={() => {
                      setSelected(entry);
                      if (mode === "create" && onProjectTitleChange && !projectTitle.trim()) {
                        onProjectTitleChange(entry.label);
                      }
                    }}
                  >
                    <p className="text-sm font-medium leading-tight">{entry.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{entry.description}</p>
                    <TemplateBadges entry={entry} />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="hidden border-l border-border/40 bg-muted/10 p-3 sm:block">
            {selected ? (
              <div className="space-y-2 text-xs">
                <p className="font-medium">{selected.label}</p>
                <p className="text-muted-foreground">{selected.description}</p>
                <TemplateBadges entry={selected} />
                <ul className="list-inside list-disc space-y-1 text-[11px] text-muted-foreground">
                  <li>Includes main.tex{selected.requiresLocalTex ? "" : " (BusyTeX-safe)"}</li>
                  <li>references.bib when citations enabled</li>
                  <li>Compile with Auto or Local TeX in ⚙️</li>
                </ul>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Select a template to preview details.</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border/50 px-4 py-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!selected || applying} onClick={handleApply}>
            {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {actionLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
