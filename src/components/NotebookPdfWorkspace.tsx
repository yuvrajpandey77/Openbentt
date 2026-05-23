import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useChat } from "@/context/ChatContext";
import { buildAssistantPlainText } from "@/lib/assistantPlainText";
import { extractNotebookSourceFromPdf } from "@/lib/pdfText";
import { renderPdfPages } from "@/lib/pdfCanvasRender";
import { compileNotebookSourceToPdf } from "@/lib/compileNotebook";
import { buildProjectCompileBundle } from "@/lib/research/notebookCompileHelpers";
import { isFragmentSource } from "@/lib/research/compileBundle";
import { formatCompileFailureToast, parseLaTeXCompileDiagnostics, type LatexCompileDiagnostic } from "@/lib/latexErrorUi";
import { applyDiagnosticFix, applyNotebookLatexAutofix } from "@/lib/notebookLatexAutofix";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotebookViewerOptional } from "@/context/NotebookViewerContext";
import { useResearchWorkspaceOptional } from "@/context/ResearchWorkspaceContext";
import { useNotebookStudioOptional } from "@/context/NotebookStudioContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { NotebookStudioPreview } from "@/components/notebook/NotebookStudioPreview";
import { NotebookLatexEditor, type NotebookEditorHandle } from "@/components/notebook/NotebookLatexEditor";
import { resolveNotebookEditorLanguage } from "@/lib/codemirror/notebookLanguages";
import { NotebookLatexToolbar } from "@/components/notebook/NotebookLatexToolbar";
import { NotebookWritingAssistMenu } from "@/components/research/NotebookContextualStrip";
import { useNotebookStudioSettingsOptional } from "@/context/NotebookStudioSettingsContext";
import { editorFileKey, editorFileLabel as getEditorFileLabel, texContentForFileKey } from "@/context/NotebookStudioContext";
import { pushDraftHistoryDesktop } from "@/lib/research/researchDesktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { shouldReplaceEditorSourceOnPdfLoad } from "@/lib/notebookPdfLoad";

type MainTab = "preview" | "source";
/** Which PDF bytes drive the canvas — original upload vs text-compiled (images/layout only on Original). */
type PreviewVariant = "original" | "compiled";
/** Hide internal PDF-extraction markers mistaken for display titles. */
function pdfPreviewLabel(name: string | null): string | null {
  if (!name?.trim()) return null;
  const t = name.trim();
  if (t.includes("[UNTRUSTED_DOCUMENT")) return null;
  return t;
}


const ZOOM_MIN = 0.65;
const ZOOM_MAX = 2.25;
const ZOOM_STEP = 0.15;
const ZOOM_DEFAULT = 1.1;

type NotebookPdfWorkspaceProps = {
  projectDraftTex?: string;
  onProjectDraftChange?: (tex: string) => void;
  /** Label for the active editor file in studio layout. */
  editorFileLabel?: string;
  /** Hide duplicate toolbar when embedded in unified research workspace. */
  compactChrome?: boolean;
  /** Side-by-side source + preview (Prism-style studio). */
  layoutMode?: "tabs" | "studio";
  /** Grouped toolbar menus for studio layout. */
  chromeMode?: "full" | "compact" | "studio" | "none";
};

function parseSectionHeadings(tex: string): { label: string; line: number }[] {
  const headings: { label: string; line: number }[] = [];
  const lines = tex.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\\(section|subsection|chapter)\*?\{([^}]+)\}/);
    if (m) headings.push({ label: m[2].trim(), line: i });
  }
  return headings;
}

