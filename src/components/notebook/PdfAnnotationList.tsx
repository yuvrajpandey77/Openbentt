import { ScrollArea } from "@/components/ui/scroll-area";
import type { PdfAnnotation } from "@/types/researchProject";
import { cn } from "@/lib/utils";
import { Highlighter } from "lucide-react";

type PdfAnnotationListProps = {
  annotations: PdfAnnotation[];
  currentPage: number;
  onSelectPage: (page: number) => void;
};

/** Stub panel listing saved PDF annotations (highlights / notes). */
export function PdfAnnotationList({ annotations, currentPage, onSelectPage }: PdfAnnotationListProps) {
  if (!annotations.length) {
    return (
      <div className="border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
        No annotations yet — use Highlight mode to mark passages.
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-border/50 bg-muted/20">
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Highlighter className="h-3 w-3" />
        Annotations ({annotations.length})
      </div>
      <ScrollArea className="max-h-28">
        <div className="space-y-1 px-2 pb-2">
          {annotations.map((ann) => (
            <button
              key={ann.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px]",
                ann.page === currentPage ? "bg-primary/10 text-foreground" : "hover:bg-muted/60 text-muted-foreground"
              )}
              onClick={() => onSelectPage(ann.page)}
            >
              <span className="shrink-0 tabular-nums text-primary">p.{ann.page}</span>
              <span className="truncate capitalize">{ann.kind}</span>
              {ann.text && <span className="truncate opacity-70">— {ann.text}</span>}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
