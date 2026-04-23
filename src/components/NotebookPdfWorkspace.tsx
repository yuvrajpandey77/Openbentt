import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { useChat } from "@/context/ChatContext";
import { buildAssistantPlainText } from "@/lib/assistantPlainText";
import { extractNotebookSourceFromPdf } from "@/lib/pdfText";
import { renderPdfPages } from "@/lib/pdfCanvasRender";
import { compileNotebookSourceToPdf } from "@/lib/compileNotebook";
import { formatCompileFailureToast } from "@/lib/latexErrorUi";
import { applyNotebookLatexAutofix } from "@/lib/notebookLatexAutofix";
import { isLatexDocumentSource } from "@/lib/notebookSourceKind";
import { NOTEBOOK_LATEX_BOOK_TEMPLATE } from "@/lib/notebookLatexTemplate";
import { extractTexFromAssistantReply } from "@/lib/extractTexFromAssistantReply";
import { diffLineRows, mergeProposalLines } from "@/lib/diffLines";
import { buildNotebookFullWorkspaceAssist } from "@/lib/notebookChatContext";
import { buildNotebookLatexFixPrompt, type NotebookLatexFailureSource } from "@/lib/notebookLatexFixPrompt";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  ArrowDownToLine,
  ArrowRightCircle,
  BookOpen,
  CheckCheck,
  Download,
  FileCode2,
  FileText,
  FileUp,
  GitCompare,
  LayoutTemplate,
  ListChecks,
  Loader2,
  MessageSquareQuote,
  RotateCcw,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MainTab = "preview" | "source";
/** Which PDF bytes drive the canvas — original upload vs text-compiled (images/layout only on Original). */
type PreviewVariant = "original" | "compiled";

const ZOOM_MIN = 0.65;
const ZOOM_MAX = 2.25;
const ZOOM_STEP = 0.15;
const ZOOM_DEFAULT = 1.1;

