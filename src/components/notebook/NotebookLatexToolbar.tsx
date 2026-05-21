import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Bold, Italic, Heading2, Sigma, List, Table2, ImageIcon, Quote } from "lucide-react";

type NotebookLatexToolbarProps = {
  onInsert: (snippet: string, cursorOffset?: number) => void;
  onInsertAsset?: () => void;
  bibKeys?: string[];
};

export function NotebookLatexToolbar({ onInsert, onInsertAsset, bibKeys = [] }: NotebookLatexToolbarProps) {
  const wrap = (before: string, after: string, placeholder = "") => {
    onInsert(`${before}${placeholder}${after}`, before.length);
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border/50 bg-muted/20 px-1 py-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => wrap("\\textbf{", "}", "text")}>
            <Bold className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Bold (\textbf)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => wrap("\\textit{", "}", "text")}>
            <Italic className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Italic (\textit)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onInsert("\\section{Title}\n")}
          >
            <Heading2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Section</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onInsert("\\[\n  \n\\]\n", 3)}
          >
            <Sigma className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Equation block</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onInsert("\\begin{itemize}\n  \\item \n\\end{itemize}\n", 22)}
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Itemize list</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() =>
              onInsert(
                "\\begin{table}[htbp]\n\\centering\n\\begin{tabular}{lcc}\n\\toprule\n &  &  \\\\\n\\midrule\n &  &  \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{Caption}\n\\end{table}\n",
                80
              )
            }
          >
            <Table2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Table template</TooltipContent>
      </Tooltip>
      {onInsertAsset && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onInsertAsset}>
              <ImageIcon className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Insert figure from assets</TooltipContent>
        </Tooltip>
      )}
      {bibKeys[0] && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onInsert(`\\cite{${bibKeys[0]}}`)}
            >
              <Quote className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cite ({bibKeys[0]})</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
