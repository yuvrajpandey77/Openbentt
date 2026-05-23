import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { useChat } from "@/context/ChatContext";
import { Check, Copy, FileCode2 } from "lucide-react";

function getTextFromNode(node: React.ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextFromNode).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    if (props?.children != null) return getTextFromNode(props.children);
  }
  return "";
}

/**
 * Fenced code block with Copy + optional “Insert in LaTeX” (Notebook Source + optional compile).
 */
export const MarkdownCodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { requestNotebookLatexInsert } = useChat();

  const { language, codeText } = useMemo(() => {
    try {
      const child = React.Children.only(children);
      if (!React.isValidElement(child)) {
        return { language: "", codeText: getTextFromNode(children) };
      }
      const cls = String((child.props as { className?: string }).className || "");
      const langM = /language-([\w-]+)/.exec(cls);
      const language = langM?.[1] ?? "";
      const inner = (child.props as { children?: React.ReactNode }).children;
      const codeText = getTextFromNode(inner);
      return { language, codeText };
    } catch {
      return { language: "", codeText: getTextFromNode(children) };
    }
  }, [children]);

  const looksLatexFence =
    language === "latex" ||
    language === "tex" ||
    (!language && /\\(documentclass|begin\s*\{\s*document\s*\})/.test(codeText.slice(0, 1200)));

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Clipboard is not available.", variant: "destructive" });
    }
  }, [codeText, toast]);

  const onInsertLatex = useCallback(() => {
    requestNotebookLatexInsert(codeText, { autoCompile: true });
    navigate("/notebook");
  }, [codeText, navigate, requestNotebookLatexInsert]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="my-3 overflow-hidden rounded-lg border border-border/60 bg-muted/50">
        <div className="flex items-center border-b border-border/50 bg-muted/80 px-2 py-1">
          {language ? (
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{language}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">code</span>
          )}
        </div>
        <div className="overflow-x-auto p-3 text-xs leading-relaxed text-foreground [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[0.95em] [&_code]:text-foreground">
          {children}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 border-t border-border/50 bg-muted/80 px-2 py-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={onCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          {looksLatexFence && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px] text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={onInsertLatex}
                >
                  <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                  Insert in LaTeX
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                Jump to Notebook, replace Source with this block, and compile when the document is complete LaTeX.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};