const NotebookPdfWorkspace: React.FC<NotebookPdfWorkspaceProps> = ({
  projectDraftTex,
  onProjectDraftChange,
  editorFileLabel = "main.tex",
  compactChrome = false,
  layoutMode = "tabs",
  chromeMode,
}) => {
  const effectiveChrome = chromeMode ?? (compactChrome ? "compact" : "full");
  const isStudio = layoutMode === "studio";
  const viewerCtx = useNotebookViewerOptional();
  const studioCtx = useNotebookStudioOptional();
  const { toast } = useToast();
  const workspace = useResearchWorkspaceOptional();
  const { project: researchProject, updateProject: updateResearchProject, uploadPaperPdf } =
    useResearchProject();
  const studioSettings = useNotebookStudioSettingsOptional();
  const [compileSummary, setCompileSummary] = useState<string | null>(null);
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
  const displayPdfName = useMemo(() => pdfPreviewLabel(fileName), [fileName]);
  const [originalBytes, setOriginalBytes] = useState<ArrayBuffer | null>(null);
  const [compiledBytes, setCompiledBytes] = useState<ArrayBuffer | null>(null);
  const [sourceText, setSourceText] = useState(projectDraftTex ?? "");
  const [proposedText, setProposedText] = useState<string | null>(null);
  const [lineInclude, setLineInclude] = useState<boolean[]>([]);
  const [mainTab, setMainTab] = useState<MainTab>("preview");
  const [busy, setBusy] = useState(false);
  /** Last failure message for “ask chat to fix” (cleared on successful compile). */
  const [lastLatexFailure, setLastLatexFailure] = useState<{
    raw: string;
    source: NotebookLatexFailureSource;
  } | null>(null);
  /** Parsed line diagnostics from last compile failure. */
  const [compileDiagnostics, setCompileDiagnostics] = useState<LatexCompileDiagnostic[]>([]);
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

  const syncingFromProject = useRef(false);
  /** Skip one autosave cycle after programmatic buffer changes (e.g. legacy PDF → Source). */
  const suppressProjectSync = useRef(false);
  const onProjectDraftChangeRef = useRef(onProjectDraftChange);
  onProjectDraftChangeRef.current = onProjectDraftChange;

  useEffect(() => {
    if (projectDraftTex == null) return;
    syncingFromProject.current = true;
    setSourceText(projectDraftTex);
  }, [projectDraftTex]);

  useEffect(() => {
    if (syncingFromProject.current) {
      syncingFromProject.current = false;
      return;
    }
    if (suppressProjectSync.current) {
      suppressProjectSync.current = false;
      return;
    }
    onProjectDraftChangeRef.current?.(sourceText);
  }, [sourceText]);

  useEffect(() => {
    workspace?.setSectionHeadings(parseSectionHeadings(sourceText));
  }, [sourceText, workspace]);

  const debouncedSourceForHistory = useDebouncedValue(sourceText, 800);

  useEffect(() => {
    if (!workspace) return;
    workspace.pushDraftHistory(debouncedSourceForHistory);
    if (isDesktopApp() && researchProject?.id) {
      void pushDraftHistoryDesktop(researchProject.id, debouncedSourceForHistory, "autosave");
    }
  }, [debouncedSourceForHistory, workspace, researchProject?.id]);

  useEffect(() => {
    const onUndo = (e: Event) => {
      const tex = (e as CustomEvent<string>).detail;
      if (typeof tex === "string") setSourceText(tex);
    };
    window.addEventListener("openbentt-draft-undo", onUndo);
    window.addEventListener("openbentt-draft-redo", onUndo);
    return () => {
      window.removeEventListener("openbentt-draft-undo", onUndo);
      window.removeEventListener("openbentt-draft-redo", onUndo);
    };
  }, []);

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

  const connectedAssistExtras = useMemo(() => {
    if (!isStudio || !studioCtx || !researchProject) {
      return {
        connectedTexFiles: [] as { label: string; content: string }[],
        connectedPdfContext: null as string | null,
      };
    }
    const { chatConnections, pdfPage, editorTabs } = studioCtx;
    const connectedTexFiles: { label: string; content: string }[] = [];
    for (const fileKey of chatConnections.texFileKeys) {
      const content = texContentForFileKey(researchProject, fileKey);
      const tabMatch = editorTabs.find((t) => editorFileKey(t) === fileKey);
      let label = fileKey;
      if (tabMatch) {
        try {
          label = getEditorFileLabel(tabMatch, researchProject);
        } catch {
          label = fileKey === "draft" ? "main.tex" : fileKey;
        }
      } else if (fileKey === "draft") {
        label = "main.tex";
      } else if (fileKey === "bib") {
        label = "references.bib";
      }
      connectedTexFiles.push({ label, content });
    }
    let connectedPdfContext: string | null = null;
    if (chatConnections.pdfPaperId) {
      if (chatConnections.pdfPaperId === "compiled") {
        connectedPdfContext = `Compiled PDF preview (page ${pdfPage}).`;
      } else {
        const paper = researchProject.papers.find((p) => p.id === chatConnections.pdfPaperId);
        if (paper) {
          const note = paper.pageNotes?.[pdfPage];
          connectedPdfContext = `Paper "${paper.metadata.title ?? paper.fileName}" — page ${pdfPage}${note ? ` — note: ${note.slice(0, 200)}` : ""}.`;
        }
      }
    }
    return { connectedTexFiles, connectedPdfContext };
  }, [isStudio, studioCtx, researchProject]);

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
      ...connectedAssistExtras,
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
      connectedAssistExtras,
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
      ...connectedAssistExtras,
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
      connectedAssistExtras,
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

  const recordCompileFailure = useCallback((err: unknown, source: NotebookLatexFailureSource = "compile") => {
    const raw = err instanceof Error ? err.message : String(err);
    setCompileDiagnostics(parseLaTeXCompileDiagnostics(raw));
    setLastLatexFailure({ raw, source });
  }, []);

  const notifyLatexFailure = useCallback(
    (err: unknown, source: NotebookLatexFailureSource = "compile") => {
      recordCompileFailure(err, source);
      const raw = err instanceof Error ? err.message : String(err);
      const diags = parseLaTeXCompileDiagnostics(raw);
      const { title, description } = formatCompileFailureToast(err);
      const firstLine = description.split("\n").find((l) => l.trim())?.trim() ?? "";
      const shortDesc = [
        diags.length > 0 ? `Line ${diags.map((d) => d.line).join(", ")}.` : null,
        firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine,
      ]
        .filter(Boolean)
        .join(" ");

      toast({
        variant: "destructive",
        title: diags[0] ? `Compile failed · line ${diags[0].line}` : title,
        description: shortDesc || "Tap Fix in chat to diagnose.",
        className: "p-4 pr-8",
        action: (
          <ToastAction
            altText="Fix in chat"
            onClick={() => {
              queuePromptInComposer(
                buildNotebookLatexFixPrompt({ sourceText, errorRaw: raw, failure: source })
              );
            }}
          >
            Fix in chat
          </ToastAction>
        ),
      });
    },
    [recordCompileFailure, toast, sourceText, queuePromptInComposer]
  );

  const runPreviewRender = useCallback(async () => {
    const el = previewRef.current;
    const scrollEl = pdfScrollRef.current;
    if (!el || !previewBuffer) return;
    el.innerHTML = '<p class="text-sm text-muted-foreground p-6 text-center">Rendering…</p>';
    try {
      await renderPdfPages(previewBuffer, el, pdfScale);
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
        notifyLatexFailure(e, "pdf_render");
      } else {
        toast({
          title: "PDF preview failed",
          description: msg,
          variant: "destructive",
        });
      }
    }
  }, [previewBuffer, pdfScale, toast, isLatexSource, notifyLatexFailure]);

  /** Re-render when buffer/scale changes, and when returning to Preview (tab unmount clears the canvas). */
  useEffect(() => {
    if (isStudio || mainTab !== "preview") return;
    void runPreviewRender();
  }, [runPreviewRender, mainTab, isStudio]);

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
      if (isStudio && uploadPaperPdf) {
        await uploadPaperPdf(f);
        await loadPdfFromBuffer(buf.slice(0), f.name, { replaceSource: false });
        toast({
          title: "Paper added",
          description: `${f.name} is in papers/ — preview updated; LaTeX files unchanged.`,
        });
        return;
      }
      await loadPdfFromBuffer(buf.slice(0), f.name, { replaceSource: true });
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

  const loadPdfFromBuffer = useCallback(
    async (
      buf: ArrayBuffer,
      name: string,
      options?: { replaceSource?: boolean; paperId?: string }
    ) => {
      const replaceEditorSource = shouldReplaceEditorSourceOnPdfLoad(layoutMode, options?.replaceSource);
      setOriginalBytes(buf.slice(0));
      setCompiledBytes(null);
      setPreviewVariant("original");
      setFileName(name);
      setProposedText(null);
      setLastLatexFailure(null);
      setPdfScale(ZOOM_DEFAULT);
      setMainTab("preview");
      if (options?.paperId) studioCtx?.setActivePaperId(options.paperId);
      else if (replaceEditorSource) studioCtx?.setActivePaperId(null);
      if (replaceEditorSource) {
        const text = await extractNotebookSourceFromPdf(buf);
        suppressProjectSync.current = true;
        setSourceText(text);
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
      } else {
        toast({ title: "PDF opened", description: name });
      }
    },
    [toast, studioCtx, layoutMode]
  );

  useEffect(() => {
    if (effectiveChrome !== "studio" || !viewerCtx) return;
    viewerCtx.registerViewer({
      loadPdfBytes: (bytes, fileName, opts) => void loadPdfFromBuffer(bytes, fileName, opts),
      focusSource: () => setMainTab("source"),
      focusPreview: () => setMainTab("preview"),
      openPdfPicker: () => fileRef.current?.click(),
      openTexPicker: () => texRef.current?.click(),
    });
    return () => viewerCtx.registerViewer(null);
  }, [effectiveChrome, viewerCtx, loadPdfFromBuffer]);

  const doCompile = useCallback(
    async (text: string) => {
      if (researchProject && isLatexDocumentSource(researchProject.draftTex)) {
        const bundle = await buildProjectCompileBundle(researchProject, {
          mainTexOverride: researchProject.draftTex,
        });
        setCompileSummary(bundle.summary);
        if (isFragmentSource(text) && text !== researchProject.draftTex) {
          toast({
            title: "Compiling main.tex",
            description: `Active file is a fragment — using project root (${bundle.summary}).`,
          });
        }
        const blob = await compileNotebookSourceToPdf(text, fileName?.replace(/\.(pdf|tex)$/i, "") || "Notebook", {
          bundle,
        });
        const buf = await blob.arrayBuffer();
        setCompiledBytes(buf.slice(0));
        setPreviewVariant("compiled");
        setMainTab("preview");
        setLastLatexFailure(null);
        setCompileDiagnostics([]);
        toast({
          title: "Compiled",
          description: `${bundle.summary} → PDF ready.`,
        });
        return;
      }

      const blob = await compileNotebookSourceToPdf(text, fileName?.replace(/\.(pdf|tex)$/i, "") || "Notebook");
      const buf = await blob.arrayBuffer();
      setCompiledBytes(buf.slice(0));
      setPreviewVariant("compiled");
      setMainTab("preview");
      setLastLatexFailure(null);
      setCompileDiagnostics([]);
      const kind = isLatexDocumentSource(text) ? "pdflatex PDF" : "text PDF";
      toast({
        title: "Compiled",
        description:
          originalBytes != null
            ? `${kind} ready — use Original / Compiled to compare.`
            : `${kind} ready — Preview shows the compiled output.`,
      });
    },
    [fileName, toast, originalBytes, researchProject]
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
      notifyLatexFailure(err);
    } finally {
      setBusy(false);
    }
  }, [sourceText, doCompile, notifyLatexFailure]);

  const runDiagnosticFixAndRecompile = useCallback(
    async (diag: LatexCompileDiagnostic) => {
      if (!isLatexDocumentSource(sourceText)) return;
      const next = applyDiagnosticFix(sourceText, diag);
      setSourceText(next);
      setBusy(true);
      try {
        await doCompile(next);
      } catch (err) {
        notifyLatexFailure(err);
      } finally {
        setBusy(false);
      }
    },
    [sourceText, doCompile, notifyLatexFailure]
  );

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
        if (isLatexDocumentSource(req.latex)) notifyLatexFailure(err);
        else {
          const { title, description } = formatCompileFailureToast(err);
          toast({ title, description, variant: "destructive" });
        }
      } finally {
        setBusy(false);
      }
    })();
  }, [notebookLatexInsertRequest?.id, clearNotebookLatexInsertRequest, doCompile, toast, notifyLatexFailure]);

  const compilePdf = async () => {
    setBusy(true);
    try {
      await doCompile(sourceText);
    } catch (err) {
      if (isLatexSource) notifyLatexFailure(err);
      else {
        const { title, description } = formatCompileFailureToast(err);
        toast({ title, description, variant: "destructive" });
      }
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

  useEffect(() => {
    if (!workspace) return;
    workspace.registerNotebookActions({
      compilePdf: () => void compilePdf(),
      openPdf: () => fileRef.current?.click(),
      openTex: () => texRef.current?.click(),
      loadLastReplyToReview: () => pullLastAssistant(),
      focusSource: () => setMainTab("source"),
      focusPreview: () => setMainTab("preview"),
      insertCitation: (key) => {
        const k = key ?? researchProject?.bibEntries[0]?.key;
        if (!k || !researchProject) return;
        const insert = `\\cite{${k}}`;
        const tex = researchProject.draftTex.includes(insert)
          ? researchProject.draftTex
          : researchProject.draftTex.replace(/\\end\{document\}/, `${insert}\n\\end{document}`);
        void updateResearchProject({ draftTex: tex });
      },
      compareDrafts: () => {
        if (proposedText) {
          setMainTab("source");
          return;
        }
        pullLastAssistant();
      },
      openPaperPicker: () => window.dispatchEvent(new CustomEvent("openbentt-open-paper-picker")),
    });
  }, [
    workspace,
    researchProject,
    proposedText,
    updateResearchProject,
    lastAssistantPlain,
    sourceText,
  ]);

  const notebookEditorRef = useRef<NotebookEditorHandle>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const line = workspace?.focusSectionLine;
    if (line == null) return;
    setMainTab("source");
    notebookEditorRef.current?.goToLine(line);
    workspace.clearFocusSection();
  }, [workspace?.focusSectionLine, workspace]);

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
      if (isLatexDocumentSource(next)) notifyLatexFailure(err);
      else {
        const { title, description } = formatCompileFailureToast(err);
        toast({ title, description, variant: "destructive" });
      }
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
      if (isLatexDocumentSource(next)) notifyLatexFailure(err);
      else {
        const { title, description } = formatCompileFailureToast(err);
        toast({ title, description, variant: "destructive" });
      }
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
      if (isLatexDocumentSource(merged)) notifyLatexFailure(err);
      else {
        const { title, description } = formatCompileFailureToast(err);
        toast({ title, description, variant: "destructive" });
      }
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
      {!isStudio && (
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
      )}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-hidden",
          isStudio && "grid grid-cols-1 lg:grid-cols-2"
        )}
      >
        {(isStudio || mainTab === "preview") && (
          <div
            className={cn(
              "flex h-full min-h-0 flex-col",
              isStudio && "min-h-0 border-b border-border/40 lg:order-2 lg:border-b-0 lg:border-l"
            )}
          >
            {isStudio ? (
              <NotebookStudioPreview
                previewBuffer={previewBuffer}
                pdfScale={pdfScale}
                setPdfScale={setPdfScale}
                activePaperId={studioCtx?.activePaperId ?? null}
                onChoosePdf={() => fileRef.current?.click()}
                busy={busy}
              />
            ) : previewBuffer ? (
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

        {(isStudio || mainTab === "source") && (
          <div
            className={cn(
              "flex h-full min-h-0 flex-col overflow-hidden",
              isStudio ? "px-3 py-2 lg:order-1" : "gap-2 overflow-hidden px-3 py-3"
            )}
          >
            {!isStudio && (
              <>
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
              </>
            )}
            {isStudio ? (
              <>
                <NotebookLatexToolbar
                  bibKeys={researchProject?.bibEntries?.map((b) => b.key).filter(Boolean) as string[]}
                  onInsert={(snippet, cursorOffset = snippet.length) => {
                    notebookEditorRef.current?.insertSnippet(snippet, cursorOffset);
                  }}
                />
                {compileSummary && (
                  <p className="shrink-0 px-1 text-[10px] text-muted-foreground">Compile bundle: {compileSummary}</p>
                )}
                <NotebookLatexEditor
                  ref={notebookEditorRef}
                  value={sourceText}
                  onChange={setSourceText}
                  diagnostics={compileDiagnostics}
                  onFixDiagnostic={(d) => void runDiagnosticFixAndRecompile(d)}
                  editorFileLabel={editorFileLabel}
                  busy={busy}
                  fontSize={studioSettings?.pane.editorFontSize}
                  language={resolveNotebookEditorLanguage(
                    studioCtx?.activeEditorFile.type ?? "draft",
                    studioCtx?.activeEditorFile.type === "projectFile"
                      ? researchProject?.projectFiles?.find(
                          (f) => f.id === studioCtx.activeEditorFile.fileId
                        )?.path
                      : undefined
                  )}
                  useCodeMirror={studioSettings?.pane.editorUseCodeMirror ?? true}
                  wordWrap={studioSettings?.pane.editorWordWrap ?? true}
                  showLineNumbers={studioSettings?.pane.editorLineNumbers ?? true}
                />
              </>
            ) : (
              <Textarea
                ref={sourceTextareaRef}
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                className="min-h-0 flex-1 resize-none border-border/60 font-mono text-xs leading-relaxed focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={`Full LaTeX (\\documentclass …) or plain text with page markers.`}
                spellCheck={false}
                aria-label={`${editorFileLabel} editor`}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={400}>
      <Card
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden border-border/80 shadow-sm",
          isStudio && "rounded-none border-0 shadow-none"
        )}
      >
        {effectiveChrome === "studio" && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-muted/15 px-3 py-2">
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => void onPickPdf(e)} />
            <input ref={texRef} type="file" accept=".tex,text/plain" className="hidden" onChange={(e) => void onPickTex(e)} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs">
                  File
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem disabled={busy} onClick={() => fileRef.current?.click()}>
                  Open PDF…
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy} onClick={() => texRef.current?.click()}>
                  Open .tex…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={insertLatexTemplate}>Insert book template</DropdownMenuItem>
                {originalBytes && (
                  <DropdownMenuItem onClick={() => downloadBlob(originalBytes, fileName || "original.pdf")}>
                    Download original PDF
                  </DropdownMenuItem>
                )}
                {compiledBytes && (
                  <DropdownMenuItem onClick={() => downloadBlob(compiledBytes, "openbentt-compiled.pdf")}>
                    Download compiled PDF
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs">
                  AI & review
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={pullLastAssistant} disabled={!lastAssistantPlain.trim()}>
                  Load last reply into Review
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy || !canUseReplyPreview} onClick={() => void applyLastReplyAndPreview()}>
                  Apply reply to Source & compile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => loadFixPromptInChat()} disabled={busy || !lastLatexFailure}>
                  Open fix prompt in chat
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void runAutofixAndRecompile()} disabled={busy}>
                  Apply fixes & recompile
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {researchProject && <NotebookWritingAssistMenu />}
            {compiledBytes && originalBytes && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="ghost" className="h-8 text-xs">
                    View
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setPreviewVariant("original")}>Original PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPreviewVariant("compiled")}>Compiled PDF</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="ml-auto flex items-center gap-2">
              {displayPdfName && (
                <span
                  className="hidden max-w-[140px] truncate text-[11px] text-muted-foreground md:inline"
                  title={displayPdfName}
                >
                  {displayPdfName}
                </span>
              )}
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-4 text-xs font-semibold"
                disabled={busy || !sourceText.trim()}
                onClick={() => void compilePdf()}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Compile
              </Button>
            </div>
          </div>
        )}
        {effectiveChrome === "full" && (
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
            {researchProject && <NotebookWritingAssistMenu size="icon" />}
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
        )}
        {effectiveChrome === "compact" && (
          <div className="flex shrink-0 items-center justify-end gap-0.5 border-b border-border/50 bg-muted/20 px-2 py-1">
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => void onPickPdf(e)} />
            <input ref={texRef} type="file" accept=".tex,text/plain" className="hidden" onChange={(e) => void onPickTex(e)} />
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
              PDF
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => void compilePdf()}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Compile"}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={pullLastAssistant} disabled={!lastAssistantPlain.trim()}>
              Review
            </Button>
            {researchProject && <NotebookWritingAssistMenu className="h-7" />}
          </div>
        )}

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
