import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { useChat } from "@/context/ChatContext";
import { buildAssistantPlainText } from "@/lib/assistantPlainText";
import { extractNotebookSourceFromPdf } from "@/lib/pdfText";
import { renderPdfPages } from "@/lib/pdfCanvasRender";
import { compileNotebookSourceToPdf } from "@/lib/compileNotebook";
import { getLatexCompileEndpoint } from "@/lib/latexCompileClient";
import { isLatexDocumentSource } from "@/lib/notebookSourceKind";
import { NOTEBOOK_LATEX_BOOK_TEMPLATE } from "@/lib/notebookLatexTemplate";
import { extractTexFromAssistantReply } from "@/lib/extractTexFromAssistantReply";
import { diffLineRows, mergeProposalLines } from "@/lib/diffLines";
import {
  BookOpen,
  Check,
  Download,
  FileText,
  FileType,
  FileUp,
  GitCompare,
  Loader2,
  PlayCircle,
  RotateCcw,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MainTab = "preview" | "source" | "review";
/** Which PDF bytes drive the canvas — original upload vs text-compiled (images/layout only on Original). */
type PreviewVariant = "original" | "compiled";

const ZOOM_MIN = 0.65;
const ZOOM_MAX = 2.25;
const ZOOM_STEP = 0.15;
const ZOOM_DEFAULT = 1.1;

const NotebookPdfWorkspace: React.FC = () => {
  const { toast } = useToast();
  const { chats, currentChatId } = useChat();

  const [fileName, setFileName] = useState<string | null>(null);
  const [originalBytes, setOriginalBytes] = useState<ArrayBuffer | null>(null);
  const [compiledBytes, setCompiledBytes] = useState<ArrayBuffer | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [proposedText, setProposedText] = useState<string | null>(null);
  const [lineInclude, setLineInclude] = useState<boolean[]>([]);
  const [mainTab, setMainTab] = useState<MainTab>("preview");
  const [busy, setBusy] = useState(false);
  const [pdfScale, setPdfScale] = useState(ZOOM_DEFAULT);
  const [previewVariant, setPreviewVariant] = useState<PreviewVariant>("original");

  const previewRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const texRef = useRef<HTMLInputElement>(null);

  const isLatexSource = useMemo(() => isLatexDocumentSource(sourceText), [sourceText]);
  const latexCompileConfigured = getLatexCompileEndpoint() != null;

  const previewBuffer = useMemo(() => {
    if (!originalBytes && compiledBytes) return compiledBytes;
    if (previewVariant === "compiled" && compiledBytes) return compiledBytes;
    return originalBytes;
  }, [previewVariant, compiledBytes, originalBytes]);

  useEffect(() => {
    if (!originalBytes && compiledBytes) setPreviewVariant("compiled");
  }, [originalBytes, compiledBytes]);

  const proposedLines = useMemo(() => (proposedText ?? "").split("\n"), [proposedText]);

  useEffect(() => {
    if (!proposedText) {
      setLineInclude([]);
      return;
    }
    const lines = proposedText.split("\n");
    setLineInclude(lines.map(() => true));
  }, [proposedText]);

  const lastAssistantPlain = useMemo(() => {
    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat?.messages.length) return "";
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      if (m.role === "assistant") return buildAssistantPlainText(m);
    }
    return "";
  }, [chats, currentChatId]);

  const lastReplyExtracted = useMemo(
    () => extractTexFromAssistantReply(lastAssistantPlain),
    [lastAssistantPlain]
  );

  const canUseReplyPreview = useMemo(() => {
    if (!lastReplyExtracted.trim()) return false;
    if (isLatexDocumentSource(lastReplyExtracted) && !latexCompileConfigured) return false;
    return true;
  }, [lastReplyExtracted, latexCompileConfigured]);

  const diffRows = useMemo(() => {
    if (proposedText == null) return [];
    return diffLineRows(sourceText, proposedText);
  }, [sourceText, proposedText]);

  const runPreviewRender = useCallback(async () => {
    const el = previewRef.current;
    if (!el || !previewBuffer) return;
    el.innerHTML = '<p class="text-sm text-muted-foreground p-6 text-center">Rendering…</p>';
    try {
      await renderPdfPages(previewBuffer, el, pdfScale);
    } catch (e) {
      el.innerHTML = "";
      toast({
        title: "PDF preview failed",
        description: e instanceof Error ? e.message : "Could not render PDF",
        variant: "destructive",
      });
    }
  }, [previewBuffer, pdfScale, toast]);

  /** Re-render when buffer/scale changes, and when returning to Preview (tab unmount clears the canvas). */
  useEffect(() => {
    if (mainTab !== "preview") return;
    void runPreviewRender();
  }, [runPreviewRender, mainTab]);

  const nudgeZoom = (delta: number) => {
    setPdfScale((s) => {
      const next = Math.round((s + delta) * 100) / 100;
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    });
  };

  const onPickPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || f.type !== "application/pdf") {
      toast({ title: "Choose a PDF", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      setOriginalBytes(buf.slice(0));
      setCompiledBytes(null);
      setPreviewVariant("original");
      setFileName(f.name);
      setProposedText(null);
      const text = await extractNotebookSourceFromPdf(f);
      setSourceText(text);
      setPdfScale(ZOOM_DEFAULT);
      setMainTab("preview");
      toast({ title: "PDF loaded" });
    } catch (err) {
      toast({
        title: "Load failed",
        description: err instanceof Error ? err.message : "error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const doCompile = useCallback(
    async (text: string) => {
      const blob = await compileNotebookSourceToPdf(text, fileName?.replace(/\.(pdf|tex)$/i, "") || "Notebook");
      const buf = await blob.arrayBuffer();
      setCompiledBytes(buf.slice(0));
      setPreviewVariant("compiled");
      setMainTab("preview");
      const kind = isLatexDocumentSource(text) ? "pdflatex PDF" : "text PDF";
      toast({
        title: "Compiled",
        description:
          originalBytes != null
            ? `${kind} ready — use Original / Compiled to compare.`
            : `${kind} ready — Preview shows the compiled output.`,
      });
    },
    [fileName, toast, originalBytes]
  );

  const compilePdf = async () => {
    setBusy(true);
    try {
      await doCompile(sourceText);
    } catch (err) {
      toast({
        title: "Compile failed",
        description: err instanceof Error ? err.message : "error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onPickTex = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const text = await f.text();
      setSourceText(text);
      setProposedText(null);
      setFileName(f.name);
      setMainTab("source");
      toast({ title: "TeX loaded", description: "Compile runs pdflatex when the LaTeX service is available." });
    } catch (err) {
      toast({
        title: "Read failed",
        description: err instanceof Error ? err.message : "error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const insertLatexTemplate = () => {
    setSourceText(NOTEBOOK_LATEX_BOOK_TEMPLATE);
    setProposedText(null);
    setMainTab("source");
    toast({ title: "LaTeX template inserted", description: "Edit the title and chapters, then Compile." });
  };

  const pullLastAssistant = () => {
    if (!lastAssistantPlain.trim()) {
      toast({ title: "No assistant reply yet" });
      return;
    }
    const extracted = extractTexFromAssistantReply(lastAssistantPlain);
    setProposedText(extracted);
    setMainTab("review");
    toast({ title: "Proposal loaded", description: "Fenced ```latex blocks are unwrapped for Review." });
  };

  const applyLastReplyAndPreview = async () => {
    if (!lastAssistantPlain.trim()) {
      toast({ title: "No assistant reply yet" });
      return;
    }
    const next = extractTexFromAssistantReply(lastAssistantPlain);
    if (!next.trim()) {
      toast({ title: "Nothing to apply", description: "The last reply was empty after extracting TeX.", variant: "destructive" });
      return;
    }
    if (isLatexDocumentSource(next) && !latexCompileConfigured) {
      toast({
        title: "LaTeX compile not available",
        description: "Run npm run latex-compile (dev) or set VITE_LATEX_COMPILE_URL.",
        variant: "destructive",
      });
      return;
    }
    setProposedText(null);
    setSourceText(next);
    setBusy(true);
    try {
      await doCompile(next);
    } catch (err) {
      toast({
        title: "Compile failed",
        description: err instanceof Error ? err.message : "error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const acceptAllProposal = async () => {
    if (proposedText == null) return;
    const next = proposedText;
    setSourceText(next);
    setProposedText(null);
    setBusy(true);
    try {
      await doCompile(next);
    } catch (err) {
      toast({
        title: "Compile failed",
        description: err instanceof Error ? err.message : "error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const acceptIncludedLines = async () => {
    if (proposedText == null) return;
    const merged = mergeProposalLines(proposedLines, lineInclude);
    setSourceText(merged);
    setProposedText(null);
    setBusy(true);
    try {
      await doCompile(merged);
    } catch (err) {
      toast({
        title: "Compile failed",
        description: err instanceof Error ? err.message : "error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const rejectProposal = () => {
    setProposedText(null);
    setMainTab("source");
  };

  const downloadBlob = (buf: ArrayBuffer, name: string) => {
    const blob = new Blob([buf], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-card px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold leading-tight">Notebook PDF</h2>
            {fileName ? (
              <p className="truncate text-[11px] text-muted-foreground" title={fileName}>
                {fileName}
                {isLatexSource && (
                  <span className="ml-1.5 rounded border border-primary/30 bg-primary/10 px-1 py-px text-[9px] font-medium uppercase text-primary">
                    LaTeX
                  </span>
                )}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">Open a PDF or .tex, or insert a LaTeX template</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => void onPickPdf(e)} />
          <input ref={texRef} type="file" accept=".tex,text/plain" className="hidden" onChange={(e) => void onPickTex(e)} />
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">PDF</span>
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => texRef.current?.click()}>
            <FileType className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">.tex</span>
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={insertLatexTemplate} disabled={busy}>
            <BookOpen className="h-3.5 w-3.5" />
            <span className="ml-1.5 hidden sm:inline">Template</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !sourceText.trim() || (isLatexSource && !latexCompileConfigured)}
            title={
              isLatexSource && !latexCompileConfigured
                ? "LaTeX needs a compile service: run npm run latex-compile (dev) or set VITE_LATEX_COMPILE_URL"
                : undefined
            }
            onClick={() => void compilePdf()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-1.5">Compile</span>
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={pullLastAssistant} disabled={!lastAssistantPlain.trim()}>
            <Sparkles className="h-3.5 w-3.5" />
            <span className="ml-1.5 hidden sm:inline">Last reply</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={busy || !canUseReplyPreview}
            title="Put the last assistant output into Source (unwraps ```latex blocks), compile, and open Preview."
            onClick={() => void applyLastReplyAndPreview()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Apply reply</span>
          </Button>
          {originalBytes && (
            <Button type="button" size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={() => downloadBlob(originalBytes, fileName || "original.pdf")}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
          {compiledBytes && (
            <Button type="button" size="sm" variant="ghost" onClick={() => downloadBlob(compiledBytes, "cogerphere-compiled.pdf")}>
              <Download className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Compiled</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border/60 bg-muted/20 px-2 py-1.5">
        <Button type="button" size="sm" variant={mainTab === "preview" ? "secondary" : "ghost"} className="h-8 gap-1.5 px-2.5" onClick={() => setMainTab("preview")}>
          <FileText className="h-3.5 w-3.5" />
          Preview
        </Button>
        <Button type="button" size="sm" variant={mainTab === "source" ? "secondary" : "ghost"} className="h-8 gap-1.5 px-2.5" onClick={() => setMainTab("source")}>
          <BookOpen className="h-3.5 w-3.5" />
          Source
        </Button>
        {proposedText != null && (
          <Button type="button" size="sm" variant={mainTab === "review" ? "secondary" : "ghost"} className="h-8 gap-1.5 px-2.5" onClick={() => setMainTab("review")}>
            <GitCompare className="h-3.5 w-3.5" />
            Review
          </Button>
        )}
      </div>

      <div className="min-h-[260px] max-h-[min(58vh,560px)]">
        {mainTab === "preview" && (
          <div className="flex h-[min(58vh,560px)] flex-col">
            {previewBuffer ? (
              <>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-2 py-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Viewer</span>
                    {compiledBytes && originalBytes ? (
                      <div className="flex rounded-md border border-border/60 bg-background/80 p-0.5 text-[10px]">
                        <Button
                          type="button"
                          size="sm"
                          variant={previewVariant === "original" ? "secondary" : "ghost"}
                          className="h-7 px-2 text-[10px]"
                          onClick={() => setPreviewVariant("original")}
                        >
                          Original
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={previewVariant === "compiled" ? "secondary" : "ghost"}
                          className="h-7 px-2 text-[10px]"
                          onClick={() => setPreviewVariant("compiled")}
                        >
                          Compiled
                        </Button>
                      </div>
                    ) : compiledBytes && !originalBytes ? (
                      <span className="text-[10px] text-muted-foreground">Compiled PDF (no original upload)</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/90 p-0.5 shadow-sm">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Zoom out"
                      onClick={() => nudgeZoom(-ZOOM_STEP)}
                      disabled={pdfScale <= ZOOM_MIN + 0.01}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <button
                      type="button"
                      className="min-w-[3.25rem] rounded px-1.5 py-1 text-center text-xs font-medium tabular-nums text-foreground hover:bg-muted/80"
                      onClick={() => setPdfScale(ZOOM_DEFAULT)}
                      title="Reset zoom"
                    >
                      {Math.round(pdfScale * 100)}%
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Zoom in"
                      onClick={() => nudgeZoom(ZOOM_STEP)}
                      disabled={pdfScale >= ZOOM_MAX - 0.01}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="bg-muted/40 p-3 md:p-4">
                    <div ref={previewRef} className="mx-auto flex max-w-full flex-col items-center gap-0 pb-2" />
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
                <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-medium text-foreground">No PDF yet</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Open a PDF for Original vs Compiled, or load / paste <strong className="font-medium">.tex</strong> and Compile for a real LaTeX PDF (run{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px]">npm run latex-compile</code> in dev).
                  </p>
                  <Button type="button" size="sm" className="mt-4" variant="secondary" onClick={() => fileRef.current?.click()}>
                    <FileUp className="mr-2 h-4 w-4" />
                    Choose PDF
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {mainTab === "source" && (
          <div className="flex h-[min(58vh,560px)] flex-col gap-2 px-3 py-3">
            <p className="text-[11px] leading-snug text-muted-foreground">
              <strong className="text-foreground">From chat:</strong> ask the assistant in the main composer for a full{" "}
              <code className="font-mono text-[10px]">.tex</code> (ideally one{" "}
              <code className="font-mono text-[10px]">```latex</code> block), then press{" "}
              <strong className="font-medium text-foreground">Apply reply</strong> in the toolbar to load Source, compile, and open Preview—no manual paste required.
            </p>
            {isLatexSource ? (
              <p className="text-[11px] leading-snug text-muted-foreground">
                <strong className="text-foreground">LaTeX mode:</strong> Compile calls <strong className="font-medium">pdflatex</strong> (real PDF with chapters, lists, TOC). In development run{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">npm run latex-compile</code> and keep TeX Live on <code className="font-mono text-[10px]">PATH</code>. Production: set{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">VITE_LATEX_COMPILE_URL</code> to your compile endpoint.
              </p>
            ) : (
              <p className="text-[11px] leading-snug text-muted-foreground">
                <strong className="text-foreground">Plain / PDF extract:</strong> keep <code className="font-mono text-[10px]">--- PDF PAGE i / n ---</code> lines so Compile maps blocks to pages (simple text PDF). For a full book layout, use the Template or paste <code className="font-mono text-[10px]">\documentclass...</code> LaTeX.
              </p>
            )}
            {isLatexSource && !latexCompileConfigured && (
              <p className="rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-950 dark:text-amber-100">
                LaTeX compile is not configured. Add <code className="font-mono text-[10px]">VITE_LATEX_COMPILE_URL</code>, or run the dev server with the local latex service (see above).
              </p>
            )}
            <Textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              className="min-h-0 flex-1 resize-none border-border/60 font-mono text-xs leading-relaxed"
              placeholder={`Full LaTeX (\\documentclass ... \\begin{document} ...) for pdflatex, OR plain text with "--- PDF PAGE i / n ---" markers from PDF extract.`}
              spellCheck={false}
            />
          </div>
        )}

        {mainTab === "review" && proposedText != null && (
          <div className="flex h-[min(58vh,560px)] flex-col gap-2 px-3 py-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={acceptAllProposal}>
                <Check className="mr-1 h-3.5 w-3.5" />
                Accept all
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={acceptIncludedLines}>
                <Check className="mr-1 h-3.5 w-3.5" />
                Selected lines
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={rejectProposal}>
                <X className="mr-1 h-3.5 w-3.5" />
                Reject
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setProposedText(null)}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Uncheck lines to drop them, then merge. Accept all replaces Source.</p>
            <ScrollArea className="max-h-36 rounded-md border border-border/60 bg-muted/20 p-2">
              <div className="space-y-0.5 font-mono text-[11px] leading-snug">
                {diffRows.map((row, i) => (
                  <div
                    key={`d-${i}`}
                    className={cn(
                      "flex items-start gap-2 rounded px-1 py-0.5",
                      row.kind === "add" && "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
                      row.kind === "remove" && "bg-rose-500/15 text-rose-900 line-through dark:text-rose-100"
                    )}
                  >
                    <span className="w-12 shrink-0 text-[10px] uppercase text-muted-foreground">{row.kind}</span>
                    <span className="min-w-0 break-words">{row.line || " "}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="text-[10px] font-medium uppercase text-muted-foreground">Proposed lines</div>
            <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/60 p-2">
              <div className="space-y-1.5">
                {proposedLines.map((line, idx) => (
                  <label key={`pl-${idx}`} className="flex cursor-pointer items-start gap-2 rounded border border-transparent px-1 py-0.5 hover:bg-muted/50">
                    <Checkbox
                      checked={lineInclude[idx] !== false}
                      onCheckedChange={(v) =>
                        setLineInclude((prev) => {
                          const next = [...prev];
                          next[idx] = v === true;
                          return next;
                        })
                      }
                      className="mt-0.5"
                    />
                    <span className="font-mono text-[11px] leading-snug text-foreground">{line || " "}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </Card>
  );
};

export default NotebookPdfWorkspace;
