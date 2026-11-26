import React, { useMemo, useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUp,
  Bot,
  ChevronDown,
  ListPlus,
  Paperclip,
  Plus,
  Search,
  Square,
  Wrench,
  FileText,
  Mic,
  ListOrdered,
} from "lucide-react";
import { useChat, ExecutionMode } from "@/context/ChatContext";
import {
  detectModeIntent,
  modeIntentToSuggestion,
  shouldSuggestModeChange,
  isInternalTaskStep,
  type ModeSuggestion,
} from "@/lib/agent/modeDetection";
import { prefersLocalOllamaInference } from "@/lib/ollama/origin";
import { useLocalAI } from "@/context/LocalAIContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOpenRouterModels, buildSelectableModels } from "@/hooks/useOpenRouterModels";
import { useLocalGgufRegistryModels } from "@/hooks/useLocalGgufRegistryModels";
import { shortModelLabel } from "@/lib/openrouter";
import { dedupeModels, normalizeApiConfig, canSendChat, canSendMessage, type MessageAttachment } from "@/types/chat";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getDesktopApi } from "@/lib/desktopApi";
import { Camera, FolderInput, FileCode2 } from "lucide-react";
import { parseGgufRegistryId } from "@/lib/localGguf/ids";
import { Link } from "react-router-dom";
import { getComposerPlaceholder } from "@/lib/composerPlaceholder";
import { useToast } from "@/components/ui/use-toast";
import { v4 as uuidv4 } from "uuid";
import { readFileAsDataUrl, extractVideoFrameDataUrl, assertImageSize } from "@/lib/media";
import { extractTextFromPdfFile } from "@/lib/pdfText";
import { ToolsPopover } from "@/components/ToolsPopover";
import { ModelCapabilityBadges } from "@/components/ModelCapabilityBadges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { WorkspaceRouteMeta } from "@/config/workspaceRouteMeta";
import { cn } from "@/lib/utils";
import { isWebClient } from "@/config/platformSurface";
import { buildChatMarkdownExport, downloadTextFile } from "@/lib/chatExportMarkdown";
import {
  findUnsupportedVisionAttachments,
  imageUnsupportedMessage,
  modelSupportsImages,
} from "@/lib/attachmentModelSupport";
import { VoiceInputButton } from "@/components/conversation/VoiceInputButton";
import { WorkspaceNeededBanner } from "@/components/conversation/WorkspaceNeededBanner";
import { WorkspaceSelector } from "@/components/conversation/WorkspaceSelector";
import { AgentAwaitingBar } from "@/components/conversation/AgentAwaitingBar";
import { LayerDownBanner } from "@/components/conversation/LayerDownBanner";
import { ComposerRuntimePicker } from "@/components/composer/ComposerRuntimePicker";
import { ChatProviderPicker } from "@/components/ChatProviderPicker";
import { ComposerSlashMenu } from "@/components/composer/ComposerSlashMenu";
import {
  applySlashPick,
  buildSlashItems,
  getSlashQuery,
  type SlashItem,
} from "@/lib/composerSlash";
import {
  choiceIsChatBackend,
  choiceUsesOpenCodeAsk,
  loadChatProviderChoice,
} from "@/lib/agent/chatProviderChoice";
import { Input } from "@/components/ui/input";

interface ChatInputProps {
  isLoading: boolean;
  workspaceMeta?: WorkspaceRouteMeta;
  placeholderOverride?: string;
  /** Smaller composer for embedded notebook dock. */
  variant?: "default" | "compact" | "studio";
}

const MAX_COMPARE = 4;

type RouteDraft = { text: string; attachments: MessageAttachment[] };

type QueuedSend = {
  text: string;
  attachments: MessageAttachment[];
  kind: "send" | "agent" | "plan";
};

