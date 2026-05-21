import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LatexCompileDiagnostic } from "@/lib/latexErrorUi";
import {
  notebookLanguageExtensions,
  type NotebookEditorLanguage,
} from "@/lib/codemirror/notebookLanguages";
import { openbenttEditorTheme, openbenttSyntaxHighlighting } from "@/lib/codemirror/openbenttEditorTheme";
import { cn } from "@/lib/utils";
import { Wand2 } from "lucide-react";

const LINE_HEIGHT_PX = 19.5;

export type NotebookEditorHandle = {
  insertSnippet: (snippet: string, cursorOffset?: number) => void;
  focus: () => void;
  goToLine: (line: number) => void;
};

type NotebookLatexEditorProps = {
  value: string;
  onChange: (v: string) => void;
  diagnostics?: LatexCompileDiagnostic[];
  onFixDiagnostic?: (diag: LatexCompileDiagnostic) => void;
  editorFileLabel: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  busy?: boolean;
  fontSize?: number;
  language?: NotebookEditorLanguage;
  useCodeMirror?: boolean;
  wordWrap?: boolean;
  showLineNumbers?: boolean;
};

function errorLineDecorations(lines: Set<number>) {
  const lineMark = Decoration.line({ class: "cm-openbentt-error-line" });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      constructor(view: EditorView) {
        this.decorations = buildErrorDecorations(view, lines, lineMark);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildErrorDecorations(update.view, lines, lineMark);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
}

function buildErrorDecorations(
  view: EditorView,
  lines: Set<number>,
  lineMark: Decoration
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const lineNo of lines) {
    if (lineNo < 1 || lineNo > view.state.doc.lines) continue;
    const line = view.state.doc.line(lineNo);
    builder.add(line.from, line.from, lineMark);
  }
  return builder.finish();
}

