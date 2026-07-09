import React, { useMemo, useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUp,
  Bot,
  ChevronDown,
  Columns2,
  Paperclip,
  PlusCircle,
  Square,
  FileText,
  Mic,
  MoreHorizontal,
} from "lucide-react";
import { useChat } from "@/context/ChatContext";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOpenRouterModels, buildSelectableModels } from "@/hooks/useOpenRouterModels";
import { useLocalGgufRegistryModels } from "@/hooks/useLocalGgufRegistryModels";
import { shortModelLabel } from "@/lib/openrouter";
import { dedupeModels, normalizeApiConfig, canSendChat, canSendMessage, type MessageAttachment } from "@/types/chat";
import { parseGgufRegistryId } from "@/lib/localGguf/ids";
import { Link } from "react-router-dom";
import { getComposerPlaceholder } from "@/lib/composerPlaceholder";
import { ModelDownloadProgressBar } from "@/components/ModelDownloadProgressBar";
import { getLocalWeightsConsent } from "@/lib/gemmaWebGpu/localModelConsent";
import { isLocalModelMarkedCached } from "@/lib/gemmaWebGpu/localModelCacheFlag";
import {
  isLocalGemmaWeightsLoaded,
  ensureLocalGemmaLoaded,
} from "@/lib/gemmaWebGpu/localGemmaInference";
import {
  LOCAL_GEMMA_SELECTABLE_MODELS,
  LOCAL_TINY_MODEL_ID,
  getLocalModelEntry,
} from "@/lib/gemmaWebGpu/models";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { v4 as uuidv4 } from "uuid";
import { readFileAsDataUrl, extractVideoFrameDataUrl, assertImageSize } from "@/lib/media";
import { extractTextFromPdfFile } from "@/lib/pdfText";
import { ModelSpecDialog } from "@/components/ModelSpecDialog";
import { ToolsPopover } from "@/components/ToolsPopover";
import { PromptSnippetsMenu } from "@/components/PromptSnippetsMenu";
import { ModelCapabilityBadges } from "@/components/ModelCapabilityBadges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import LocalOnDeviceModelBar from "@/components/LocalOnDeviceModelBar";
import type { WorkspaceRouteMeta } from "@/config/workspaceRouteMeta";
import { cn } from "@/lib/utils";
import { isWebClient } from "@/config/platformSurface";
import { isWebChatRoute } from "@/components/web/webChatRoute";
import { WebChatStarterPrompts } from "@/components/web/WebChatStarterPrompts";
import { useWebChatUiOptional } from "@/context/WebChatUiContext";
import { buildChatMarkdownExport, downloadTextFile } from "@/lib/chatExportMarkdown";
import {
  findUnsupportedVisionAttachments,
  imageUnsupportedMessage,
  modelSupportsImages,
} from "@/lib/attachmentModelSupport";
import { AttachmentPreviewErrorBoundary } from "@/components/web/AttachmentPreviewErrorBoundary";

interface ChatInputProps {
  isLoading: boolean;
  workspaceMeta?: WorkspaceRouteMeta;
  placeholderOverride?: string;
  /** Smaller composer for embedded notebook dock. */
  variant?: "default" | "compact" | "studio";
}

const MAX_COMPARE = 4;

type RouteDraft = { text: string; attachments: MessageAttachment[] };

