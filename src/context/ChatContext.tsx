import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Chat,
  Message,
  ApiKeyConfig,
  ComparisonResponse,
  ResponseMetrics,
  MessageAttachment,
  ResearchSourceRef,
  AgentTraceStep,
  normalizeApiConfig,
  defaultApiConfig,
  dedupeModels,
  canSendChat,
} from "@/types/chat";
import { useToast } from "@/components/ui/use-toast";
import { buildChatCompletionMessages, isStreamHttpError, StreamHttpError } from "@/lib/openrouter";
import { streamChatForConfig } from "@/lib/aiStream";
import { abortLocalGemmaGeneration } from "@/lib/gemmaWebGpu/streamLocalGemma";
import { createRafBatcher } from "@/lib/streamBatch";
import { gatherResearchContext } from "@/lib/researchSources";
import { buildSystemPrompts } from "@/lib/systemPrompts";
import { substituteInlineCalc } from "@/lib/mathInline";
import type { ProviderQuotaSnapshot } from "@/lib/providerRateLimits";
import { LOCAL_STORAGE_KEYS } from "@/lib/storageMigrate";
import { formatUserFacingError } from "@/lib/userFacingError";

interface ChatContextProps {
  chats: Chat[];
  currentChatId: string | null;
  isLoading: boolean;
  isLoadingConfig: boolean;
  apiConfig: ApiKeyConfig;
  pendingComposer: { text: string; attachments: MessageAttachment[] } | null;
  clearPendingComposer: () => void;
  createNewChat: () => string;
  selectChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  clearChats: () => void;
  sendMessage: (
    content: string,
    attachments?: MessageAttachment[],
    options?: { workspaceAssistBlock?: string }
  ) => Promise<void>;
  regenerateLastResponse: () => Promise<void>;
  beginEditUserMessage: (messageId: string) => void;
  setApiConfig: (config: ApiKeyConfig) => void;
  stopStreaming: () => void;
  /** Load text into the main chat composer (Thread). Navigating to `/chat` is recommended. */
  queuePromptInComposer: (text: string) => void;
  /** Prompt tokens reported by the streaming API for the in-flight request (if any). */
  streamingPromptTokens: number | null;
  /** Rate-limit headers from the last completed chat response (current provider). */
  providerQuotaSnapshot: ProviderQuotaSnapshot | null;
  /**
   * AppLayout sets this from the current route’s workspace meta so send/regenerate share the same
   * “current workspace” system block without threading pathname through every caller.
   */
  setWorkspaceRouteAssist: (block: string | undefined) => void;
  /** Notebook: register a function that returns full workspace assist with current Source (for send/regenerate). */
  registerNotebookAssistSync: (fn: (() => string) | null) => void;
  /** From chat code blocks: queue text for Notebook Source (see NotebookPdfWorkspace). */
  notebookLatexInsertRequest: NotebookLatexInsertRequest | null;
  requestNotebookLatexInsert: (latex: string, options?: { autoCompile?: boolean }) => void;
  clearNotebookLatexInsertRequest: () => void;
  /**
   * While the WebGPU Gemma weights are downloading (0–100). `null` when idle or generating tokens only.
   * ONNX Runtime assets load from the CDN version bundled with `@huggingface/transformers` (needs network once).
   */
  webgpuModelDownloadProgress: number | null;
}

export interface NotebookLatexInsertRequest {
  id: number;
  latex: string;
  /** When true, Notebook runs Compile after insert (LaTeX → PDF when valid). */
  autoCompile?: boolean;
}

const ChatContext = createContext<ChatContextProps | undefined>(undefined);

function mergePdfIntoContent(text: string, attachments: MessageAttachment[]): string {
  let t = text.trim();
  for (const a of attachments) {
    if (a.kind === "pdf") {
      t += `\n\n--- PDF: ${a.name} ---\n${a.extractedText}`;
    }
  }
  return t.trim();
}

interface PipelineExtras {
  systemPrompts: string[];
  researchSources?: ResearchSourceRef[];
  agentTrace?: AgentTraceStep[];
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [apiConfig, setApiConfigState] = useState<ApiKeyConfig>(defaultApiConfig);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [pendingComposer, setPendingComposer] = useState<{
    text: string;
    attachments: MessageAttachment[];
  } | null>(null);
  const [streamingPromptTokens, setStreamingPromptTokens] = useState<number | null>(null);
  const [providerQuotaSnapshot, setProviderQuotaSnapshot] = useState<ProviderQuotaSnapshot | null>(null);
  const [notebookLatexInsertRequest, setNotebookLatexInsertRequest] = useState<NotebookLatexInsertRequest | null>(null);
  const [webgpuModelDownloadProgress, setWebgpuModelDownloadProgress] = useState<number | null>(null);
  const { toast } = useToast();