const ChatInput: React.FC<ChatInputProps> = ({
  isLoading,
  workspaceMeta,
  placeholderOverride,
  variant = "default",
}) => {
  const isStudio = variant === "studio";
  const location = useLocation();
  const pathKey = location.pathname;

  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [sendQueue, setSendQueue] = useState<QueuedSend[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [capturing, setCapturing] = useState(false);
  const draftsRef = useRef<Record<string, RouteDraft>>({});
  const lastPathRef = useRef<string | null>(null);
  const messageRef = useRef(message);
  const attachmentsRef = useRef(attachments);
  const drainingQueueRef = useRef(false);
  messageRef.current = message;
  attachmentsRef.current = attachments;

  const {
    apiConfig,
    setApiConfig,
    stopStreaming,
    isLoadingConfig,
    sendMessage,
    sendAgentMessage,
    agentMode,
    setAgentMode,
    sourceScope,
    setSourceScope,
    pendingComposer,
    clearPendingComposer,
    chats,
    currentChatId,
    openCodeLayer,
    openCodeModel,
    setOpenCodeModel,
    unifiedChatReady,
    executionMode,
    setExecutionMode,
    executionTasks,
    executionEvents,
  } = useChat();
  const { workspace: composerWs } = useWorkspace();
  const providerChoiceId = loadChatProviderChoice()?.id;
  /**
   * Agent / OpenCode path owns chat when the user did not pick a chat backend
   * (Ollama / OpenRouter / GGUF) and the layer is installed or live.
   */
  const layerActive =
    isDesktopApp() &&
    !prefersLocalOllamaInference(apiConfig) &&
    !choiceIsChatBackend(providerChoiceId) &&
    (choiceUsesOpenCodeAsk(providerChoiceId) || providerChoiceId == null) &&
    (openCodeLayer.available ||
      openCodeLayer.askReady ||
      openCodeLayer.opencodeInstalled ||
      openCodeLayer.checking);
  const agentRuntimeChosen = choiceUsesOpenCodeAsk(providerChoiceId);
  const { effectiveModel } = useLocalAI();
  /** Bumps when localStorage consent changes so web /chat re-reads getLocalWeightsConsent(). */
  const [plusOpen, setPlusOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [modeSuggestion, setModeSuggestion] = useState<ModeSuggestion | null>(null);
  const isNotebookRoute = pathKey.startsWith("/notebook");
  const slashQuery = getSlashQuery(message);
  const slashOpen = slashQuery != null;
  const slashItems = useMemo(
    () => (slashOpen ? buildSlashItems({ notebook: isNotebookRoute }) : []),
    [slashOpen, isNotebookRoute]
  );
  const filteredSlashItems = useMemo(() => {
    if (!slashOpen || slashQuery == null) return [];
    const q = slashQuery.trim().toLowerCase();
    if (!q) return slashItems;
    return slashItems.filter(
      (i) =>
        i.command.includes(q) ||
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
    );
  }, [slashOpen, slashQuery, slashItems]);
  const [agentRoleId, setAgentRoleId] = useState<string>(() => {
    try {
      return localStorage.getItem("openbentt-agent-role") ?? "research-assistant";
    } catch {
      return "research-assistant";
    }
  });
  const { toast } = useToast();
  const { data: models, isLoading: modelsLoading, isError: modelsError } = useOpenRouterModels(
    apiConfig.apiKey,
    apiConfig.openAiCompatibleBaseUrl,
    apiConfig.aiProvider
  );
  const { data: ggufModels } = useLocalGgufRegistryModels(apiConfig.aiProvider === "local_gguf");
  const [modelFilter, setModelFilter] = useState("");

  const selectable = useMemo(
    () =>
      apiConfig.aiProvider === "local_gguf"
        ? buildSelectableModels(
            ggufModels,
            apiConfig.customModelIds,
            [apiConfig.model, ...apiConfig.comparisonModelIds],
            { includeAllFromApi: true }
          )
        : buildSelectableModels(
            models,
            apiConfig.customModelIds,
            [apiConfig.model, ...apiConfig.comparisonModelIds],
            { includeAllFromApi: apiConfig.aiProvider !== "openrouter" }
          ),
    [models, ggufModels, apiConfig.customModelIds, apiConfig.model, apiConfig.comparisonModelIds, apiConfig.aiProvider]
  );

  const currentModelMeta = useMemo(
    () => models?.find((m) => m.id === apiConfig.model) ?? null,
    [models, apiConfig.model]
  );

  const filteredSelectable = useMemo(() => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return selectable;
    return selectable.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.name && m.name.toLowerCase().includes(q))
    );
  }, [selectable, modelFilter]);

  const filteredOpenCodeModels = useMemo(() => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return openCodeLayer.models;
    return openCodeLayer.models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.displayName && m.displayName.toLowerCase().includes(q))
    );
  }, [openCodeLayer.models, modelFilter]);

  const currentChat = useMemo(
    () => chats.find((c) => c.id === currentChatId),
    [chats, currentChatId]
  );
  const hasThreadMessages = (currentChat?.messages.length ?? 0) > 0;
  const isEmpty = !hasThreadMessages;

  const exportThreadMd = () => {
    if (!currentChat?.messages.length) {
      toast({ title: "Nothing to export", description: "Send a message first.", variant: "destructive" });
      return;
    }
    const md = buildChatMarkdownExport(currentChat);
    const safe = currentChat.title.replace(/[^\w-]+/g, "-").slice(0, 48) || "chat";
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`openbentt-${safe}-${stamp}.md`, md);
    toast({ title: "Markdown exported", description: "File download started." });
  };

  const pickWithAccept = (accept: string) => {
    if (!fileRef.current) return;
    fileRef.current.accept = accept;
    fileRef.current.click();
  };

  useEffect(() => {
    if (pendingComposer) {
      setMessage(pendingComposer.text);
      setAttachments(pendingComposer.attachments);
      draftsRef.current[pathKey] = {
        text: pendingComposer.text,
        attachments: pendingComposer.attachments,
      };
      clearPendingComposer();
    }
  }, [pendingComposer, clearPendingComposer, pathKey]);

  useLayoutEffect(() => {
    if (lastPathRef.current === null) {
      lastPathRef.current = pathKey;
      const initial = draftsRef.current[pathKey] ?? { text: "", attachments: [] };
      setMessage(initial.text);
      setAttachments(initial.attachments);
      return;
    }
    if (lastPathRef.current !== pathKey) {
      const prev = lastPathRef.current;
      draftsRef.current[prev] = {
        text: messageRef.current,
        attachments: attachmentsRef.current,
      };
      const load = draftsRef.current[pathKey] ?? { text: "", attachments: [] };
      setMessage(load.text);
      setAttachments(load.attachments);
      lastPathRef.current = pathKey;
    }
  }, [pathKey]);

  useEffect(() => {
    draftsRef.current[pathKey] = { text: message, attachments };
  }, [message, attachments, pathKey]);

  // Build conversation history for context-aware detection
  const conversationHistory = useMemo(() => {
    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat) return [];
    return chat.messages.slice(-8).map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }, [chats, currentChatId]);

  // Check if a task is currently running in this conversation
  const currentTask = useMemo(() => {
    if (!currentChatId) return null;
    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat?.taskIds?.length) return null;
    const lastTaskId = chat.taskIds[chat.taskIds.length - 1];
    return executionTasks[lastTaskId] ?? null;
  }, [chats, currentChatId, executionTasks]);

  const isTaskRunning = currentTask && 
    ["QUEUED", "STARTING", "RUNNING", "WAITING_FOR_PERMISSION"].includes(currentTask.status);
  const currentTaskStatus = currentTask?.status ?? null;

  // Suggest-only mode detection: never auto-switch; skip while a task is running / internal steps.
  useEffect(() => {
    if (!isDesktopApp()) {
      setModeSuggestion(null);
      return;
    }
    if (executionMode !== "chat") {
      setModeSuggestion(null);
      return;
    }
    const text = message.trim();
    if (text.length < 12) {
      setModeSuggestion(null);
      return;
    }
    const handle = window.setTimeout(() => {
      const ctx = {
        conversationHistory,
        projectRoot: composerWs?.rootPath ?? null,
        currentMode: executionMode,
        isTaskRunning: Boolean(isTaskRunning),
        currentTaskStatus,
        hasAttachments: attachments.length > 0,
      };
      if (isInternalTaskStep(text, ctx)) {
        setModeSuggestion(null);
        return;
      }
      const intent = detectModeIntent(text, ctx);
      if (shouldSuggestModeChange(executionMode, intent, false)) {
        setModeSuggestion(modeIntentToSuggestion(intent));
      } else {
        setModeSuggestion(null);
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [
    message,
    executionMode,
    conversationHistory,
    composerWs?.rootPath,
    isTaskRunning,
    currentTaskStatus,
    attachments.length,
  ]);

  const resetComposerHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const minH = isStudio ? "2.5rem" : "2.75rem";
      textareaRef.current.style.height = minH;
    }
  }, [isStudio]);

  const dispatchSend = useCallback(
    async (payload: QueuedSend) => {
      try {
        if (payload.kind === "agent" || (agentMode && payload.attachments.length === 0 && payload.kind === "send")) {
          if (payload.kind === "agent") setAgentMode(true);
          await sendAgentMessage(payload.text, { roleId: agentRoleId });
          return;
        }
        const mode: ExecutionMode =
          payload.kind === "plan" ? "plan" : payload.kind === "agent" ? "build" : executionMode;
        if (payload.kind === "plan") setExecutionMode("plan");
        await sendMessage(payload.text, payload.attachments, { executionMode: mode });
      } catch {
        setMessage(payload.text);
        setAttachments(payload.attachments);
        toast({
          title: "Send failed",
          description: "Your draft was restored in the input.",
          variant: "destructive",
        });
      }
    },
    [agentMode, agentRoleId, executionMode, sendAgentMessage, sendMessage, setAgentMode, setExecutionMode, toast]
  );

  const enqueueOrSend = useCallback(
    async (kind: QueuedSend["kind"], { forceQueue = false }: { forceQueue?: boolean } = {}) => {
      if (
        !agentMode &&
        executionMode === "chat" &&
        apiConfig.aiProvider === "openai_compatible" &&
        effectiveModel?.provider === "ollama" &&
        effectiveModel.available === false
      ) {
        toast({
          title: "Local model not ready",
          description:
            "Start Ollama and install/select a model in Settings → Local AI, then try again.",
          variant: "destructive",
        });
        return;
      }
      if (!layerActive && apiConfig.comparisonEnabled && dedupeModels(apiConfig.comparisonModelIds).length < 2) {
        toast({
          title: "Pick at least two models",
          description: "Enable model comparison in Settings and select 2–4 models.",
          variant: "destructive",
        });
        return;
      }
      if (!layerActive) {
        const unsupportedVision = findUnsupportedVisionAttachments(attachments, apiConfig, currentModelMeta);
        if (unsupportedVision.length > 0) {
          toast({
            title: "Images not supported",
            description: imageUnsupportedMessage(apiConfig.model),
            variant: "destructive",
          });
          return;
        }
      }
      const t = message.trim();
      if (!t && attachments.length === 0) return;

      const payload: QueuedSend = { text: t, attachments: [...attachments], kind };
      setMessage("");
      setAttachments([]);
      resetComposerHeight();

      // Only queue while a reply is in flight — idle chats always send now.
      if (isLoading) {
        setSendQueue((q) => [...q, payload]);
        toast({
          title: "Queued",
          description:
            kind === "agent"
              ? "Agent task will run after the current reply."
              : kind === "plan"
                ? "Plan-first message queued."
                : `${sendQueue.length + 1} waiting — sends when the current reply finishes.`,
        });
        return;
      }
      void forceQueue;

      await dispatchSend(payload);
    },
    [
      agentMode,
      apiConfig,
      attachments,
      currentModelMeta,
      dispatchSend,
      effectiveModel,
      executionMode,
      isLoading,
      layerActive,
      message,
      resetComposerHeight,
      sendQueue.length,
      toast,
    ]
  );

  const handleSendMessage = async () => {
    await enqueueOrSend("send");
  };

  // Drain queue when the current run finishes.
  useEffect(() => {
    if (isLoading || sendQueue.length === 0 || drainingQueueRef.current) return;
    drainingQueueRef.current = true;
    const next = sendQueue[0];
    setSendQueue((q) => q.slice(1));
    void dispatchSend(next).finally(() => {
      drainingQueueRef.current = false;
    });
  }, [isLoading, sendQueue, dispatchSend]);

  const pickSlashItem = useCallback(
    (item: SlashItem) => {
      setMessage((prev) => applySlashPick(prev, item.body));
      setSlashIndex(0);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    []
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && filteredSlashItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % filteredSlashItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredSlashItems.length) % filteredSlashItems.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const item = filteredSlashItems[slashIndex] ?? filteredSlashItems[0];
        if (item) pickSlashItem(item);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMessage((prev) => prev.replace(/(?:^|\s)\/[^\s]*$/, "").trimEnd());
        setSlashIndex(0);
        return;
      }
    }
    if (e.key === "Escape" && isLoading) {
      e.preventDefault();
      stopStreaming();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const handleModelChange = (newModel: string) => {
    setApiConfig(
      normalizeApiConfig({
        ...apiConfig,
        model: newModel,
        comparisonModelIds:
          apiConfig.comparisonModelIds.length === 0
            ? [newModel]
            : dedupeModels([newModel, ...apiConfig.comparisonModelIds]).slice(0, MAX_COMPARE),
      })
    );
  };

  const rejectVisionAttachment = (): boolean => {
    if (modelSupportsImages(apiConfig, currentModelMeta)) return false;
    toast({
      title: "Images not supported",
      description: imageUnsupportedMessage(apiConfig.model),
      variant: "destructive",
    });
    return true;
  };

  const addAttachment = async (file: File) => {
    try {
      if (file.type.startsWith("image/")) {
        if (rejectVisionAttachment()) return;
        assertImageSize(file);
        const dataUrl = await readFileAsDataUrl(file);
        setAttachments((a) => [...a, { id: uuidv4(), kind: "image", mediaType: file.type, name: file.name, dataUrl }]);
        return;
      }
      if (file.type.startsWith("audio/")) {
        const dataUrl = await readFileAsDataUrl(file);
        if (file.size > 12 * 1024 * 1024) throw new Error("Audio file too large (max ~12 MB)");
        setAttachments((a) => [...a, { id: uuidv4(), kind: "audio", mediaType: file.type, name: file.name, dataUrl }]);
        return;
      }
      if (file.type.startsWith("video/")) {
        if (rejectVisionAttachment()) return;
        toast({ title: "Video", description: "Extracting a preview frame for vision models…" });
        const dataUrl = await extractVideoFrameDataUrl(file);
        setAttachments((a) => [...a, { id: uuidv4(), kind: "video_frame", mediaType: "image/jpeg", name: `${file.name} (frame)`, dataUrl }]);
        return;
      }
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        toast({ title: "PDF", description: "Extracting text…" });
        let extractedText = await extractTextFromPdfFile(file);
        const bodyChars = extractedText.replace(/\[[^\]]*\]/g, "").trim().length;
        if (bodyChars < 40 && isDesktopApp()) {
          try {
            const { extractResearchPdfWithOcr } = await import("@/lib/documents/pdfOcrIngest");
            const buf = await file.arrayBuffer();
            const ocr = await extractResearchPdfWithOcr(buf, file.name);
            if (ocr.ocrApplied && ocr.text.trim().length > bodyChars) {
              extractedText = ocr.text;
              toast({ title: "PDF", description: "OCR applied to scanned PDF." });
            } else if (!ocr.ocrAvailable && bodyChars < 40) {
              toast({
                title: "Scanned PDF",
                description: "Little text found. Install system tesseract for OCR on desktop.",
              });
            }
          } catch {
            /* keep glyph extraction */
          }
        }
        setAttachments((a) => [...a, { id: uuidv4(), kind: "pdf", name: file.name, extractedText }]);
        return;
      }
      toast({ title: "Unsupported file", description: "Use image, audio, video, or PDF.", variant: "destructive" });
    } catch (e) {
      toast({ title: "Attachment failed", description: e instanceof Error ? e.message : "Could not read file", variant: "destructive" });
    }
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    void (async () => {
      for (const f of Array.from(files)) await addAttachment(f);
    })();
    e.target.value = "";
  };

  /** Folder attach: structured reference (names only, never dumped content). */
  const onFolderPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const names = Array.from(files)
      .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
      .slice(0, 60);
    const top = names[0]?.split("/")[0] ?? "folder";
    setMessage((prev) => {
      const block = `\n\n[Attached folder ${top} (${files.length} files):\n${names.slice(0, 60).join("\n")}]`;
      return prev.trim() ? `${prev.trim()}${block}` : block.trim();
    });
    e.target.value = "";
    toast({ title: "Folder attached", description: `${files.length} file reference(s) added as context.` });
  };

  /** Screenshot attach: computer-use observe → image attachment, same harness. */
  const attachScreenshot = async () => {
    const api = getDesktopApi();
    if (!api?.computerScreenshot) {
      toast({ title: "Screenshots need the desktop app", variant: "destructive" });
      return;
    }
    setCapturing(true);
    try {
      const shot = await api.computerScreenshot();
      setAttachments((a) => [
        ...a,
        { id: uuidv4(), kind: "image", mediaType: "image/png", name: "screenshot.png", dataUrl: shot.dataUrl },
      ]);
    } catch (err) {
      toast({ title: "Screenshot failed", description: err instanceof Error ? err.message : "unknown", variant: "destructive" });
    } finally {
      setCapturing(false);
    }
  };

  /** Active project file attach: real content, bounded, same harness. */
  const attachActiveFile = async () => {
    const api = getDesktopApi();
    const rel = composerWs?.activeFile;
    const root = composerWs?.rootPath;
    if (!rel || !root || !api?.workspaceRead) {
      toast({ title: "No active file", description: "Open a project file first.", variant: "destructive" });
      return;
    }
    try {
      const r = await api.workspaceRead(root, rel, 32768);
      setMessage((prev) => {
        const block = `\n\n[Active file ${rel}:\n${r.text.slice(0, 20000)}${r.truncated ? "\n…(truncated)" : ""}]`;
        return prev.trim() ? `${prev.trim()}${block}` : block.trim();
      });
    } catch (err) {
      toast({ title: "Read failed", description: err instanceof Error ? err.message : "unknown", variant: "destructive" });
    }
  };

  const removeAtt = (id: string) => {
    setAttachments((a) => a.filter((x) => x.id !== id));
  };

  return (
    <div className={cn(isStudio ? "bg-transparent px-1 pb-1 pt-1" : "bg-transparent px-2 pb-2 pt-1 md:px-3 md:pb-3")}>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,audio/*,video/*,.pdf,application/pdf"
        multiple
        onChange={onFilePick}
      />
      <input
        ref={folderRef}
        type="file"
        className="hidden"
        // @ts-expect-error webkitdirectory is DOM-supported but not in TS lib
        webkitdirectory=""
        multiple
        onChange={onFolderPick}
      />
      <div className={cn("mx-auto space-y-3", isStudio ? "max-w-none" : "max-w-[min(100%,58rem)]")}>
        {/* Unified execution: workspace prompt appears inline, same composer. */}
        {!isStudio && <WorkspaceNeededBanner />}
        {!isStudio && <AgentAwaitingBar />}
        {/* Desktop layer-down: one banner, one click — never the maze. */}
        {!isStudio && <LayerDownBanner />}
        {!isStudio && modeSuggestion && isDesktopApp() && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px]"
            role="status"
          >
            <span className="text-muted-foreground">
              Suggest <span className="font-medium capitalize text-foreground">{modeSuggestion.mode}</span>
              {modeSuggestion.reason ? ` — ${modeSuggestion.reason}` : ""}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                setExecutionMode(modeSuggestion.mode);
                setModeSuggestion(null);
              }}
            >
              Switch to {modeSuggestion.mode}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => setModeSuggestion(null)}
            >
              Dismiss
            </Button>
          </div>
        )}
        {/* First-run AI chooser — home only, never stacked in studio. */}
        {!isStudio &&
          !layerActive &&
          !isLoadingConfig &&
          !agentRuntimeChosen &&
          !canSendMessage(apiConfig) &&
          !(
            isDesktopApp() &&
            (apiConfig.aiProvider === "openai_compatible" || apiConfig.aiProvider === "local_gguf")
          ) && (
            <div className="rounded-xl border border-border/50 bg-muted/20 px-2 py-3">
              {isDesktopApp() ? (
                <ChatProviderPicker />
              ) : (
                <Alert variant="default" className="border-border/60 bg-transparent py-2">
                  <AlertTitle className="text-xs">Choose AI</AlertTitle>
                  <AlertDescription className="text-[11px]">
                    Add a cloud API key, or use Ollama.{" "}
                    <Link to="/settings" className="font-medium text-primary hover:underline">
                      Settings
                    </Link>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

        {!isStudio &&
          !layerActive &&
          !isWebClient() &&
          apiConfig.aiProvider === "local_gguf" &&
          canSendChat(apiConfig) &&
          !parseGgufRegistryId(apiConfig.model) && (
            <Alert variant="default" className="border-primary/40 bg-primary/5">
              <AlertTitle className="text-sm">Local model not selected</AlertTitle>
              <AlertDescription className="text-xs">
                Download a GGUF in{" "}
                <Link to="/labs" className="font-medium text-primary hover:underline">
                  Labs → Local model hub
                </Link>
                , then pick it under Settings → AI & models → Local file model (GGUF).
              </AlertDescription>
            </Alert>
          )}

        {(apiConfig.braveSearchApiKey || apiConfig.researchProxyUrl) && (
          <Alert variant="default" className="border-primary/40 bg-primary/5">
            <AlertTitle className="text-sm">API keys in browser</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Keys are in localStorage. Brave Search only works through a server proxy (browser CORS).
              Use <code className="text-[10px]">npm run research-proxy</code> and point Research proxy to{" "}
              <code className="text-[10px]">http://127.0.0.1:8787</code>.
            </AlertDescription>
          </Alert>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="relative group rounded-lg border border-border overflow-hidden w-20 h-20 bg-muted/40"
              >
                {a.kind === "pdf" ? (
                  <div className="flex flex-col items-center justify-center h-full p-1 text-[10px] text-center text-muted-foreground">
                    <FileText className="h-7 w-7 text-primary" />
                    PDF
                  </div>
                ) : a.kind === "audio" ? (
                  <div className="flex items-center justify-center h-full p-1 text-[10px] text-center">
                    <Mic className="h-6 w-6 mx-auto text-primary" />
                  </div>
                ) : (
                  <img src={a.dataUrl} alt="" className="w-full h-full object-cover" />
                )}
                <button
                  type="button"
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 text-white text-xs flex items-center justify-center"
                  onClick={() => removeAtt(a.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="composer-shell relative flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-sm ring-1 ring-border/70 md:p-2">
          {slashOpen && (
            <ComposerSlashMenu
              query={slashQuery ?? ""}
              notebook={isNotebookRoute}
              activeIndex={Math.min(slashIndex, Math.max(0, filteredSlashItems.length - 1))}
              onHoverIndex={setSlashIndex}
              onPick={pickSlashItem}
            />
          )}
          {sendQueue.length > 0 && (
            <div className="flex items-center gap-2 px-3 pt-1 text-[11px] text-muted-foreground">
              <ListOrdered className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">
                {sendQueue.length} queued — will send when the current reply finishes
              </span>
              <button
                type="button"
                className="shrink-0 underline hover:text-foreground"
                onClick={() => setSendQueue([])}
              >
                Clear
              </button>
            </div>
          )}
          <Textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setSlashIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              placeholderOverride ??
              (layerActive
                ? isLoading
                  ? sendQueue.length > 0
                    ? "Type next message — Enter queues while reply runs…"
                    : "Working… — Enter queues another message"
                  : "Message…  (type / for commands)"
                : getComposerPlaceholder(apiConfig, {
                    isLoadingConfig,
                    workspacePlaceholder: workspaceMeta?.composerPlaceholder,
                    comparisonEnabled: apiConfig.comparisonEnabled,
                  }))
            }
            className={cn(
              "resize-none border-0 bg-transparent px-3 py-2 text-[15px] leading-6 text-foreground shadow-none outline-none placeholder:text-muted-foreground/75 focus:outline-none focus-visible:outline-none focus-visible:ring-0 selection:bg-primary/45 selection:text-foreground sm:text-base",
              isStudio ? "min-h-[2.5rem] max-h-40 text-sm" : "min-h-[2.75rem] max-h-48"
            )}
            style={{
              minHeight: isStudio ? "2.5rem" : "2.75rem",
              maxHeight: isStudio ? "10rem" : "12rem",
              overflowY: "auto",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              const cap = isStudio ? 160 : 192;
              target.style.height = "auto";
              target.style.height = `${Math.min(Math.max(target.scrollHeight, isStudio ? 40 : 44), cap)}px`;
            }}
            ref={textareaRef}
          />

          <div className="flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              <Popover open={plusOpen} onOpenChange={setPlusOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 rounded-full p-0"
                    aria-label="Add attachment or tools"
                  >
                    <Plus size={16} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-1.5">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    onClick={() => {
                      fileRef.current?.click();
                      setPlusOpen(false);
                    }}
                    disabled={!unifiedChatReady}
                  >
                    <Paperclip className="h-4 w-4 text-muted-foreground" /> Attach file
                  </button>
                  {isDesktopApp() && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      onClick={() => {
                        folderRef.current?.click();
                        setPlusOpen(false);
                      }}
                    >
                      <FolderInput className="h-4 w-4 text-muted-foreground" /> Attach folder
                    </button>
                  )}
                  {isDesktopApp() && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      onClick={() => {
                        void attachScreenshot();
                        setPlusOpen(false);
                      }}
                      disabled={capturing}
                    >
                      <Camera className="h-4 w-4 text-muted-foreground" /> Screenshot
                    </button>
                  )}
                  {isLoading || sendQueue.length > 0 ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      disabled={!message.trim() && attachments.length === 0}
                      onClick={() => {
                        void enqueueOrSend("send", { forceQueue: true });
                        setPlusOpen(false);
                      }}
                    >
                      <ListPlus className="h-4 w-4 text-muted-foreground" /> Queue for next
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    disabled={!message.trim()}
                    onClick={() => {
                      void enqueueOrSend("agent");
                      setPlusOpen(false);
                    }}
                  >
                    <Bot className="h-4 w-4 text-muted-foreground" /> Send as agent task
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    disabled={!message.trim()}
                    onClick={() => {
                      void enqueueOrSend("plan");
                      setPlusOpen(false);
                    }}
                  >
                    <ListOrdered className="h-4 w-4 text-muted-foreground" /> Plan first, then act
                  </button>
                  {composerWs?.activeFile && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      onClick={() => {
                        void attachActiveFile();
                        setPlusOpen(false);
                      }}
                    >
                      <FileCode2 className="h-4 w-4 text-muted-foreground" /> Active file
                    </button>
                  )}
                  {isStudio && (
                    <>
                      <div className="my-1 border-t border-border/50" />
                      <div className="px-1 py-1">
                        <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Runtime
                        </p>
                        <ComposerRuntimePicker />
                      </div>
                      <DropdownMenu
                        onOpenChange={(open) => {
                          if (!open) setModelFilter("");
                        }}
                      >
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                          >
                            <Bot className="h-4 w-4 text-muted-foreground" />
                            Model ·{" "}
                            {layerActive
                              ? shortModelLabel(openCodeModel)
                              : shortModelLabel(effectiveModel?.modelId || apiConfig.model)}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64 max-h-60 overflow-y-auto">
                          {layerActive
                            ? filteredOpenCodeModels.map((m) => (
                                <DropdownMenuItem key={m.id} onClick={() => setOpenCodeModel(m.id)}>
                                  <span className="flex-1 truncate">{m.displayName || shortModelLabel(m.id)}</span>
                                  {openCodeModel === m.id ? <span className="text-primary">✓</span> : null}
                                </DropdownMenuItem>
                              ))
                            : filteredSelectable.map((m) => (
                                <DropdownMenuItem key={m.id} onClick={() => handleModelChange(m.id)}>
                                  <span className="flex-1 truncate">{m.name || shortModelLabel(m.id)}</span>
                                  {apiConfig.model === m.id ? <span className="text-primary">✓</span> : null}
                                </DropdownMenuItem>
                              ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                  {!isStudio && (
                    <>
                      {isDesktopApp() && (
                        <>
                          <div className="my-1 border-t border-border/50" />
                          <div className="px-1 py-1">
                            <WorkspaceSelector />
                          </div>
                        </>
                      )}
                      <div className="my-1 border-t border-border/50" />
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        onClick={() => {
                          setPlusOpen(false);
                          setToolsOpen(true);
                        }}
                      >
                        <Wrench className="h-4 w-4 text-muted-foreground" /> Tools &amp; modes
                      </button>
                    </>
                  )}
                  <p className="px-2 py-1.5 text-[10px] text-muted-foreground">Type / for commands</p>
                </PopoverContent>
              </Popover>
              {!isStudio && (
                <ToolsPopover
                  message={message}
                  setMessage={setMessage}
                  open={toolsOpen}
                  onOpenChange={setToolsOpen}
                  showTrigger={false}
                />
              )}

              {!isStudio && (
                <>
                  <ComposerRuntimePicker compact />

                  <DropdownMenu
                    onOpenChange={(open) => {
                      if (!open) setModelFilter("");
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 max-w-[7.5rem] shrink-0 gap-1 rounded-full border border-border/40 px-2 text-xs"
                      >
                        <Bot size={14} className="shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate font-medium">
                          {layerActive
                            ? shortModelLabel(openCodeModel)
                            : shortModelLabel(effectiveModel?.modelId || apiConfig.model)}
                        </span>
                        <ChevronDown size={12} className="shrink-0 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="flex max-h-[min(55vh,360px)] w-[min(100vw-2rem,22rem)] flex-col overflow-hidden"
                    >
                      <div className="border-b border-border/60 p-2">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={modelFilter}
                            onChange={(e) => setModelFilter(e.target.value)}
                            placeholder="Search models…"
                            className="h-8 pl-7 text-xs"
                            onKeyDown={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        </div>
                      </div>
                      {layerActive ? (
                        <div className="max-h-60 overflow-y-auto p-1">
                          {filteredOpenCodeModels.map((m) => (
                            <DropdownMenuItem key={m.id} onClick={() => setOpenCodeModel(m.id)}>
                              <span className="flex-1 truncate">{m.displayName || shortModelLabel(m.id)}</span>
                              {openCodeModel === m.id ? <span className="text-primary">✓</span> : null}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      ) : (
                        <div className="max-h-60 overflow-y-auto p-1">
                          {filteredSelectable.map((m) => (
                            <DropdownMenuItem key={m.id} onClick={() => handleModelChange(m.id)}>
                              <span className="flex-1 truncate">{m.name || shortModelLabel(m.id)}</span>
                              <ModelCapabilityBadges modelId={m.id} meta={m} compact className="shrink-0" />
                              {apiConfig.model === m.id ? <span className="text-primary">✓</span> : null}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {!isStudio && (
                <VoiceInputButton setComposerMessage={setMessage} />
              )}
              {isLoading && (
                <Button
                  type="button"
                  onClick={() => stopStreaming()}
                  size="sm"
                  className="h-8 w-8 rounded-lg bg-destructive p-0 text-destructive-foreground hover:bg-destructive/90"
                  aria-label="Stop"
                >
                  <Square size={14} />
                </Button>
              )}
              <div className="flex items-center">
                <Button
                  type="button"
                  onClick={() => void handleSendMessage()}
                  disabled={
                    (!message.trim() && attachments.length === 0) ||
                    isLoadingConfig ||
                    (!layerActive &&
                      (isStudio
                        ? !canSendChat(apiConfig) ||
                          (apiConfig.aiProvider === "local_gguf" && !canSendMessage(apiConfig))
                        : !canSendMessage(apiConfig)))
                  }
                  size="sm"
                  className={cn(
                    "h-8 rounded-lg bg-primary p-0 text-primary-foreground hover:bg-primary/90",
                    isLoading ? "w-8 rounded-r-none" : "w-8"
                  )}
                  aria-label={isLoading ? "Queue message" : "Send"}
                  title={isLoading ? "Queue to send next" : "Send"}
                >
                  {isLoading ? <ListPlus size={14} /> : <ArrowUp size={14} />}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-8 w-6 rounded-l-none rounded-r-lg border-l border-primary-foreground/20 bg-primary px-0 text-primary-foreground hover:bg-primary/90"
                      aria-label="Send options"
                      disabled={
                        (!message.trim() && attachments.length === 0) ||
                        isLoadingConfig ||
                        (!layerActive &&
                          (isStudio
                            ? !canSendChat(apiConfig) ||
                              (apiConfig.aiProvider === "local_gguf" && !canSendMessage(apiConfig))
                            : !canSendMessage(apiConfig)))
                      }
                    >
                      <ChevronDown size={12} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => void enqueueOrSend("send")}>
                      <ArrowUp className="mr-2 h-3.5 w-3.5" />
                      {isLoading ? "Queue reply" : "Send now"}
                    </DropdownMenuItem>
                    {isLoading || sendQueue.length > 0 ? (
                      <DropdownMenuItem onClick={() => void enqueueOrSend("send", { forceQueue: true })}>
                        <ListPlus className="mr-2 h-3.5 w-3.5" />
                        Queue for next
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => void enqueueOrSend("agent")}>
                      <Bot className="mr-2 h-3.5 w-3.5" />
                      Send as agent task
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void enqueueOrSend("plan")}>
                      <ListOrdered className="mr-2 h-3.5 w-3.5" />
                      Plan first, then act
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default ChatInput;