const NotebookPdfWorkspace: React.FC = () => {
  const { toast } = useToast();
  const {
    chats,
    currentChatId,
    setWorkspaceRouteAssist,
    registerNotebookAssistSync,
    notebookLatexInsertRequest,
    clearNotebookLatexInsertRequest,
    queuePromptInComposer,
  } = useChat();

  const [fileName, setFileName] = useState<string | null>(null);
  const [originalBytes, setOriginalBytes] = useState<ArrayBuffer | null>(null);
  const [compiledBytes, setCompiledBytes] = useState<ArrayBuffer | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [proposedText, setProposedText] = useState<string | null>(null);
  const [lineInclude, setLineInclude] = useState<boolean[]>([]);
  const [mainTab, setMainTab] = useState<MainTab>("preview");
  const [busy, setBusy] = useState(false);
  /** Offer “Apply fixes & recompile” after bad PDF output or failed LaTeX compile. */
  const [latexRecovery, setLatexRecovery] = useState(false);
  /** Last failure message for the same “ask chat to fix” path as the recovery bar (cleared on successful compile). */
  const [lastLatexFailure, setLastLatexFailure] = useState<{
    raw: string;
    source: NotebookLatexFailureSource;
  } | null>(null);
  const [pdfScale, setPdfScale] = useState(ZOOM_DEFAULT);
  const [previewVariant, setPreviewVariant] = useState<PreviewVariant>("original");

  const previewRef = useRef<HTMLDivElement>(null);
  /** Scroll container for PDF preview (wheel zoom + scroll anchoring). */
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const pdfScaleRef = useRef(pdfScale);
  const pendingPdfZoomRef = useRef<{
    ox: number;
    oy: number;
    px: number;
    py: number;
    prevScale: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const texRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pdfScaleRef.current = pdfScale;
  }, [pdfScale]);

  const isLatexSource = useMemo(() => isLatexDocumentSource(sourceText), [sourceText]);

  /** Debounce Source in system context so typing does not rewrite a huge string every keystroke. */
  const debouncedSourceForAssist = useDebouncedValue(sourceText, 400);

  const previewBuffer = useMemo(() => {
    if (!originalBytes && compiledBytes) return compiledBytes;
    if (previewVariant === "compiled" && compiledBytes) return compiledBytes;
    return originalBytes;
  }, [previewVariant, compiledBytes, originalBytes]);

  useEffect(() => {
    if (!originalBytes && compiledBytes) setPreviewVariant("compiled");
  }, [originalBytes, compiledBytes]);

  const proposedLines = useMemo(() => (proposedText ?? "").split("\n"), [proposedText]);

  const notebookAssistParams = useMemo(
    () => ({
      fileName,
      sourceText: debouncedSourceForAssist,
      hasOriginalPdf: originalBytes != null,
      hasCompiledPdf: compiledBytes != null,
      previewVariant,
      mainTab,
      hasProposal: proposedText != null,
      proposedLineCount: proposedLines.length,
      isLatexSource,
    }),
    [
      compiledBytes,
      debouncedSourceForAssist,
      fileName,
      isLatexSource,
      mainTab,
      originalBytes,
      previewVariant,
      proposedLines.length,
      proposedText,
    ]
  );

  useEffect(() => {
    setWorkspaceRouteAssist(buildNotebookFullWorkspaceAssist(notebookAssistParams));
  }, [notebookAssistParams, setWorkspaceRouteAssist]);

  const notebookAssistParamsLive = useMemo(
    () => ({
      fileName,
      sourceText,
      hasOriginalPdf: originalBytes != null,
      hasCompiledPdf: compiledBytes != null,
      previewVariant,
      mainTab,
      hasProposal: proposedText != null,
      proposedLineCount: proposedLines.length,
      isLatexSource,
    }),
    [
      compiledBytes,
      fileName,
      isLatexSource,
      mainTab,
      originalBytes,
      previewVariant,
      proposedLines.length,
      proposedText,
      sourceText,
    ]
  );

  const getLatestNotebookAssist = useCallback(
    () => buildNotebookFullWorkspaceAssist(notebookAssistParamsLive),
    [notebookAssistParamsLive]
  );

  useEffect(() => {
    registerNotebookAssistSync(getLatestNotebookAssist);
    return () => registerNotebookAssistSync(null);
  }, [getLatestNotebookAssist, registerNotebookAssistSync]);

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

  const canUseReplyPreview = useMemo(() => lastReplyExtracted.trim().length > 0, [lastReplyExtracted]);

  const diffRows = useMemo(() => {
    if (proposedText == null) return [];
    return diffLineRows(sourceText, proposedText);
  }, [sourceText, proposedText]);

  const runPreviewRender = useCallback(async () => {
    const el = previewRef.current;
    const scrollEl = pdfScrollRef.current;
    if (!el || !previewBuffer) return;
    el.innerHTML = '<p class="text-sm text-muted-foreground p-6 text-center">Rendering…</p>';
    try {
      await renderPdfPages(previewBuffer, el, pdfScale);
      setLatexRecovery(false);
      setLastLatexFailure(null);
      const pending = pendingPdfZoomRef.current;
      if (pending && scrollEl && Math.abs(pending.prevScale - pdfScale) > 1e-6) {
        const r = pdfScale / pending.prevScale;
        scrollEl.scrollLeft = Math.max(0, pending.ox * r - pending.px);
        scrollEl.scrollTop = Math.max(0, pending.oy * r - pending.py);
      }
      pendingPdfZoomRef.current = null;
    } catch (e) {
      el.innerHTML = "";
      pendingPdfZoomRef.current = null;
      const msg = e instanceof Error ? e.message : String(e);
      if (isLatexSource) {
        setLatexRecovery(true);
        setLastLatexFailure({ raw: msg, source: "pdf_render" });
      }
      toast({
        title: "PDF preview failed",
        description: msg,
        variant: "destructive",
      });
    }
  }, [previewBuffer, pdfScale, toast, isLatexSource]);

  /** Re-render when buffer/scale changes, and when returning to Preview (tab unmount clears the canvas). */
  useEffect(() => {
    if (mainTab !== "preview") return;
    void runPreviewRender();
  }, [runPreviewRender, mainTab]);

  /** Ctrl/Cmd + wheel: zoom toward cursor (requires non-passive listener). */
  useEffect(() => {
    if (mainTab !== "preview" || !previewBuffer) return;
    const el = pdfScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const prevScale = pdfScaleRef.current;
      const factor = Math.exp(-e.deltaY * 0.002);
      const next = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevScale * factor)) * 100) / 100;
      if (next === prevScale) return;
      const rect = el.getBoundingClientRect();
      pendingPdfZoomRef.current = {
        ox: e.clientX - rect.left + el.scrollLeft,
        oy: e.clientY - rect.top + el.scrollTop,
        px: e.clientX - rect.left,
        py: e.clientY - rect.top,
        prevScale,
      };
      setPdfScale(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mainTab, previewBuffer]);

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
      setLastLatexFailure(null);
      setPdfScale(ZOOM_DEFAULT);
      setMainTab("preview");
      const extractionLimited =
        text.includes("further page(s) not included") ||
        text.includes("Source truncated at") ||
        text.includes("truncated at");
      toast({
        title: "PDF loaded",
        description: extractionLimited
          ? "Text in Source may be capped for very large PDFs — see any [Note:] at the bottom of Source."
          : undefined,
      });
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
      setLatexRecovery(false);
      setLastLatexFailure(null);
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

  const runAutofixAndRecompile = useCallback(async () => {
    if (!isLatexDocumentSource(sourceText)) {
      toast({ title: "Autofix applies to LaTeX source", description: "Switch Source to a full LaTeX document, then try again." });
      return;
    }
    const next = applyNotebookLatexAutofix(sourceText);
    setSourceText(next);
    setBusy(true);
    try {
      await doCompile(next);
    } catch (err) {
      setLatexRecovery(true);
      setLastLatexFailure({
        raw: err instanceof Error ? err.message : String(err),
        source: "compile",
      });
      const { title, description } = formatCompileFailureToast(err);
      toast({ title, description, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [sourceText, doCompile, toast]);

  const loadFixPromptInChat = useCallback(() => {
    if (!lastLatexFailure?.raw) {
      toast({
        title: "No captured error",
        description: "Compile (or use Apply reply) so a failure is recorded, then try this again.",
        variant: "destructive",
      });
      return;
    }
    queuePromptInComposer(
      buildNotebookLatexFixPrompt({
        sourceText,
        errorRaw: lastLatexFailure.raw,
        failure: lastLatexFailure.source,
      })
    );
  }, [lastLatexFailure, sourceText, queuePromptInComposer, toast]);

  /** Chat code blocks → Notebook Source (+ optional compile). */
  useEffect(() => {
    const req = notebookLatexInsertRequest;
    if (!req) return;
    clearNotebookLatexInsertRequest();
    setSourceText(req.latex);
    setProposedText(null);
    setMainTab("source");
    if (req.autoCompile === false) {
      toast({ title: "Inserted in Notebook", description: "Review Source, then Compile." });
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        await doCompile(req.latex);
      } catch (err) {
        if (isLatexDocumentSource(req.latex)) setLatexRecovery(true);
        setLastLatexFailure({
          raw: err instanceof Error ? err.message : String(err),
          source: "compile",
        });
        const { title, description } = formatCompileFailureToast(err);
        toast({ title, description, variant: "destructive" });
      } finally {
        setBusy(false);
      }
    })();
  }, [notebookLatexInsertRequest?.id, clearNotebookLatexInsertRequest, doCompile, toast]);

  const compilePdf = async () => {
    setBusy(true);
    try {
      await doCompile(sourceText);
    } catch (err) {
      if (isLatexSource) setLatexRecovery(true);
      setLastLatexFailure({
        raw: err instanceof Error ? err.message : String(err),
        source: "compile",
      });
      const { title, description } = formatCompileFailureToast(err);
      toast({ title, description, variant: "destructive" });
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
      setLastLatexFailure(null);
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
    toast({ title: "Proposal loaded", description: "Review panel → fenced ```latex blocks unwrapped." });
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
    setProposedText(null);
    setSourceText(next);
    setBusy(true);
    try {
      await doCompile(next);
    } catch (err) {
      if (isLatexDocumentSource(next)) setLatexRecovery(true);
      setLastLatexFailure({
        raw: err instanceof Error ? err.message : String(err),
        source: "compile",
      });
      const { title, description } = formatCompileFailureToast(err);
      toast({ title, description, variant: "destructive" });
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
      if (isLatexDocumentSource(next)) setLatexRecovery(true);
      setLastLatexFailure({
        raw: err instanceof Error ? err.message : String(err),
        source: "compile",
      });
      const { title, description } = formatCompileFailureToast(err);
      toast({ title, description, variant: "destructive" });
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
      if (isLatexDocumentSource(merged)) setLatexRecovery(true);
      setLastLatexFailure({
        raw: err instanceof Error ? err.message : String(err),
        source: "compile",
      });
      const { title, description } = formatCompileFailureToast(err);
      toast({ title, description, variant: "destructive" });
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

  const [splitDirection, setSplitDirection] = useState<"horizontal" | "vertical">(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? "horizontal" : "vertical"
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setSplitDirection(mq.matches ? "horizontal" : "vertical");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const showReviewPanel = proposedText != null;

  const reviewColumn = (
    <div className="flex h-full min-h-0 flex-col border-border/40 bg-muted/5 lg:border-l">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <GitCompare className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold leading-tight">Review</h3>
          <p className="truncate text-[10px] text-muted-foreground">Diff vs Source · merge proposal</p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 py-2">
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="default" className="h-8 w-8" onClick={acceptAllProposal} aria-label="Accept all proposed lines">
                  <CheckCheck className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Accept all (replace Source)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="secondary" className="h-8 w-8" onClick={acceptIncludedLines} aria-label="Merge selected lines">
                  <ListChecks className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Merge checked lines only</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={rejectProposal} aria-label="Reject proposal">
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reject · back to Source only</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setProposedText(null)} aria-label="Clear proposal">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear proposal</TooltipContent>
            </Tooltip>
          </div>
          <p className="shrink-0 px-0.5 text-[10px] leading-snug text-muted-foreground">
            Uncheck lines to exclude. Drag the handle between Diff and Proposed.
          </p>
          <ResizablePanelGroup
            direction="vertical"
            autoSaveId="openbentt-notebook-review"
            className="min-h-[160px] flex-1 rounded-lg border border-border/50 bg-muted/10"
          >
            <ResizablePanel defaultSize={38} minSize={18} className="min-h-0">
              <div className="flex h-full min-h-0 flex-col gap-1.5 p-2">
                <div className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Diff</div>
                <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/50 bg-muted/25 p-2">
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
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-border/80" />
            <ResizablePanel defaultSize={62} minSize={22} className="min-h-0">
              <div className="flex h-full min-h-0 flex-col gap-1.5 p-2">
                <div className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Proposed</div>
                <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/50 bg-background/80 p-2">
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
                        <span className="font-mono text-[11px] leading-relaxed text-foreground">{line || " "}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
      </div>
    </div>
  );

  const mainWorkspaceColumn = (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-border/50 bg-card",
        showReviewPanel && "lg:border-r"
      )}
    >
      <div className="flex shrink-0 gap-1 border-b border-border/60 bg-muted/25 px-2 py-1.5">
        <Button
          type="button"
          size="sm"
          variant={mainTab === "preview" ? "secondary" : "ghost"}
          className="h-8 flex-1 gap-1.5 sm:flex-initial sm:px-4"
          onClick={() => setMainTab("preview")}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          Preview
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mainTab === "source" ? "secondary" : "ghost"}
          className="h-8 flex-1 gap-1.5 sm:flex-initial sm:px-4"
          onClick={() => setMainTab("source")}
        >
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          Source
        </Button>
      </div>

      {latexRecovery && isLatexSource && (
        <div className="shrink-0 border-b border-amber-500/35 bg-amber-500/[0.08] px-3 py-2.5 dark:bg-amber-950/25">
          <Alert className="border-amber-500/40 bg-background/90">
            <Wand2 className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            <AlertTitle>Fix LaTeX and try again</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <span>
                <strong>Apply fixes &amp; recompile</strong> runs the same deterministic cleanup (unicode, draft graphics, fonts,
                figure placeholders) on the <strong>current Source</strong>, then compiles.{" "}
                <strong>Open fix prompt in chat</strong> loads the <strong>same Source buffer</strong> and the{" "}
                <strong>same captured error</strong> into the main composer so the model can revise the .tex. Both use what
                you see in Source right now; after Apply, that includes autofixed text.
              </span>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0 gap-1.5"
                  onClick={() => loadFixPromptInChat()}
                  disabled={busy || !lastLatexFailure}
                >
                  <MessageSquareQuote className="h-3.5 w-3.5" />
                  Open fix prompt in chat
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => void runAutofixAndRecompile()}
                  disabled={busy}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Apply fixes &amp; recompile
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {mainTab === "preview" && (
          <div className="flex h-full min-h-0 flex-col">
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
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <span className="hidden text-[10px] text-muted-foreground sm:inline" title="Hold Ctrl (or ⌘) and scroll to zoom toward the cursor">
                      Ctrl+scroll
                    </span>
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
                        title="Reset zoom (Ctrl/Cmd + scroll on the page)"
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
                </div>
                <div ref={pdfScrollRef} className="min-h-0 flex-1 overflow-auto">
                  <div className="bg-muted/40 p-3 md:p-4">
                    <div ref={previewRef} className="mx-auto flex max-w-full flex-col items-center gap-0 pb-2" />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
                <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-medium text-foreground">No PDF yet</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Open a PDF for Original vs Compiled, or load <strong className="font-medium">.tex</strong> and Compile (run{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px]">npm run latex-compile</code> for HTTP fallback in dev).
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
          <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-3 py-3">
            <p className="shrink-0 text-[11px] leading-snug text-muted-foreground">
              <strong className="text-foreground">From chat:</strong> ask for <code className="font-mono text-[10px]">.tex</code> (e.g.{" "}
              <code className="font-mono text-[10px]">```latex</code>), then <strong className="text-foreground">Apply reply</strong> on the toolbar.
            </p>
            {isLatexSource ? (
              <p className="shrink-0 text-[11px] leading-snug text-muted-foreground">
                <strong className="text-foreground">LaTeX:</strong> BusyTeX in-browser · <code className="rounded bg-muted px-1 font-mono text-[10px]">npm run download:busytex</code> once.
              </p>
            ) : (
              <p className="shrink-0 text-[11px] leading-snug text-muted-foreground">
                <strong className="text-foreground">Extract:</strong> keep <code className="font-mono text-[10px]">--- PDF PAGE i / n ---</code> markers, or paste full LaTeX.
              </p>
            )}
            <Textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              className="min-h-0 flex-1 resize-none border-border/60 font-mono text-xs leading-relaxed"
              placeholder={`Full LaTeX (\\documentclass …) or plain text with page markers.`}
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={400}>
      <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/80 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-card/95 px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold leading-tight">Notebook</h2>
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
                <p className="text-[11px] text-muted-foreground">PDF · .tex · template</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => void onPickPdf(e)} />
            <input ref={texRef} type="file" accept=".tex,text/plain" className="hidden" onChange={(e) => void onPickTex(e)} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="secondary" className="h-9 w-9 shrink-0" disabled={busy} onClick={() => fileRef.current?.click()} aria-label="Open PDF">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open PDF</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="secondary" className="h-9 w-9 shrink-0" disabled={busy} onClick={() => texRef.current?.click()} aria-label="Open TeX file">
                  <FileCode2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open .tex file</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={insertLatexTemplate} disabled={busy} aria-label="Insert LaTeX template">
                  <LayoutTemplate className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Insert book template</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="mx-0.5 hidden h-7 sm:block" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 shrink-0"
                  disabled={busy || !sourceText.trim()}
                  onClick={() => void compilePdf()}
                  aria-label="Compile to PDF"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Compile source → PDF</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={pullLastAssistant} disabled={!lastAssistantPlain.trim()} aria-label="Load last reply to Review">
                  <MessageSquareQuote className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Load last reply into Review</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={busy || !canUseReplyPreview}
                  onClick={() => void applyLastReplyAndPreview()}
                  aria-label="Apply reply and compile"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightCircle className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Apply reply to Source & compile</TooltipContent>
            </Tooltip>
            {(originalBytes || compiledBytes) && <Separator orientation="vertical" className="mx-0.5 hidden h-7 sm:block" />}
            {originalBytes && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => downloadBlob(originalBytes, fileName || "original.pdf")} aria-label="Download original PDF">
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Download original PDF</TooltipContent>
              </Tooltip>
            )}
            {compiledBytes && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => downloadBlob(compiledBytes, "openbentt-compiled.pdf")} aria-label="Download compiled PDF">
                    <ArrowDownToLine className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Download compiled PDF</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {showReviewPanel ? (
          <ResizablePanelGroup
            key={`${splitDirection}-split`}
            direction={splitDirection}
            autoSaveId={`openbentt-notebook-split-${splitDirection}`}
            className="min-h-0 w-full flex-1"
          >
            <ResizablePanel defaultSize={58} minSize={splitDirection === "horizontal" ? 32 : 28} className="min-h-0 min-w-0">
              {mainWorkspaceColumn}
            </ResizablePanel>
            <ResizableHandle withHandle className="w-2 bg-border/70 data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:w-full" />
            <ResizablePanel defaultSize={42} minSize={splitDirection === "horizontal" ? 22 : 24} className="min-h-0 min-w-0">
              {reviewColumn}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="flex min-h-0 w-full flex-1 flex-col">{mainWorkspaceColumn}</div>
        )}
      </Card>
    </TooltipProvider>
  );
};

export default NotebookPdfWorkspace;
