import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CONNECTION_CAPS } from "@/lib/research/connectionCaps";
import { Link2 } from "lucide-react";

type ContextSourcesPopoverProps = {
  texFileKeys: string[];
  pdfPaperIds: string[];
  texLabel: (key: string) => string;
  pdfLabel: (id: string) => string;
  onDisconnectTex: (key: string) => void;
  onDisconnectPdf: (id: string) => void;
};

export function ContextSourcesPopover({
  texFileKeys,
  pdfPaperIds,
  texLabel,
  pdfLabel,
  onDisconnectTex,
  onDisconnectPdf,
}: ContextSourcesPopoverProps) {
  const total = texFileKeys.length + pdfPaperIds.length;
  if (total === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[10px]">
          <Link2 className="h-3 w-3" />
          Sources ({total})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 text-xs" align="start">
        <p className="mb-2 font-medium text-foreground">Chat context sources</p>
        <ul className="space-y-1">
          {texFileKeys.map((key) => (
            <li key={key} className="flex items-center justify-between gap-2 rounded bg-primary/10 px-2 py-1">
              <span className="truncate text-primary">LaTeX · {texLabel(key)}</span>
              <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onDisconnectTex(key)}>
                ×
              </button>
            </li>
          ))}
          {pdfPaperIds.map((id) => (
            <li key={id} className="flex items-center justify-between gap-2 rounded bg-primary/10 px-2 py-1">
              <span className="truncate text-primary">PDF · {pdfLabel(id)}</span>
              <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onDisconnectPdf(id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Caps: {CONNECTION_CAPS.maxTexFileKeys} LaTeX · {CONNECTION_CAPS.maxPdfPaperIds} PDF
        </p>
      </PopoverContent>
    </Popover>
  );
}
