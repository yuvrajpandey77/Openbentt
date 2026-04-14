import React, { useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Bot, ChevronDown, Columns2, Paperclip, Square, ImageIcon, Mic, Film, FileText } from "lucide-react";
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
import { shortModelLabel } from "@/lib/openrouter";
import { dedupeModels, normalizeApiConfig, canSendChat, type MessageAttachment } from "@/types/chat";
import { useToast } from "@/components/ui/use-toast";
import { v4 as uuidv4 } from "uuid";
import { readFileAsDataUrl, extractVideoFrameDataUrl, assertImageSize } from "@/lib/media";
import { extractTextFromPdfFile } from "@/lib/pdfText";
import { ModelSpecDialog } from "@/components/ModelSpecDialog";
import { ToolsPopover } from "@/components/ToolsPopover";
import { ModelCapabilityBadges } from "@/components/ModelCapabilityBadges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { WorkspaceRouteMeta } from "@/config/workspaceRouteMeta";

interface ChatInputProps {
  isLoading: boolean;
  /** When set (workspace routes), placeholder and system context match this page. */
  workspaceMeta?: WorkspaceRouteMeta;
}

const MAX_COMPARE = 4;

type RouteDraft = { text: string; attachments: MessageAttachment[] };

const ChatInput: React.FC<ChatInputProps> = ({ isLoading, workspaceMeta }) => {
  const location = useLocation();
  const pathKey = location.pathname;

  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
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
    isLoadingConfig,
    sendMessage,
    pendingComposer,
    clearPendingComposer,
  } = useChat();
  const { toast } = useToast();
  const { data: models, isLoading: modelsLoading, isError: modelsError } = useOpenRouterModels(
    apiConfig.apiKey,
    apiConfig.openAiCompatibleBaseUrl,
    apiConfig.aiProvider
  );

  const selectable = useMemo(
    () =>
      buildSelectableModels(
        models,
        apiConfig.customModelIds,
        [apiConfig.model, ...apiConfig.comparisonModelIds],
        { includeAllFromApi: apiConfig.aiProvider !== "openrouter" }
      ),
    [models, apiConfig.customModelIds, apiConfig.model, apiConfig.comparisonModelIds, apiConfig.aiProvider]
  );

  const selectedModelMeta = useMemo(
    () => selectable.find((m) => m.id === apiConfig.model),
    [selectable, apiConfig.model]
  );

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

  /** Swap drafts on navigation before paint so we never persist the wrong route’s text. */
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

  /** Keep in-memory drafts aligned with the textarea for each pathname (Thread vs each workspace). */
  useEffect(() => {
    draftsRef.current[pathKey] = { text: message, attachments };
  }, [message, attachments, pathKey]);

  const handleSendMessage = async () => {
    if (apiConfig.comparisonEnabled && dedupeModels(apiConfig.comparisonModelIds).length < 2) {
      toast({
        title: "Pick at least two models",
        description: "Open the comparison panel and select 2–4 models for tiled mode.",
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleStop = () => {
    stopStreaming();
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
          description: "Load the model list (API key) or add custom model IDs, then pick two or more for tiling.",
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
    if (next.length === 0) {
      next = [apiConfig.model];
    }
    setApiConfig(normalizeApiConfig({ ...apiConfig, comparisonModelIds: next }));
  };

  const addAttachment = async (file: File) => {
    try {
      if (file.type.startsWith("image/")) {
        assertImageSize(file);
        const dataUrl = await readFileAsDataUrl(file);
        setAttachments((a) => [
          ...a,
          {
            id: uuidv4(),
            kind: "image",
            mediaType: file.type,
            name: file.name,
            dataUrl,
          },
        ]);
        return;
      }
      if (file.type.startsWith("audio/")) {
        const dataUrl = await readFileAsDataUrl(file);
        if (file.size > 12 * 1024 * 1024) {
          throw new Error("Audio file too large (max ~12 MB)");
        }
        setAttachments((a) => [
          ...a,
          {
            id: uuidv4(),
            kind: "audio",
            mediaType: file.type,
            name: file.name,
            dataUrl,
          },
        ]);
        return;
      }
      if (file.type.startsWith("video/")) {
        toast({ title: "Video", description: "Extracting a preview frame for vision models…" });
        const dataUrl = await extractVideoFrameDataUrl(file);
        setAttachments((a) => [
          ...a,
          {
            id: uuidv4(),
            kind: "video_frame",
            mediaType: "image/jpeg",
            name: `${file.name} (frame)`,
            dataUrl,
          },
        ]);
        return;
      }
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        toast({ title: "PDF", description: "Extracting text…" });
        const extractedText = await extractTextFromPdfFile(file);
        setAttachments((a) => [
          ...a,
          {
            id: uuidv4(),
            kind: "pdf",
            name: file.name,
            extractedText,
          },
        ]);
        return;
      }
      toast({
        title: "Unsupported file",
        description: "Use image, audio, video (frame), or PDF.",
        variant: "destructive",
      });
    } catch (e) {
      toast({
        title: "Attachment failed",
        description: e instanceof Error ? e.message : "Could not read file",
        variant: "destructive",
      });
    }
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    void (async () => {
      for (const f of Array.from(files)) {
        await addAttachment(f);
      }
    })();
    e.target.value = "";
  };

  const removeAtt = (id: string) => {
    setAttachments((a) => a.filter((x) => x.id !== id));
  };

  return (
    <div className="border-t border-border/70 bg-gradient-to-t from-card/80 via-card/50 to-transparent px-3 pb-4 pt-3 backdrop-blur-md">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,audio/*,video/*,.pdf,application/pdf"
        multiple
        onChange={onFilePick}
      />
      <div className="mx-auto max-w-5xl space-y-3">
        {(apiConfig.braveSearchApiKey || apiConfig.researchProxyUrl) && (
          <Alert variant="default" className="border-amber-500/40 bg-amber-500/5">
            <AlertTitle className="text-sm">API keys in browser</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Keys and URLs are in localStorage (visible in DevTools). Brave Search only works through a server proxy
              (browser CORS). Prefer <code className="text-[10px]">npm run research-proxy</code> with{" "}
              <code className="text-[10px]">BRAVE_SEARCH_API_KEY</code> and point Research proxy to{" "}
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
        <div className="composer-shell relative p-1.5 sm:p-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isLoadingConfig
                ? "Loading..."
                : !canSendChat(apiConfig)
                  ? "Add an API key or a local /v1 base URL in Settings"
                  : workspaceMeta
                    ? workspaceMeta.composerPlaceholder
                    : apiConfig.comparisonEnabled
                      ? "Same prompt goes to each selected model…"
                      : "Ask anything, or attach image / audio / video…"
            }
            disabled={isLoading || isLoadingConfig || !canSendChat(apiConfig)}
            className="min-h-[7.5rem] max-h-96 resize-none border-0 bg-transparent px-3 pb-14 pt-3 text-[15px] leading-relaxed text-foreground shadow-none outline-none placeholder:text-muted-foreground/75 focus:border-0 focus:outline-none focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-base"
            style={{
              height: "auto",
              minHeight: "7.5rem",
              maxHeight: "24rem",
              overflowY: message.length > 500 ? "auto" : "hidden",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 24 * 16) + "px";
            }}
          />

          <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-9 max-w-[min(100%,22rem)] flex-col items-stretch gap-1 border border-border/50 bg-background/90 px-2 py-1.5 text-sm shadow-sm backdrop-blur hover:bg-muted/90 sm:flex-row sm:items-center"
                >
                  <span className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
                    <Bot size={15} className="shrink-0" />
                    <span className="truncate text-left font-medium">{shortModelLabel(apiConfig.model)}</span>
                    <ChevronDown size={13} className="ml-auto shrink-0 sm:ml-1" />
                  </span>
                  <ModelCapabilityBadges
                    modelId={apiConfig.model}
                    meta={selectedModelMeta}
                    compact
                    className="justify-start pl-0 sm:pl-7"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="flex max-h-[min(70vh,420px)] w-[min(100vw-2rem,28rem)] flex-col overflow-hidden">
                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border/60">
                  {modelsLoading && "Loading models…"}
                  {modelsError && "Could not load models — check key or try Settings."}
                  {!modelsLoading && !modelsError && `${selectable.length} models (free + custom)`}
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

            <ModelSpecDialog modelId={apiConfig.model} models={models} />

            <ToolsPopover message={message} setMessage={setMessage} />

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={apiConfig.comparisonEnabled ? "secondary" : "ghost"}
                  size="sm"
                  className="h-9 px-2.5 text-sm border border-border/60"
                >
                  <Columns2 size={15} className="mr-1 shrink-0" />
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

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 bg-background/80 border border-border/60"
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={!canSendChat(apiConfig) || isLoading}
                  >
                    <Paperclip size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Attach images, audio, or video (frame)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 bg-background/80 border border-border/60 hidden sm:inline-flex"
                    type="button"
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImageIcon size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Images</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 bg-background/80 border border-border/60 hidden md:inline-flex"
                    type="button"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Film size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Video → frame preview</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="absolute bottom-2 right-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={isLoading ? handleStop : handleSendMessage}
                    disabled={
                      (!message.trim() && attachments.length === 0) || !canSendChat(apiConfig) || isLoadingConfig
                    }
                    size="sm"
                    className={`h-9 w-9 p-0 ${
                      isLoading
                        ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        : "bg-primary hover:bg-primary/90 text-primary-foreground"
                    }`}
                  >
                    {isLoading ? <Square size={15} /> : <ArrowUp size={15} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isLoading ? "Stop" : "Send"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
