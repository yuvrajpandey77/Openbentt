import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LatexCompileDiagnostic } from "@/lib/latexErrorUi";
import { cn } from "@/lib/utils";
import { Wand2 } from "lucide-react";

const LINE_HEIGHT_PX = 19.5; // text-xs leading-relaxed ≈ 12px * 1.625

type NotebookLatexEditorProps = {
  value: string;
  onChange: (v: string) => void;
  diagnostics?: LatexCompileDiagnostic[];
  onFixDiagnostic?: (diag: LatexCompileDiagnostic) => void;
  editorFileLabel: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  busy?: boolean;
};

export function NotebookLatexEditor({
  value,
  onChange,
  diagnostics = [],
  onFixDiagnostic,
  editorFileLabel,
  textareaRef: externalRef,
  busy,
}: NotebookLatexEditorProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  const lines = useMemo(() => value.split("\n"), [value]);
  const errorLineSet = useMemo(() => new Set(diagnostics.map((d) => d.line)), [diagnostics]);
  const diagByLine = useMemo(() => {
    const m = new Map<number, LatexCompileDiagnostic>();
    for (const d of diagnostics) m.set(d.line, d);
    return m;
  }, [diagnostics]);

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const top = ta.scrollTop;
    if (gutterRef.current) gutterRef.current.scrollTop = top;
    if (highlightRef.current) highlightRef.current.scrollTop = top;
  }, [textareaRef]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.addEventListener("scroll", syncScroll);
    return () => ta.removeEventListener("scroll", syncScroll);
  }, [syncScroll, textareaRef]);

  useEffect(() => {
    if (!diagnostics.length) return;
    const first = diagnostics[0]?.line;
    if (!first) return;
    const ta = textareaRef.current;
    if (!ta) return;
    let pos = 0;
    for (let i = 0; i < first - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(pos, pos);
    ta.scrollTop = Math.max(0, (first - 3) * LINE_HEIGHT_PX);
    syncScroll();
  }, [diagnostics, lines, syncScroll, textareaRef]);

  const primaryDiag = diagnostics[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      {primaryDiag && onFixDiagnostic && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-destructive/35 bg-destructive/[0.07] px-2.5 py-1.5 text-xs">
          <span className="text-destructive">
            Line <strong>{primaryDiag.line}</strong>: {primaryDiag.message.slice(0, 120)}
            {primaryDiag.message.length > 120 ? "…" : ""}
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="ml-auto h-7 gap-1 px-2 text-[11px]"
            disabled={busy}
            onClick={() => onFixDiagnostic(primaryDiag)}
          >
            <Wand2 className="h-3 w-3" />
            {primaryDiag.fixLabel}
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border/60 bg-background">
        <div
          ref={gutterRef}
          className="shrink-0 overflow-hidden border-r border-border/50 bg-muted/25 select-none"
          aria-hidden
        >
          {lines.map((_, i) => {
            const lineNo = i + 1;
            const isErr = errorLineSet.has(lineNo);
            const diag = diagByLine.get(lineNo);
            return (
              <div
                key={lineNo}
                className={cn(
                  "relative flex items-start justify-end gap-1 pr-1.5 pl-2 font-mono text-[10px] tabular-nums",
                  isErr ? "bg-destructive/20 text-destructive" : "text-muted-foreground/70"
                )}
                style={{ minHeight: LINE_HEIGHT_PX, lineHeight: `${LINE_HEIGHT_PX}px` }}
                title={diag?.message}
              >
                {isErr && (
                  <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-destructive" aria-hidden />
                )}
                {lineNo}
              </div>
            );
          })}
        </div>
        <div className="relative min-h-0 min-w-0 flex-1">
          <pre
            ref={highlightRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent p-3 font-mono text-xs leading-relaxed text-transparent"
          >
            {lines.map((line, i) => (
              <span
                key={i}
                className={cn(errorLineSet.has(i + 1) && "bg-destructive/15")}
                style={{ display: "block", minHeight: LINE_HEIGHT_PX, lineHeight: `${LINE_HEIGHT_PX}px` }}
              >
                {line || " "}
              </span>
            ))}
          </pre>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={syncScroll}
            className="relative min-h-0 h-full resize-none border-0 bg-transparent font-mono text-xs leading-relaxed shadow-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Full LaTeX (\\documentclass …) or plain text with page markers."
            spellCheck={false}
            aria-label={`${editorFileLabel} editor`}
          />
        </div>
      </div>
    </div>
  );
}