  const abortControllersRef = useRef<AbortController[]>([]);
  /** Latest workspace assist from route (Notebook, Labs, …); merged into send + regenerate pipelines. */
  const workspaceRouteAssistRef = useRef<string | undefined>(undefined);
  /** Notebook registers a sync builder so sends use latest Source (debounced assist may lag typing). */
  const notebookAssistSyncRef = useRef<(() => string) | null>(null);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  const setWorkspaceRouteAssist = useCallback((block: string | undefined) => {
    workspaceRouteAssistRef.current = block;
  }, []);

  const registerNotebookAssistSync = useCallback((fn: (() => string) | null) => {
    notebookAssistSyncRef.current = fn;
  }, []);

  useEffect(() => {
    setProviderQuotaSnapshot(null);
  }, [apiConfig.aiProvider]);

  useEffect(() => {
    const savedChats = localStorage.getItem(LOCAL_STORAGE_KEYS.CHATS);
    const savedCurrentChatId = localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT_CHAT_ID);
    const savedApiConfig = localStorage.getItem(LOCAL_STORAGE_KEYS.API_CONFIG);

    if (savedChats) {
      try {
        const parsedChats = JSON.parse(savedChats);
        const processedChats = parsedChats.map((chat: Chat & { messages: Message[] }) => ({
          ...chat,
          createdAt: new Date(chat.createdAt),
          updatedAt: new Date(chat.updatedAt),
          messages: chat.messages.map((msg: Message) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })),
        }));
        setChats(processedChats);

        /** Saved current id must point at a real chat or messages never attach (orphaned id). */
        if (savedCurrentChatId && processedChats.some((c: Chat) => c.id === savedCurrentChatId)) {
          setCurrentChatId(savedCurrentChatId);
        } else if (savedCurrentChatId && processedChats.length > 0) {
          setCurrentChatId(processedChats[0].id);
        } else if (!savedCurrentChatId && processedChats.length > 0) {
          setCurrentChatId(processedChats[0].id);
        } else {
          setCurrentChatId(null);
        }
      } catch (error) {
        console.error("Failed to parse saved chats:", error);
        toast({
          title: "Error",
          description: "Failed to load saved chats",
          variant: "destructive",
        });
      }
    } else if (savedCurrentChatId) {
      setCurrentChatId(null);
    }

    if (savedApiConfig) {
      try {
        const config = JSON.parse(savedApiConfig) as Partial<ApiKeyConfig>;
        setApiConfigState(normalizeApiConfig(config));
      } catch (error) {
        console.error("Failed to parse saved API config:", error);
        setApiConfigState(defaultApiConfig());
      }
    } else {
      setApiConfigState(defaultApiConfig());
    }

    setIsLoadingConfig(false);
  }, [toast]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.CHATS, JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    if (currentChatId) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT_CHAT_ID, currentChatId);
    }
  }, [currentChatId]);

  useEffect(() => {
    if (!isLoadingConfig) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.API_CONFIG, JSON.stringify(apiConfig));
    }
  }, [apiConfig, isLoadingConfig]);

  const clearPendingComposer = useCallback(() => setPendingComposer(null), []);

  const queuePromptInComposer = useCallback(
    (text: string) => {
      setPendingComposer({ text, attachments: [] });
      toast({
        title: "Composer updated",
        description: "Open Home chat to review and send, or continue editing there.",
      });
    },
    [toast]
  );

  const requestNotebookLatexInsert = useCallback((latex: string, options?: { autoCompile?: boolean }) => {
    setNotebookLatexInsertRequest({
      id: Date.now(),
      latex,
      autoCompile: options?.autoCompile ?? true,
    });
  }, []);

  const clearNotebookLatexInsertRequest = useCallback(() => {
    setNotebookLatexInsertRequest(null);
  }, []);

  const setApiConfig = (config: ApiKeyConfig) => {
    setApiConfigState(normalizeApiConfig(config));
    toast({
      title: "Configuration updated",
      description: "Your API settings have been saved locally.",
    });
  };

  const createNewChat = () => {
    const now = new Date();
    const newChat: Chat = {
      id: uuidv4(),
      title: "New Chat",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    setChats((prevChats) => [...prevChats, newChat]);
    setCurrentChatId(newChat.id);

    return newChat.id;
  };

  const selectChat = (chatId: string) => {
    setCurrentChatId(chatId);
  };

  const deleteChat = (chatId: string) => {
    setChats((prevChats) => prevChats.filter((chat) => chat.id !== chatId));

    if (currentChatId === chatId) {
      const remainingChats = chatsRef.current.filter((chat) => chat.id !== chatId);
      setCurrentChatId(remainingChats.length > 0 ? remainingChats[0].id : null);
    }

    toast({
      title: "Chat Deleted",
      description: "The chat has been deleted",
    });
  };

  const clearChats = () => {
    setChats([]);
    setCurrentChatId(null);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.CHATS);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.CURRENT_CHAT_ID);
  };

  const updateChatTitleFromMessages = (chatId: string, messages: Message[]) => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const base = lastUser.content.trim() || (lastUser.attachments?.length ? "(attachment)" : "");
    const title = base.slice(0, 50) + (base.length > 50 ? "..." : "");
    setChats((prevChats) =>
      prevChats.map((chat) => (chat.id === chatId ? { ...chat, title } : chat))
    );
  };

  const stopStreaming = () => {
    abortLocalGemmaGeneration();
    abortControllersRef.current.forEach((c) => c.abort());
    abortControllersRef.current = [];
    setWebgpuModelDownloadProgress(null);
    setIsLoading(false);
  };

  const buildPipelineExtras = async (
    msgs: Message[],
    cfg: ApiKeyConfig,
    pipelineOpts?: { workspaceAssistBlock?: string }
  ): Promise<PipelineExtras> => {
    const ws = pipelineOpts?.workspaceAssistBlock;
    const researchOn = cfg.aiProvider !== "webgpu_gemma" && cfg.researchEnabled;
    if (!researchOn) {
      return {
        systemPrompts: buildSystemPrompts(cfg, { includeChartHint: false, workspaceAssistBlock: ws }),
      };
    }
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    const q = lastUser?.content ?? "";
    try {
      const g = await gatherResearchContext(q, cfg);
      if (g.warnings.length) {
        const desc = g.warnings.slice(0, 4).join(" ");
        toast({
          title: g.contextBlock.trim() ? "Research: some sources skipped" : "Research: limited context",
          description: desc.length > 280 ? `${desc.slice(0, 277)}…` : desc,
          variant: g.contextBlock.trim() ? "default" : "destructive",
        });
      }
      return {
        systemPrompts: buildSystemPrompts(cfg, {
          researchContextBlock: g.contextBlock,
          includeChartHint: true,
          workspaceAssistBlock: ws,
        }),
        researchSources: g.sources.length ? g.sources : undefined,
        agentTrace: g.agentTrace.length ? g.agentTrace : undefined,
      };
    } catch (e) {
      console.error(e);
      toast({
        title: "Research pipeline error",
        description: formatUserFacingError(e, "Could not load web context"),
        variant: "destructive",
      });
      return {
        systemPrompts: buildSystemPrompts(cfg, { includeChartHint: false, workspaceAssistBlock: ws }),
      };
    }
  };

  const beginEditUserMessage = (messageId: string) => {
    if (!currentChatId) return;
    const chat = chatsRef.current.find((c) => c.id === currentChatId);
    if (!chat) return;
    const idx = chat.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const msg = chat.messages[idx];
    if (msg.role !== "user") return;

    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== currentChatId) return c;
        return {
          ...c,
          messages: c.messages.slice(0, idx),
          updatedAt: new Date(),
        };
      })
    );

    setPendingComposer({
      text: msg.content,
      attachments: msg.attachments ? [...msg.attachments] : [],
    });
  };

  const regenerateLastResponse = async () => {
    if (!canSendChat(apiConfig) || isLoading || !currentChatId) return;
    const chat = chatsRef.current.find((c) => c.id === currentChatId);
    if (!chat?.messages.length) return;
    const msgs = [...chat.messages];
    const last = msgs[msgs.length - 1];
    if (last.role !== "assistant") {
      toast({
        title: "Nothing to retry",
        description: "The last message is not an assistant reply.",
        variant: "destructive",
      });
      return;
    }
    msgs.pop();
    const u = msgs[msgs.length - 1];
    if (!u || u.role !== "user") {
      toast({
        title: "Cannot retry",
        description: "No user message found before the assistant reply.",
        variant: "destructive",
      });
      return;
    }

    setChats((prev) =>
      prev.map((c) =>
        c.id === currentChatId ? { ...c, messages: msgs, updatedAt: new Date() } : c
      )
    );

    const workspaceBlock = notebookAssistSyncRef.current?.() ?? workspaceRouteAssistRef.current;
    const extras = await buildPipelineExtras(msgs, apiConfig, {
      workspaceAssistBlock: workspaceBlock,
    });
    await runAssistantPipeline(currentChatId, msgs, apiConfig, extras);
  };

  const runAssistantPipeline = async (
    activeChatId: string,
    chatMessages: Message[],
    cfg: ApiKeyConfig,
    extras: PipelineExtras
  ) => {
    const comparisonIds = dedupeModels(cfg.comparisonModelIds).slice(0, 4);
    const useTiling =
      cfg.aiProvider !== "webgpu_gemma" &&
      cfg.comparisonEnabled &&
      comparisonIds.length >= 2 &&
      comparisonIds.every((id) => id.length > 0);
    const targetModels = useTiling ? comparisonIds : [cfg.model];

    const apiMessages = buildChatCompletionMessages(extras.systemPrompts, chatMessages);

    setIsLoading(true);
    setStreamingPromptTokens(null);
    abortControllersRef.current = [];

    if (!useTiling) {
      const controller = new AbortController();
      abortControllersRef.current = [controller];

      const assistantMessageId = uuidv4();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setChats((prevChats) =>
        prevChats.map((chat) => {
          if (chat.id === activeChatId) {
            return {
              ...chat,
              messages: [...chat.messages, assistantMessage],
              updatedAt: new Date(),
            };
          }
          return chat;
        })
      );

      const batcher = createRafBatcher((chunk) => {
        setChats((prevChats) =>
          prevChats.map((chat) => {
            if (chat.id !== activeChatId) return chat;
            return {
              ...chat,
              messages: chat.messages.map((msg) =>
                msg.id === assistantMessageId ? { ...msg, content: msg.content + chunk } : msg
              ),
              updatedAt: new Date(),
            };
          })
        );
      });

      try {
        const { text, metrics, rateLimitHeaders } =
          cfg.aiProvider === "webgpu_gemma"
            ? await import("@/lib/gemmaWebGpu/streamLocalGemma").then(({ streamLocalGemmaChat }) =>
                streamLocalGemmaChat(cfg, apiMessages, controller.signal, {
                  onDelta: (delta) => batcher.push(delta),
                  onUsage: (u) => {
                    if (u.prompt_tokens != null) setStreamingPromptTokens(u.prompt_tokens);
                  },
                  onModelDownloadProgress: (pct) => {
                    setWebgpuModelDownloadProgress(pct);
                  },
                })
              )
            : await streamChatForConfig(cfg, cfg.model, apiMessages, controller.signal, {
                onDelta: (delta) => batcher.push(delta),
                onUsage: (u) => {
                  if (u.prompt_tokens != null) setStreamingPromptTokens(u.prompt_tokens);
                },
              });
        batcher.flushPending();
        setProviderQuotaSnapshot({
          provider: cfg.aiProvider,
          rateLimitHeaders,
          updatedAt: Date.now(),
          limitMessage: undefined,
          httpStatus: undefined,
        });

        const finalMetrics: ResponseMetrics = {
          ttftMs: metrics.ttftMs,
          totalMs: metrics.totalMs,
          promptTokens: metrics.promptTokens,
          completionTokens: metrics.completionTokens,
          totalTokens: metrics.totalTokens,
        };

        setChats((prevChats) =>
          prevChats.map((chat) => {
            if (chat.id !== activeChatId) return chat;
            return {
              ...chat,
              messages: chat.messages.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      content: text,
                      metrics: finalMetrics,
                      researchSources: extras.researchSources,
                      agentTrace: extras.agentTrace,
                    }
                  : msg
              ),
              updatedAt: new Date(),
            };
          })
        );

        updateChatTitleFromMessages(activeChatId, [
          ...chatMessages,
          { ...assistantMessage, content: text, metrics: finalMetrics },
        ]);
      } catch (error) {
        const aborted =
          (error instanceof Error || (typeof DOMException !== "undefined" && error instanceof DOMException)) &&
          (error as { name?: string }).name === "AbortError";
        if (aborted) {
          batcher.flushPending();
          setChats((prevChats) =>
            prevChats.map((chat) => {
              if (chat.id !== activeChatId) return chat;
              return {
                ...chat,
                messages: chat.messages.filter((msg) => msg.id !== assistantMessageId),
                updatedAt: new Date(),
              };
            })
          );
          return;
        }
        console.error("Error sending message:", error);
        if (isStreamHttpError(error)) {
          setProviderQuotaSnapshot({
            provider: cfg.aiProvider,
            rateLimitHeaders: error.rateLimitHeaders,
            updatedAt: Date.now(),
            limitMessage: error.message,
            httpStatus: error.status,
          });
        }
        toast({
          title: "Error",
          description: formatUserFacingError(error, "Failed to send message"),
          variant: "destructive",
        });
        batcher.flushPending();
        setChats((prevChats) =>
          prevChats.map((chat) => {
            if (chat.id !== activeChatId) return chat;
            return {
              ...chat,
              messages: chat.messages.filter((msg) => msg.id !== assistantMessageId),
              updatedAt: new Date(),
            };
          })
        );
      } finally {
        setStreamingPromptTokens(null);
        setWebgpuModelDownloadProgress(null);
        setIsLoading(false);
        abortControllersRef.current = [];
      }
      return;
    }

    const comparisonResponses: ComparisonResponse[] = targetModels.map((model) => ({
      id: uuidv4(),
      model,
      content: "",
      streaming: true,
    }));

    const assistantMessageId = uuidv4();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      comparisonResponses: comparisonResponses.map((c) => ({ ...c })),
      researchSources: extras.researchSources,
      agentTrace: extras.agentTrace,
    };

    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            messages: [...chat.messages, assistantMessage],
            updatedAt: new Date(),
          };
        }
        return chat;
      })
    );

    const controllers = targetModels.map(() => {
      const c = new AbortController();
      abortControllersRef.current.push(c);
      return c;
    });

    const batchers = new Map<string, ReturnType<typeof createRafBatcher>>();

    const updateComparisonPart = (
      modelId: string,
      updater: (prev: ComparisonResponse) => ComparisonResponse
    ) => {
      setChats((prevChats) =>
        prevChats.map((chat) => {
          if (chat.id !== activeChatId) return chat;
          return {
            ...chat,
            messages: chat.messages.map((msg) => {
              if (msg.id !== assistantMessageId || !msg.comparisonResponses) return msg;
              return {
                ...msg,
                comparisonResponses: msg.comparisonResponses.map((part) =>
                  part.model === modelId ? updater(part) : part
                ),
              };
            }),
            updatedAt: new Date(),
          };
        })
      );
    };

    try {
      const rateLimitSlices: Record<string, string>[] = [];
      const streamHttpErrors: StreamHttpError[] = [];

      await Promise.all(
        targetModels.map(async (model, idx) => {
          const signal = controllers[idx]!.signal;
          let batcher = batchers.get(model);
          if (!batcher) {
            batcher = createRafBatcher((chunk) => {
              updateComparisonPart(model, (part) => ({
                ...part,
                content: part.content + chunk,
                streaming: true,
              }));
            });
            batchers.set(model, batcher);
          }
          const b = batcher;
          try {
            const { text, metrics, rateLimitHeaders } = await streamChatForConfig(cfg, model, apiMessages, signal, {
              onDelta: (delta) => b.push(delta),
              onUsage: (u) => {
                if (u.prompt_tokens != null) setStreamingPromptTokens(u.prompt_tokens);
              },
            });
            b.flushPending();
            if (Object.keys(rateLimitHeaders).length > 0) {
              rateLimitSlices.push(rateLimitHeaders);
            }
            const finalMetrics: ResponseMetrics = {
              ttftMs: metrics.ttftMs,
              totalMs: metrics.totalMs,
              promptTokens: metrics.promptTokens,
              completionTokens: metrics.completionTokens,
              totalTokens: metrics.totalTokens,
            };
            updateComparisonPart(model, () => ({
              id: comparisonResponses.find((c) => c.model === model)!.id,
              model,
              content: text,
              metrics: finalMetrics,
              streaming: false,
            }));
          } catch (e) {
            b.flushPending();
            const abortedTile =
              (e instanceof Error || (typeof DOMException !== "undefined" && e instanceof DOMException)) &&
              (e as { name?: string }).name === "AbortError";
            if (abortedTile) {
              updateComparisonPart(model, (part) => ({ ...part, streaming: false }));
              return;
            }
            if (isStreamHttpError(e)) {
              streamHttpErrors.push(e);
            }
            const msg = formatUserFacingError(e, "Request failed");
            updateComparisonPart(model, (part) => ({
              ...part,
              error: msg,
              streaming: false,
            }));
          }
        })
      );

      const mergedRateHeaders = rateLimitSlices.reduce<Record<string, string>>((acc, h) => ({ ...acc, ...h }), {});
      if (streamHttpErrors.length > 0) {
        const e = streamHttpErrors[0]!;
        setProviderQuotaSnapshot({
          provider: cfg.aiProvider,
          rateLimitHeaders: { ...mergedRateHeaders, ...e.rateLimitHeaders },
          updatedAt: Date.now(),
          limitMessage: e.message,
          httpStatus: e.status,
        });
      } else {
        setProviderQuotaSnapshot({
          provider: cfg.aiProvider,
          rateLimitHeaders: mergedRateHeaders,
          updatedAt: Date.now(),
          limitMessage: undefined,
          httpStatus: undefined,
        });
      }

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== activeChatId) return chat;
          return {
            ...chat,
            messages: chat.messages.map((m) =>
              m.id === assistantMessageId && m.comparisonResponses
                ? {
                    ...m,
                    comparisonResponses: m.comparisonResponses.map((p) => ({ ...p, streaming: false })),
                  }
                : m
            ),
            updatedAt: new Date(),
          };
        })
      );
      updateChatTitleFromMessages(activeChatId, chatMessages);
    } finally {
      setStreamingPromptTokens(null);
      setWebgpuModelDownloadProgress(null);
      setIsLoading(false);
      abortControllersRef.current = [];
    }
  };

  const sendMessage = async (
    content: string,
    attachments: MessageAttachment[] = [],
    options?: { workspaceAssistBlock?: string }
  ) => {
    const trimmed = content.trim();
    if (!trimmed && attachments.length === 0) return;
    if (!canSendChat(apiConfig)) {
      toast({
        title: "Cannot send yet",
        description:
          apiConfig.aiProvider === "webgpu_gemma"
            ? "WebGPU is not available in this browser. Use Chrome/Edge or the desktop build, or switch to OpenRouter in Settings."
            : "Add an OpenRouter API key or set an OpenAI-compatible base URL (e.g. Ollama) in Settings.",
        variant: "destructive",
      });
      return;
    }

    /** Stale or deleted id → no chat row matches; messages would be dropped. */
    let activeChatId = currentChatId;
    if (activeChatId && !chatsRef.current.some((c) => c.id === activeChatId)) {
      activeChatId = null;
    }
    if (!activeChatId) {
      activeChatId = createNewChat();
    }

    const mergedPdf = mergePdfIntoContent(trimmed, attachments);
    const body = substituteInlineCalc(mergedPdf) || (attachments.length ? " " : "");

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: body,
      timestamp: new Date(),
      attachments: attachments.length ? attachments : undefined,
    };

    const prior = chatsRef.current.find((c) => c.id === activeChatId);
    const chatMessages = prior ? [...prior.messages, userMessage] : [userMessage];

    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            messages: [...chat.messages, userMessage],
            updatedAt: new Date(),
          };
        }
        return chat;
      })
    );

    const workspaceBlock =
      options?.workspaceAssistBlock ??
      notebookAssistSyncRef.current?.() ??
      workspaceRouteAssistRef.current;

    const extras = await buildPipelineExtras(chatMessages, apiConfig, {
      workspaceAssistBlock: workspaceBlock,
    });
    await runAssistantPipeline(activeChatId, chatMessages, apiConfig, extras);
  };

  const value: ChatContextProps = {
    chats,
    currentChatId,
    isLoading,
    isLoadingConfig,
    apiConfig,
    pendingComposer,
    clearPendingComposer,
    createNewChat,
    selectChat,
    deleteChat,
    clearChats,
    sendMessage,
    regenerateLastResponse,
    beginEditUserMessage,
    setApiConfig,
    stopStreaming,
    queuePromptInComposer,
    streamingPromptTokens,
    providerQuotaSnapshot,
    setWorkspaceRouteAssist,
    registerNotebookAssistSync,
    notebookLatexInsertRequest,
    requestNotebookLatexInsert,
    clearNotebookLatexInsertRequest,
    webgpuModelDownloadProgress,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};
