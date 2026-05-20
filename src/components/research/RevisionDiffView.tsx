import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { diffLineRows, type LineDiffRow } from "@/lib/diffLines";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import { useMemo } from "react";

type RevisionDiffViewProps = {
  before: string;
  after: string;
  title?: string;
  onAccept: () => void;
  onReject: () => void;
  acceptLabel?: string;
  rejectLabel?: string;
  compact?: boolean;
};

function DiffRow({ row }: { row: LineDiffRow }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded px-1 py-0.5 font-mono text-[11px] leading-snug",
        row.kind === "add" && "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
        row.kind === "remove" && "bg-rose-500/15 text-rose-900 line-through dark:text-rose-100",
        row.kind === "equal" && "text-muted-foreground"
      )}
    >
      <span className="w-10 shrink-0 text-[9px] uppercase opacity-70">
        {row.kind === "equal" ? " " : row.kind}
      </span>
      <span className="min-w-0 break-words">{row.line || " "}</span>
    </div>
  );
}

export function RevisionDiffView({
  before,
  after,
  title = "Suggested change",
  onAccept,
  onReject,
  acceptLabel = "Accept change",
  rejectLabel = "Reject",
  compact = false,
}: RevisionDiffViewProps) {
  const rows = useMemo(() => diffLineRows(before, after), [before, after]);
  const hasChanges = rows.some((r) => r.kind !== "equal");

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/10",
        compact ? "p-2" : "p-3"
      )}
      role="region"
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={onAccept} disabled={!hasChanges}>
            <Check className="h-3.5 w-3.5" />
            {acceptLabel}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onReject}>
            <X className="h-3.5 w-3.5" />
            {rejectLabel}
          </Button>
        </div>
      </div>
      <ScrollArea className={cn("rounded-md border border-border/50 bg-background/80", compact ? "h-32" : "h-48")}>
        <div className="space-y-0.5 p-2">
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No textual changes.</p>
          ) : (
            rows.map((row, i) => <DiffRow key={i} row={row} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