const ChatInput: React.FC<ChatInputProps> = ({
  isLoading,
  workspaceMeta,
  placeholderOverride,
  variant = "default",
}) => {
  const isStudio = variant === "studio";
  const isCompact = variant === "compact" || isStudio;
  const location = useLocation();
  const pathKey = location.pathname;

  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [showExtras, setShowExtras] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftsRef = useRef<Record<string, RouteDraft>>({});
  const lastPathRef = useRef<string | null>(null);
  const messageRef = useRef(message);
  const attachmentsRef = useRef(attachments);
  messageRef.current = message;
  attachmentsRef.current = attachments;

  const {
    apiConfig,
    setApiConfig,
    stopStreaming,
    webgpuModelDownloadProgress,
    isLoadingConfig,
    sendMessage,
    pendingComposer,
    clearPendingComposer,
    chats,
    currentChatId,
  } = useChat();
  const webUi = useWebChatUiOptional();
  const isWebChat = isWebChatRoute(pathKey) && variant === "default";
  const webTextareaRef = useRef<HTMLTextAreaElement>(null);
  const syncWebTextareaHeight = useCallback(() => {
    const el = webTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxPx = window.matchMedia("(min-width: 768px)").matches ? 208 : 128;
    const next = Math.min(el.scrollHeight, maxPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, []);
  const [webToolsOpen, setWebToolsOpen] = useState(false);
  const [webSnippetsOpen, setWebSnippetsOpen] = useState(false);
  const [webSpecsOpen, setWebSpecsOpen] = useState(false);
  const [webSetupOpen, setWebSetupOpen] = useState(false);
  /** Bumps when localStorage consent changes so web /chat re-reads getLocalWeightsConsent(). */
  const [localConsentTick, setLocalConsentTick] = useState(0);
  const [plusOpen, setPlusOpen] = useState(false);
  const { toast } = useToast();
  const { data: models, isLoading: modelsLoading, isError: modelsError } = useOpenRouterModels(
    apiConfig.apiKey,
    apiConfig.openAiCompatibleBaseUrl,
    apiConfig.aiProvider
  );
  const { data: ggufModels } = useLocalGgufRegistryModels(apiConfig.aiProvider === "local_gguf");
  const [localDownloadOpen, setLocalDownloadOpen] = useState(false);
  const [localPrewarmPct, setLocalPrewarmPct] = useState<number | null>(null);
  const [localPrewarmBusy, setLocalPrewarmBusy] = useState(false);

  const selectable = useMemo(
    () =>
      apiConfig.aiProvider === "webgpu_gemma"
        ? buildSelectableModels(LOCAL_GEMMA_SELECTABLE_MODELS, apiConfig.customModelIds, [
            apiConfig.model,
            ...apiConfig.comparisonModelIds,
          ], { includeAllFromApi: true })
        : apiConfig.aiProvider === "local_gguf"
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

  const needsOnDeviceSetup = useMemo(
    () => apiConfig.aiProvider === "webgpu_gemma" && !getLocalWeightsConsent(),
    // localConsentTick re-reads localStorage after the setup dialog closes.
    [apiConfig.aiProvider, localConsentTick]
  );

  useEffect(() => {
    if (!isWebChat || !needsOnDeviceSetup) return;
    setWebSetupOpen(true);
  }, [isWebChat, needsOnDeviceSetup]);

  /** Reopen UX: if weights were cached before, warm them into RAM in the background. */
  useEffect(() => {
    if (apiConfig.aiProvider !== "webgpu_gemma") return;
    if (!getLocalWeightsConsent()) return;
    if (!isLocalModelMarkedCached(LOCAL_TINY_MODEL_ID)) return;
    if (isLocalGemmaWeightsLoaded()) return;
    const ac = new AbortController();
    void ensureLocalGemmaLoaded(
      LOCAL_TINY_MODEL_ID,
      () => {},
      ac.signal,
      {
        backendPreference: apiConfig.localInferenceProfile === "performance" ? "auto" : "wasm",
      }
    ).catch(() => {
      /* warm-up is best-effort; first send will retry */
    });
    return () => ac.abort();
  }, [apiConfig.aiProvider, apiConfig.localInferenceProfile]);

  useEffect(() => {
    if (!isWebChat || !webUi.composerSeed) return;
    setMessage(webUi.composerSeed);
    webUi.clearComposerSeed();
    requestAnimationFrame(() => {
      syncWebTextareaHeight();
      webTextareaRef.current?.focus();
    });
  }, [isWebChat, webUi.composerSeed, webUi.clearComposerSeed, syncWebTextareaHeight]);

  useLayoutEffect(() => {
    if (!isWebChat) return;
    syncWebTextareaHeight();
  }, [isWebChat, message, syncWebTextareaHeight]);

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

  const handleSendMessage = async () => {
    if (apiConfig.aiProvider === "webgpu_gemma" && !getLocalWeightsConsent()) {
      setWebSetupOpen(true);
      toast({
        title: "Enable on-device model first",
        description: "Confirm the ~400 MB download in the setup dialog, then send again.",
      });
      return;
    }
    if (apiConfig.comparisonEnabled && dedupeModels(apiConfig.comparisonModelIds).length < 2) {
      toast({
        title: "Pick at least two models",
        description: "Open Compare in the extras menu and select 2–4 models.",
        variant: "destructive",
      });
      return;
    }
    const unsupportedVision = findUnsupportedVisionAttachments(attachments, apiConfig, currentModelMeta);
    if (unsupportedVision.length > 0) {
      toast({
        title: "Images not supported",
        description: imageUnsupportedMessage(apiConfig.model),
        variant: "destructive",
      });
      return;
    }
    const t = message.trim();
    if ((!t && attachments.length === 0) || isLoading) return;

    const toSend = attachments;
    const textToSend = t;
    setMessage("");
    setAttachments([]);

    try {
      await sendMessage(textToSend, toSend);
    } catch {
      setMessage(textToSend);
      setAttachments(toSend);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && isLoading) {
      e.preventDefault();
      stopStreaming();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const runLocalPrewarmFromDialog = async () => {
    if (apiConfig.aiProvider !== "webgpu_gemma") return;
    if (!getLocalWeightsConsent()) {
      toast({
        title: "Allow on-device model first",
        description: "Complete the on-device model setup above the composer first.",
        variant: "destructive",
      });
      return;
    }
    setApiConfig(
      normalizeApiConfig({
        ...apiConfig,
        model: LOCAL_TINY_MODEL_ID,
        comparisonModelIds: [LOCAL_TINY_MODEL_ID],
      })
    );
    setLocalPrewarmBusy(true);
    setLocalPrewarmPct(0);
    const ac = new AbortController();
    try {
      await ensureLocalGemmaLoaded(
        LOCAL_TINY_MODEL_ID,
        (p) => setLocalPrewarmPct(p),
        ac.signal,
        {
          backendPreference: apiConfig.localInferenceProfile === "performance" ? "auto" : "wasm",
        }
      );
      toast({
        title: "Model cached",
        description: `${getLocalModelEntry(LOCAL_TINY_MODEL_ID).displayName} is ready for offline use.`,
      });
      setLocalDownloadOpen(false);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      toast({
        title: "Cache failed",
        description: e instanceof Error ? e.message : "Could not load model",
        variant: "destructive",
      });
    } finally {
      setLocalPrewarmBusy(false);
      setLocalPrewarmPct(null);
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

  const setComparisonEnabled = (enabled: boolean) => {
    if (enabled) {
      const ids = dedupeModels(apiConfig.comparisonModelIds);
      let nextIds = ids.length >= 2 ? ids : [];
      if (nextIds.length < 2) {
        const rest = selectable.map((m) => m.id).filter((id) => id !== apiConfig.model);
        nextIds = dedupeModels([apiConfig.model, rest[0] || apiConfig.model]).slice(0, MAX_COMPARE);
      }
      setApiConfig(
        normalizeApiConfig({
          ...apiConfig,
          comparisonEnabled: true,
          comparisonModelIds: nextIds.length >= 2 ? nextIds : [apiConfig.model],
        })
      );
      if (nextIds.length < 2) {
        toast({
          title: "Add models in settings",
          description: "Load the model list or add custom IDs, then pick two or more for tiling.",
        });
      }
    } else {
      setApiConfig(normalizeApiConfig({ ...apiConfig, comparisonEnabled: false }));
    }
  };

  const toggleCompareModel = (id: string, checked: boolean) => {
    let next = dedupeModels(apiConfig.comparisonModelIds);
    if (checked) {
      if (next.includes(id)) return;
      if (next.length >= MAX_COMPARE) {
        toast({ title: "Limit reached", description: `You can compare up to ${MAX_COMPARE} models.` });
        return;
      }
      next.push(id);
    } else {
      next = next.filter((x) => x !== id);
    }
    if (next.length === 0) next = [apiConfig.model];
    setApiConfig(normalizeApiConfig({ ...apiConfig, comparisonModelIds: next }));
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
        const extractedText = await extractTextFromPdfFile(file);
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

  const removeAtt = (id: string) => {
    setAttachments((a) => a.filter((x) => x.id !== id));
  };

  if (isWebChat) {
    const canSend = !!message.trim() || attachments.length > 0;
    const hasSent = !isEmpty;
    return (
      <div className={cn("web-composer-wrapper", hasSent ? "web-composer-wrapper--bottom" : "web-composer-wrapper--centered")}>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,audio/*,video/*,.pdf,application/pdf"
          multiple
          onChange={onFilePick}
        />

        {needsOnDeviceSetup && (
          <div className="mb-3 w-full max-w-xl">
            <LocalOnDeviceModelBar
              open={webSetupOpen}
              onOpenChange={(open) => {
                setWebSetupOpen(open);
                if (!open) setLocalConsentTick((n) => n + 1);
              }}
            />
          </div>
        )}

        {isLoading &&
          apiConfig.aiProvider === "webgpu_gemma" &&
          webgpuModelDownloadProgress != null && (
            <div className="mb-3 w-full max-w-xl">
              <ModelDownloadProgressBar
                title="Downloading Qwen 0.5B (one-time)"
                percentOnly
                progress={{
                  percent: webgpuModelDownloadProgress,
                  received: null,
                  total: null,
                  speedBps: null,
                  etaSeconds: null,
                }}
                hint="~400 MB. Keep this tab open — cached after the first download."
              />
            </div>
          )}

        {!hasSent && (
          <h1 className="web-hero-heading">Route your intelligence</h1>
        )}

        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <AttachmentPreviewErrorBoundary key={a.id} attachmentName={a.name} onRemove={() => removeAtt(a.id)}>
                <div className="relative group h-16 w-16 overflow-hidden rounded-xl bg-muted/40">
                  {a.kind === "pdf" ? (
                    <div className="flex h-full flex-col items-center justify-center p-1 text-[10px] text-muted-foreground">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                  ) : a.kind === "audio" ? (
                    <div className="flex h-full items-center justify-center p-1">
                      <Mic className="h-5 w-5 text-primary" />
                    </div>
                  ) : (
                    <img src={a.dataUrl} alt="" className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white opacity-0 group-hover:opacity-100"
                    onClick={() => removeAtt(a.id)}
                  >
                    Remove
                  </button>
                </div>
              </AttachmentPreviewErrorBoundary>
            ))}
          </div>
        )}

        <div className={cn("web-composer-pill", hasSent && "web-composer-pill--sent")}>
          <textarea
            ref={webTextareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's on your mind?"
            disabled={isLoading || isLoadingConfig || !canSendMessage(apiConfig)}
            rows={1}
            className="web-composer-input"
          />
          <div className="web-composer-toolbar">
            <Popover open={plusOpen} onOpenChange={setPlusOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="web-composer-icon"
                  aria-label="Add files or attachments"
                >
                  <PlusCircle size={18} strokeWidth={1.5} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                sideOffset={6}
                className="w-52 border-[#1a1a1a] bg-[#0a0a0a] p-1.5 shadow-xl"
              >
                <button
                  type="button"
                  onClick={() => { fileRef.current?.click(); setPlusOpen(false); }}
                  className="web-plus-item w-full"
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-[#16A34A]" strokeWidth={1.5} />
                  Upload files
                </button>
                <button
                  type="button"
                  onClick={() => { pickWithAccept("image/*"); setPlusOpen(false); }}
                  className="web-plus-item w-full"
                >
                  <FileText className="h-4 w-4 shrink-0 text-[#16A34A]" strokeWidth={1.5} />
                  Images
                </button>
                <button
                  type="button"
                  onClick={() => { pickWithAccept("audio/*"); setPlusOpen(false); }}
                  className="web-plus-item w-full"
                >
                  <Mic className="h-4 w-4 shrink-0 text-[#16A34A]" strokeWidth={1.5} />
                  Audio
                </button>
                <button
                  type="button"
                  onClick={() => { pickWithAccept(".pdf,application/pdf"); setPlusOpen(false); }}
                  className="web-plus-item w-full"
                >
                  <FileText className="h-4 w-4 shrink-0 text-[#16A34A]" strokeWidth={1.5} />
                  PDF
                </button>
              </PopoverContent>
            </Popover>
            <div className="flex-1" />
            <button
              type="button"
              onClick={isLoading ? () => stopStreaming() : () => void handleSendMessage()}
              disabled={!isLoading && !canSend}
              className={cn(
                "web-composer-icon shrink-0",
                isLoading || canSend ? "web-composer-icon--active" : ""
              )}
              aria-label={isLoading ? "Stop" : "Send"}
            >
              {isLoading ? (
                <Square size={14} strokeWidth={1.5} />
              ) : (
                <ArrowUp size={18} strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>

        {isEmpty && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <WebChatStarterPrompts onSelect={(text) => webUi?.setComposerSeed(text)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("border-t border-border/70 bg-gradient-to-t from-card/80 via-card/50 to-transparent backdrop-blur-md", isStudio ? "px-2 pb-2 pt-2" : "px-2 pb-2 pt-2 md:px-3 md:pb-4 md:pt-3")}>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,audio/*,video/*,.pdf,application/pdf"
        multiple
        onChange={onFilePick}
      />
      <div className={cn("mx-auto space-y-3", isStudio ? "max-w-none" : "max-w-5xl")}>
        {/* On-device model consent bar — only shown before user consents */}
        {!isStudio && <LocalOnDeviceModelBar />}

        {isStudio && !canSendChat(apiConfig) && !isLoadingConfig && (
          <Alert variant="default" className="border-primary/40 bg-primary/5 py-2">
            <AlertTitle className="text-xs">Set up AI to send messages</AlertTitle>
            <AlertDescription className="text-[11px]">
              {apiConfig.aiProvider === "local_gguf"
                ? "Download a GGUF in Labs, then pick it in Settings → AI & models."
                : apiConfig.aiProvider === "webgpu_gemma"
                  ? "Enable the on-device model in Settings, or switch to OpenRouter with an API key."
                  : "Add an OpenRouter API key in Settings → AI & models (sidebar ⚙️)."}
              {" "}
              <Link to="/setup" className="font-medium text-primary hover:underline">
                Open setup
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {!isStudio &&
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

        {isLoading && apiConfig.aiProvider === "webgpu_gemma" && webgpuModelDownloadProgress != null && (
          <ModelDownloadProgressBar
            title="Downloading on-device model (one-time)"
            percentOnly
            progress={{
              percent: webgpuModelDownloadProgress,
              received: null,
              total: null,
              speedBps: null,
              etaSeconds: null,
            }}
            hint="~400 MB one-time. Cached in this browser after the first download."
          />
        )}

        <div
          className={cn(
            "composer-shell flex flex-col gap-1.5 p-1.5 md:relative md:p-2",
            isStudio && "relative gap-0 p-1"
          )}
        >
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              placeholderOverride ??
              getComposerPlaceholder(apiConfig, {
                isLoadingConfig,
                workspacePlaceholder: workspaceMeta?.composerPlaceholder,
                comparisonEnabled: apiConfig.comparisonEnabled,
              })
            }
            disabled={isLoading || (!isStudio && (isLoadingConfig || !canSendMessage(apiConfig)))}
            className={cn(
              "resize-none border-0 bg-transparent px-3 text-[15px] leading-relaxed text-foreground shadow-none outline-none placeholder:text-muted-foreground/75 focus:border-0 focus:outline-none focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-base",
              isStudio
                ? "min-h-[2.25rem] max-h-24 py-2 pb-9 text-sm"
                : isCompact
                  ? "min-h-[2.75rem] max-h-32 py-2.5 pb-10"
                  : "min-h-[3.25rem] max-h-40 pb-2 pt-2.5 md:min-h-[7.5rem] md:max-h-96 md:pb-14 md:pt-3"
            )}
            style={{
              height: "auto",
              minHeight: isStudio ? "2.25rem" : isCompact ? "2.75rem" : undefined,
              maxHeight: isStudio ? "6rem" : undefined,
              overflowY: message.length > 500 ? "auto" : "hidden",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 24 * 16) + "px";
            }}
          />

          <div className={cn("flex items-center justify-between gap-1", !isStudio && "md:contents")}>
          {/* Bottom-left toolbar: model selector + attach + extras toggle */}
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto max-md:shrink-0",
              !isStudio &&
                "md:absolute md:bottom-2 md:left-2 md:max-w-[calc(100%-3.5rem)] md:flex-wrap md:gap-1",
              isStudio && "absolute bottom-2 left-2 max-w-[calc(100%-3.5rem)] flex-wrap gap-1"
            )}
          >
            {/* Model selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-auto shrink-0 border border-border/50 bg-background/90 shadow-sm backdrop-blur hover:bg-muted/90",
                    isStudio
                      ? "min-h-8 max-w-[11rem] flex-row items-center gap-1 px-2 py-1 text-xs"
                      : "h-8 max-w-[8.5rem] flex-row items-center gap-1 px-1.5 py-0 text-xs md:min-h-9 md:max-w-[min(100%,22rem)] md:gap-1.5 md:px-2 md:py-1.5 md:text-sm"
                  )}
                >
                  <Bot size={isStudio ? 14 : 14} className="shrink-0" />
                  <span className="min-w-0 truncate text-left font-medium">{shortModelLabel(apiConfig.model)}</span>
                  <ChevronDown size={12} className="shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="flex max-h-[min(70vh,420px)] w-[min(100vw-2rem,28rem)] flex-col overflow-hidden">
                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border/60">
                  {modelsLoading && "Loading models…"}
                  {modelsError && "Could not load models — check key or try Settings."}
                  {!modelsLoading && !modelsError && `${selectable.length} models available`}
                </div>
                <div className="max-h-80 overflow-y-auto p-1">
                  {selectable.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => handleModelChange(m.id)}
                      className="flex cursor-pointer flex-col items-stretch gap-2 py-2.5"
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 text-left">
                          <span className="font-medium leading-tight">{m.name || shortModelLabel(m.id)}</span>
                          <span className="block break-all text-[11px] text-muted-foreground">{m.id}</span>
                        </div>
                        <ModelCapabilityBadges modelId={m.id} meta={m} compact className="shrink-0" />
                      </div>
                    </DropdownMenuItem>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {!isStudio && (
              <div className="hidden md:block">
                <ModelSpecDialog modelId={apiConfig.model} models={models} />
              </div>
            )}

            {/* Single attach button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0 border border-border/60 bg-background/80 md:h-9 md:w-9"
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={!canSendChat(apiConfig) || isLoading}
                  >
                    <Paperclip size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Attach — image, audio, video, or PDF</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Extras toggle ··· */}
            {!isStudio && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showExtras ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0 border border-border/60 bg-background/80 md:h-9 md:w-9"
                    type="button"
                    onClick={() => setShowExtras((v) => !v)}
                    aria-label="More options"
                  >
                    <MoreHorizontal size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Tools, snippets, compare models</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            )}

            {/* Extras row — shown when ··· is active */}
            {!isStudio && showExtras && (
              <>
                <ToolsPopover message={message} setMessage={setMessage} />

                <PromptSnippetsMenu
                  onInsert={(text) => {
                    setMessage((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
                  }}
                />

                {/* Compare models */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={apiConfig.comparisonEnabled ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 shrink-0 px-2 text-xs border border-border/60 md:h-9 md:px-2.5 md:text-sm"
                    >
                      <Columns2 size={14} className="mr-1 shrink-0" />
                      <span className="hidden sm:inline">Compare</span>
                      {apiConfig.comparisonEnabled && (
                        <span className="ml-1 rounded bg-primary/15 px-1.5 text-[10px] text-primary">on</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-96 p-0" align="start">
                    <div className="p-3 border-b border-border/60 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="compare-switch" className="text-sm">
                          Tiled comparison
                        </Label>
                        <Switch
                          id="compare-switch"
                          checked={apiConfig.comparisonEnabled}
                          onCheckedChange={setComparisonEnabled}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        One prompt → 2–4 models in parallel. Each answer in its own tile with timing metrics.
                      </p>
                    </div>
                    <ScrollArea className="h-72">
                      <div className="p-3 space-y-2">
                        {selectable.map((m) => {
                          const checked = dedupeModels(apiConfig.comparisonModelIds).includes(m.id);
                          return (
                            <label
                              key={`cmp-${m.id}`}
                              className="flex items-start gap-2 rounded-md border border-transparent px-1 py-1.5 hover:bg-muted/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => toggleCompareModel(m.id, v === true)}
                                className="mt-0.5"
                              />
                              <span className="text-sm leading-snug">
                                <span className="font-medium block">{m.name || shortModelLabel(m.id)}</span>
                                <span className="text-[11px] text-muted-foreground break-all">{m.id}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    <div className="p-3 text-[11px] text-muted-foreground border-t border-border/60">
                      Selected: {dedupeModels(apiConfig.comparisonModelIds).length} / {MAX_COMPARE}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* WebGPU: pre-cache model */}
                {apiConfig.aiProvider === "webgpu_gemma" && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-2.5 border border-border/60 text-xs"
                          type="button"
                          onClick={() => setLocalDownloadOpen(true)}
                          disabled={isLoading}
                        >
                          Download model
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download & cache Qwen 0.5B (~400 MB) in this browser</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </>
            )}
          </div>

          {/* Bottom-right: send / stop */}
          <div
            className={cn(
              "shrink-0",
              !isStudio && "md:absolute md:bottom-2 md:right-2",
              isStudio && "absolute bottom-2 right-2"
            )}
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={isLoading ? () => stopStreaming() : () => void handleSendMessage()}
                    disabled={
                      isLoading
                        ? false
                        : ((!message.trim() && attachments.length === 0) ||
                            isLoadingConfig ||
                            (isStudio
                              ? !canSendChat(apiConfig) ||
                                (apiConfig.aiProvider === "local_gguf" && !canSendMessage(apiConfig)) ||
                                (apiConfig.aiProvider === "webgpu_gemma" && !getLocalWeightsConsent())
                              : !canSendMessage(apiConfig) ||
                                (apiConfig.aiProvider === "webgpu_gemma" && !getLocalWeightsConsent())))
                    }
                    size="sm"
                    className={cn(
                      "h-8 w-8 p-0 relative z-20 md:h-9 md:w-9",
                      isLoading
                        ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        : "bg-primary hover:bg-primary/90 text-primary-foreground"
                    )}
                  >
                    {isLoading ? <Square size={14} /> : <ArrowUp size={14} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isLoading ? "Stop (Esc)" : "Send (Enter)"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          </div>
        </div>
      </div>

      {/* Pre-cache dialog (WebGPU) */}
      <Dialog open={localDownloadOpen} onOpenChange={setLocalDownloadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Download on-device model</DialogTitle>
            <DialogDescription>
              Cache Qwen 2.5 0.5B (~400 MB) in this browser so the first chat starts faster.
            </DialogDescription>
          </DialogHeader>
          {!getLocalWeightsConsent() ? (
            <p className="text-sm text-muted-foreground">
              Complete the on-device model setup (shown above the composer) before downloading.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                <p className="text-sm font-medium">{getLocalModelEntry(LOCAL_TINY_MODEL_ID).displayName}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {getLocalModelEntry(LOCAL_TINY_MODEL_ID).subtitle}
                </p>
              </div>
              {localPrewarmPct != null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Progress</span>
                    <span>{localPrewarmPct}%</span>
                  </div>
                  <Progress value={localPrewarmPct} className="h-2" />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLocalDownloadOpen(false)} disabled={localPrewarmBusy}>
              Close
            </Button>
            {getLocalWeightsConsent() && (
              <Button type="button" onClick={() => void runLocalPrewarmFromDialog()} disabled={localPrewarmBusy}>
                {localPrewarmBusy ? "Downloading…" : "Download to cache"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatInput;