export const NotebookLatexEditor = forwardRef<NotebookEditorHandle, NotebookLatexEditorProps>(
  function NotebookLatexEditor(
    {
      value,
      onChange,
      diagnostics = [],
      onFixDiagnostic,
      editorFileLabel,
      textareaRef: externalRef,
      busy,
      fontSize = 12,
      language = "latex",
      useCodeMirror = true,
      wordWrap = true,
      showLineNumbers = true,
    },
    ref
  ) {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const textareaRef = externalRef ?? internalRef;
    const gutterRef = useRef<HTMLDivElement>(null);
    const highlightRef = useRef<HTMLPreElement>(null);
    const cmRef = useRef<ReactCodeMirrorRef>(null);

    const lines = useMemo(() => value.split("\n"), [value]);
    const errorLineSet = useMemo(() => new Set(diagnostics.map((d) => d.line)), [diagnostics]);
    const diagByLine = useMemo(() => {
      const m = new Map<number, LatexCompileDiagnostic>();
      for (const d of diagnostics) m.set(d.line, d);
      return m;
    }, [diagnostics]);

    const syncTextareaScroll = useCallback(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const top = ta.scrollTop;
      if (gutterRef.current) gutterRef.current.scrollTop = top;
      if (highlightRef.current) highlightRef.current.scrollTop = top;
    }, [textareaRef]);

    const syncCmGutterScroll = useCallback(() => {
      const view = cmRef.current?.view;
      if (!view || !gutterRef.current) return;
      gutterRef.current.scrollTop = view.scrollDOM.scrollTop;
    }, []);

    useEffect(() => {
      if (useCodeMirror) return;
      const ta = textareaRef.current;
      if (!ta) return;
      ta.addEventListener("scroll", syncTextareaScroll);
      return () => ta.removeEventListener("scroll", syncTextareaScroll);
    }, [syncTextareaScroll, textareaRef, useCodeMirror]);

    useImperativeHandle(
      ref,
      () => ({
        insertSnippet(snippet: string, cursorOffset = snippet.length) {
          const view = cmRef.current?.view;
          if (view) {
            const { from, to } = view.state.selection.main;
            view.dispatch({
              changes: { from, to, insert: snippet },
              selection: { anchor: from + cursorOffset },
            });
            view.focus();
            return;
          }
          const ta = textareaRef.current;
          if (!ta) {
            onChange(value + snippet);
            return;
          }
          const start = ta.selectionStart ?? value.length;
          const end = ta.selectionEnd ?? start;
          const next = value.slice(0, start) + snippet + value.slice(end);
          onChange(next);
          requestAnimationFrame(() => {
            ta.focus();
            const pos = start + cursorOffset;
            ta.setSelectionRange(pos, pos);
          });
        },
        goToLine(line: number) {
          const view = cmRef.current?.view;
          if (view) {
            const n = Math.min(Math.max(1, line), view.state.doc.lines);
            const docLine = view.state.doc.line(n);
            view.dispatch({
              selection: { anchor: docLine.from },
              effects: EditorView.scrollIntoView(docLine.from, { y: "center" }),
            });
            view.focus();
            syncCmGutterScroll();
            return;
          }
          const ta = textareaRef.current;
          if (!ta) return;
          let pos = 0;
          for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
          ta.focus({ preventScroll: true });
          ta.setSelectionRange(pos, pos);
          ta.scrollTop = Math.max(0, (line - 3) * LINE_HEIGHT_PX);
          syncTextareaScroll();
        },
        focus() {
          cmRef.current?.view?.focus();
          textareaRef.current?.focus();
        },
      }),
      [lines, onChange, syncCmGutterScroll, syncTextareaScroll, textareaRef, value]
    );

    useEffect(() => {
      if (!diagnostics.length) return;
      const first = diagnostics[0]?.line;
      if (!first) return;

      const view = cmRef.current?.view;
      if (view && useCodeMirror) {
        const line = view.state.doc.line(Math.min(first, view.state.doc.lines));
        view.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, { y: "center" }),
        });
        view.focus();
        syncCmGutterScroll();
        return;
      }

      const ta = textareaRef.current;
      if (!ta) return;
      let pos = 0;
      for (let i = 0; i < first - 1 && i < lines.length; i++) pos += lines[i].length + 1;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(pos, pos);
      ta.scrollTop = Math.max(0, (first - 3) * LINE_HEIGHT_PX);
      syncTextareaScroll();
    }, [diagnostics, lines, syncCmGutterScroll, syncTextareaScroll, textareaRef, useCodeMirror]);

    const cmExtensions = useMemo(
      () => [
        openbenttEditorTheme,
        openbenttSyntaxHighlighting,
        ...notebookLanguageExtensions(language, { wordWrap, fontSize }),
        errorLineDecorations(errorLineSet),
        EditorView.theme({
          ".cm-openbentt-error-line": {
            backgroundColor: "hsl(var(--destructive) / 0.15)",
          },
        }),
      ],
      [errorLineSet, fontSize, language, wordWrap]
    );

    const primaryDiag = diagnostics[0];

    const gutter = showLineNumbers ? (
      <div
        ref={gutterRef}
        className="h-full shrink-0 overflow-y-auto overflow-x-hidden border-r border-border/50 bg-muted/40 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
    ) : null;

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
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-md border border-border/60 bg-background">
          {gutter}
          {useCodeMirror ? (
            <div className="relative min-h-0 min-w-0 flex-1 h-full overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-scroller]:overflow-auto">
              <CodeMirror
                ref={cmRef}
                value={value}
                height="100%"
                className="absolute inset-0 h-full"
                theme="none"
                extensions={cmExtensions}
                onChange={(v) => onChange(v)}
                onCreateEditor={(view) => {
                  view.scrollDOM.addEventListener("scroll", syncCmGutterScroll);
                }}
                basicSetup={{
                  lineNumbers: false,
                  foldGutter: false,
                  highlightActiveLine: true,
                  highlightSelectionMatches: false,
                  autocompletion: false,
                  drawSelection: true,
                  dropCursor: true,
                  indentOnInput: false,
                  syntaxHighlighting: false,
                }}
                aria-label={`${editorFileLabel} editor`}
              />
            </div>
          ) : (
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
                onScroll={syncTextareaScroll}
                className="relative min-h-0 h-full resize-none border-0 bg-transparent font-mono leading-relaxed shadow-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.625 }}
                placeholder="Full LaTeX (\\documentclass …) or plain text with page markers."
                spellCheck={false}
                aria-label={`${editorFileLabel} editor`}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);
