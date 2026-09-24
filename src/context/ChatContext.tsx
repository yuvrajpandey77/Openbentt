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
  canSendMessage,
} from "@/types/chat";
import { ensureCloudInferenceForConfig, loadPrivacyPreferences } from "@/lib/privacy/privacyPreferences";
import { useToast } from "@/components/ui/use-toast";
import { buildChatCompletionMessages, isStreamHttpError, StreamHttpError } from "@/lib/openrouter";
import { streamChatForConfig } from "@/lib/aiStream";
import { streamRoutedTask } from "@/lib/modelRouting";
import { detectNotebookRoutedTask } from "@/lib/modelRouting/detectNotebookRoutedTask";
import { abortLocalGemmaGeneration } from "@/lib/gemmaWebGpu/streamLocalGemma";
import { createRafBatcher } from "@/lib/streamBatch";
import { gatherResearchContext } from "@/lib/researchSources";
import { buildSystemPrompts } from "@/lib/systemPrompts";
import { substituteInlineCalc } from "@/lib/mathInline";
import type { ProviderQuotaSnapshot } from "@/lib/providerRateLimits";
import { LOCAL_STORAGE_KEYS } from "@/lib/storageMigrate";
import { formatUserFacingError } from "@/lib/userFacingError";
import { getLocalWeightsConsent } from "@/lib/gemmaWebGpu/localModelConsent";
import { getLocalGgufApi } from "@/lib/localGguf/desktopApi";
import { coerceApiConfigForPlatform } from "@/config/platformSurface";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { assertChatProviderAllowed, isResearchNetworkAllowed } from "@/lib/offline/mode";
import { isNavigatorOnline } from "@/lib/offline/connectivity";
import { getAgentDefinition } from "@/lib/agent/agentDefinitions";
import { createRoutedModelFn, collectingModelFn } from "@/lib/agent/agentModel";
import { defaultAgentToolExecutor, createAgentAuditSink } from "@/lib/agent/agentTools";
import {
  getStoredRun,
  resumeAgentRun,
  runAgent,
} from "@/lib/agent/agentRuntime";
import {
  agentStepsToTrace,
  confirmationPromptFor,
  runOutputToSources,
  streamTextChunked,
} from "@/lib/agent/agentChat";
import type { AgentRun } from "@/lib/agent/agentTypes";
import {
  apiConfigForBrowserStorage,
  apiConfigForMemoryOnlyStorage,
  loadDesktopSecretsIntoConfig,
  migrateLegacySecretsFromConfig,
  persistDesktopSecretsFromConfig,
} from "@/lib/privacy/desktopSecrets";
import { decideRoute } from "@/lib/agent/openCodeHarness";
import { hasOpenCodeDesktopApi, openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";
import type { OpenCodeAgentEvent, OpenCodeTask } from "@/lib/agent/openCodeTypes";
import { getExecutionRuntime } from "@/lib/agent/executionRuntime";
import {
  askOpenCodeLayer,
  defaultOpenCodeModel,
  fetchOpenCodeLayer,
  loadStoredOpenCodeModel,
  storeOpenCodeModel,
  streamOpenCodeLayerChat,
  type OpenCodeLayerSnapshot,
} from "@/lib/agent/openCodeChat";

export const AGENT_WORKSPACE_KEY = "openbentt-agent-workspace-root";
export const projectWorkspaceKey = (projectId: string) =>
  `openbentt-project-workspace:${projectId}`;

export function resolveExecutionWorkspace(projectId?: string | null): string {
  try {
    if (projectId) {
      const linked = localStorage.getItem(projectWorkspaceKey(projectId));
      if (linked?.trim()) return linked.trim();
    }
    return localStorage.getItem(AGENT_WORKSPACE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

interface ChatContextProps {
  chats: Chat[];
  currentChatId: string | null;
  isLoading: boolean;
  isLoadingConfig: boolean;
  apiConfig: ApiKeyConfig;
  pendingComposer: { text: string; attachments: MessageAttachment[] } | null;
  clearPendingComposer: () => void;
  createNewChat: (title?: string, projectId?: string | null) => string;
  /** Active project workspace context (null = global chat). Same chat system either way. */
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  setProjectWorkspace: (projectId: string, root: string) => void;
  /** Unified execution (OpenCode underneath): tasks + normalized events per conversation. */
  executionTasks: Record<string, OpenCodeTask>;
  executionEvents: Record<string, OpenCodeAgentEvent[]>;
  workspaceNeeded: boolean;
  setWorkspaceNeeded: (v: boolean) => void;
  executionDrawerTaskId: string | null;
  setExecutionDrawerTaskId: (id: string | null) => void;
  cancelExecutionTask: (taskId: string) => Promise<void>;
  respondToExecutionPermission: (
    taskId: string,
    approvalId: string,
    decision: "allow-once" | "allow-task" | "deny"
  ) => Promise<void>;
  /** Voice transcripts enter the SAME pipeline as typed text (metadata only). */
  submitVoiceTranscript: (transcript: string) => Promise<void>;
  /**
   * Universal OpenCode layer (desktop): every request — build, plan, ask —
   * goes through OpenCode. No keys, no provider maze in chat.
   */
  openCodeLayer: OpenCodeLayerSnapshot;
  refreshOpenCodeLayer: () => Promise<void>;
  /** Model selection for EVERY chat panel: OpenCode models, free first. */
  openCodeModel: string;
  setOpenCodeModel: (id: string) => void;
  /** True when chat can send right now (layer available OR legacy provider ready). */
  unifiedChatReady: boolean;
  /**
   * Ask-path escalation: OpenCode asked for permission (auto-denied) — run
   * the same prompt as an approval-gated task, or dismiss the prompt.
   */
  escalateAskToTask: (messageId: string) => Promise<void>;
  dismissAskPermissions: (messageId: string) => void;
  selectChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  clearChats: () => void;
  sendMessage: (
    content: string,
    attachments?: MessageAttachment[],
    options?: { workspaceAssistBlock?: string; projectId?: string | null; inputSource?: "text" | "voice" }
  ) => Promise<void>;
  regenerateLastResponse: () => Promise<void>;
  beginEditUserMessage: (messageId: string) => void;
  /** Project workspace context injected by WorkspaceProvider (bounded block). */
  registerProjectContextProvider: (fn: (() => string | null) | null) => void;
  /** Phase 6: controlled agent mode (tool-using assistant via Phase 5 boundary). */
  agentMode: boolean;
  setAgentMode: (v: boolean) => void;
  /** Phase 7: source scope (trusted app state; empty = all sources). */
  sourceScope: string[];
  setSourceScope: (v: string[]) => void;
  /** Suspended agent run awaiting user confirmation (null when none). */
  pendingAgentConfirm: { runId: string; toolId: string; summary: string } | null;
  sendAgentMessage: (content: string, opts?: { projectId?: string }) => Promise<void>;
  confirmAgentRun: (runId: string) => Promise<void>;
  /** Research: register a provider returning the active project id for agent scoping. */
  registerAgentProjectProvider: (fn: (() => string | null) | null) => void;
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
  /** Research: register an async function that returns corpus RAG evidence for a query. */
  registerCorpusRagProvider: (fn: ((query: string) => Promise<string>) | null) => void;
  /** Research: register a callback that persists chat messages to the project DB. */
  registerChatLogPersister: (
    fn: ((threadId: string, role: string, content: string, model: string) => void) | null
  ) => void;
  /** Estimated tokens from notebook workspace assist (connected files + source snapshot). */
  workspaceAssistTokenEstimate: number;
  setWorkspaceAssistTokenEstimate: (n: number) => void;
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
  const [workspaceAssistTokenEstimate, setWorkspaceAssistTokenEstimate] = useState(0);
  const { toast } = useToast();
  // "Cannot send yet" fires on EVERY send attempt without a key — throttle
  // it so a missing key never spams the screen.
  const lastKeyToastRef = useRef(0);
  const toastKeyMissing = useCallback(
    (description: string) => {
      const now = Date.now();
      if (now - lastKeyToastRef.current < 60_000) return;
      lastKeyToastRef.current = now;
      toast({ title: "Cannot send yet", description, variant: "destructive" });
    },
    [toast]
  );

  const abortControllersRef = useRef<AbortController[]>([]);
  /** Latest workspace assist from route (Notebook, Labs, …); merged into send + regenerate pipelines. */
  const workspaceRouteAssistRef = useRef<string | undefined>(undefined);
  /** Notebook registers a sync builder so sends use latest Source (debounced assist may lag typing). */
  const notebookAssistSyncRef = useRef<(() => string) | null>(null);
  /**
   * Research project context injected by ResearchProjectContext for corpus RAG.
   * Provides getCorpusEvidence(query) → formatted evidence string.
   */
  const corpusRagProviderRef = useRef<((query: string) => Promise<string>) | null>(null);
  /**
   * Callback registered by ResearchProjectContext to persist chat messages to the
   * project's SQLite database. Arguments: (threadId, role, content, model).
   */
  const chatLogPersisterRef = useRef<
    ((threadId: string, role: string, content: string, model: string) => void) | null
  >(null);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  const setWorkspaceRouteAssist = useCallback((block: string | undefined) => {
    workspaceRouteAssistRef.current = block;
  }, []);

  const registerNotebookAssistSync = useCallback((fn: (() => string) | null) => {
    notebookAssistSyncRef.current = fn;
  }, []);

  const registerCorpusRagProvider = useCallback(
    (fn: ((query: string) => Promise<string>) | null) => {
      corpusRagProviderRef.current = fn;
    },
    []
  );

  const registerChatLogPersister = useCallback(
    (fn: ((threadId: string, role: string, content: string, model: string) => void) | null) => {
      chatLogPersisterRef.current = fn;
    },
    []
  );


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

    let cancelled = false;

    void (async () => {
      if (savedApiConfig) {
        try {
          const parsed = JSON.parse(savedApiConfig) as Partial<ApiKeyConfig>;
          let normalized = coerceApiConfigForPlatform(normalizeApiConfig(parsed));
          const { config: afterVault, migrated: vaultMigrated } =
            await migrateLegacySecretsFromConfig(parsed);
          if (vaultMigrated) {
            normalized = coerceApiConfigForPlatform(normalizeApiConfig(afterVault));
            try {
              localStorage.setItem(
                LOCAL_STORAGE_KEYS.API_CONFIG,
                JSON.stringify(apiConfigForBrowserStorage(normalized))
              );
            } catch {
              /* quota */
            }
          }
          const api = getLocalGgufApi();
          const plain = normalized.huggingFaceToken.trim();
          if (isDesktopApp() && plain && api?.hfSecretSet) {
            await api.hfSecretSet(plain);
            normalized = normalizeApiConfig({ ...afterVault, huggingFaceToken: "" });
            try {
              localStorage.setItem(
                LOCAL_STORAGE_KEYS.API_CONFIG,
                JSON.stringify(apiConfigForBrowserStorage(normalized))
              );
            } catch {
              /* quota */
            }
          }
          normalized = await loadDesktopSecretsIntoConfig(normalized);
          ensureCloudInferenceForConfig(normalized);
          if (!cancelled) setApiConfigState(normalized);
        } catch (error) {
          console.error("Failed to parse saved API config:", error);
          if (!cancelled) setApiConfigState(defaultApiConfig());
        }
      } else if (!cancelled) {
        setApiConfigState(defaultApiConfig());
      }
      if (!cancelled) setIsLoadingConfig(false);
    })();

    return () => {
      cancelled = true;
    };
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
      void persistDesktopSecretsFromConfig(apiConfig);
      // Phase 1: memory-only keys (web opt-in) blank secrets before localStorage
      // persistence. In-memory state keeps working until reload.
      const toStore = loadPrivacyPreferences().memoryOnlyApiKeys
        ? apiConfigForMemoryOnlyStorage(apiConfig)
        : apiConfigForBrowserStorage(apiConfig);
      localStorage.setItem(LOCAL_STORAGE_KEYS.API_CONFIG, JSON.stringify(toStore));
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
    const normalized = coerceApiConfigForPlatform(normalizeApiConfig(config));
    ensureCloudInferenceForConfig(normalized);
    setApiConfigState(normalized);
    toast({
      title: "Configuration updated",
      description: "Your API settings have been saved locally.",
    });
  };

  const createNewChat = (title = "New Chat", projectId?: string | null) => {
    const now = new Date();
    const newChat: Chat = {
      id: uuidv4(),
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
      projectId: projectId ?? activeProjectIdRef.current ?? null,
      taskIds: [],
    };

    setChats((prevChats) => [...prevChats, newChat]);
    setCurrentChatId(newChat.id);

    return newChat.id;
  };

  /* ---------- Unified conversation architecture (Final Architecture Pass) ---------- */
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const activeProjectIdRef = useRef<string | null>(null);
  const [workspaceNeeded, setWorkspaceNeeded] = useState(false);
  const [executionTasks, setExecutionTasks] = useState<Record<string, OpenCodeTask>>({});
  const [executionEvents, setExecutionEvents] = useState<Record<string, OpenCodeAgentEvent[]>>({});
  const [executionDrawerTaskId, setExecutionDrawerTaskId] = useState<string | null>(null);
  const executionTasksRef = useRef<Record<string, OpenCodeTask>>({});
  executionTasksRef.current = executionTasks;

  const setActiveProjectId = useCallback((id: string | null) => {
    activeProjectIdRef.current = id;
    setActiveProjectIdState(id);
  }, []);

  const setProjectWorkspace = useCallback((projectId: string, root: string) => {
    try {
      if (root.trim()) localStorage.setItem(projectWorkspaceKey(projectId), root.trim());
      else localStorage.removeItem(projectWorkspaceKey(projectId));
    } catch {
      /* non-critical */
    }
    setWorkspaceNeeded(false);
  }, []);

  const appendTaskToChat = useCallback((chatId: string, taskId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, taskIds: [...(c.taskIds ?? []), taskId], updatedAt: new Date() }
          : c
      )
    );
  }, []);

  const patchExecutionMessage = useCallback(
    (taskId: string, patch: (m: Message) => Message) => {
      setChats((prev) =>
        prev.map((c) => {
          if (!c.messages.some((m) => m.taskId === taskId)) return c;
          return {
            ...c,
            messages: c.messages.map((m) => (m.taskId === taskId ? patch(m) : m)),
            updatedAt: new Date(),
          };
        })
      );
    },
    []
  );

  const patchMessageById = useCallback(
    (chatId: string, messageId: string, patch: (m: Message) => Message) => {
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            messages: c.messages.map((m) => (m.id === messageId ? patch(m) : m)),
            updatedAt: new Date(),
          };
        })
      );
    },
    []
  );

  const humanizeAgentEvent = useCallback((e: OpenCodeAgentEvent): string => {
    const p = e.payload as Record<string, unknown>;
    const msg = typeof p.message === "string" ? p.message : "";
    const file = typeof p.file === "string" ? p.file : "";
    const target = typeof p.target === "string" ? p.target : "";
    switch (e.type) {
      case "agent.started":
        return "Working on it…";
      case "agent.thinking":
        return msg ? `Thinking · ${msg.slice(0, 140)}` : "Thinking…";
      case "agent.status":
        return msg ? `Status · ${msg.slice(0, 140)}` : "Status update";
      case "agent.tool.requested":
        return `Tool requested · ${String(p.tool ?? p.capability ?? "tool")}`;
      case "agent.tool.started":
        return `Running · ${String(p.tool ?? p.command ?? "tool")}${target ? ` · ${target}` : ""}`;
      case "agent.tool.output":
        return msg ? `Output · ${msg.slice(0, 140)}` : "Tool output";
      case "agent.file.changed":
        return `Changed file · ${file || target || "file"}`;
      case "agent.command.requested":
        return `Command requested · ${String(p.command ?? target ?? "")}`.slice(0, 160);
      case "agent.command.output":
        return msg ? `Command output · ${msg.slice(0, 140)}` : "Command output";
      case "agent.permission.requested":
        return `Permission required · ${String(p.capability ?? "")} ${target}`.slice(0, 160);
      case "agent.error":
        return `Error · ${(msg || "see details").slice(0, 140)}`;
      case "agent.completed":
        return msg ? `Done · ${msg.slice(0, 160)}` : "Completed";
      case "agent.failed":
        return `Failed · ${(msg || "see details").slice(0, 160)}`;
      case "agent.cancelled":
        return "Cancelled";
      default:
        return e.type;
    }
  }, []);

  const statusForEvent = useCallback((type: OpenCodeAgentEvent["type"]): Message["executionStatus"] => {
    switch (type) {
      case "agent.permission.requested":
        return "waiting_for_permission";
      case "agent.completed":
        return "completed";
      case "agent.failed":
        return "failed";
      case "agent.cancelled":
        return "cancelled";
      case "agent.started":
        return "starting";
      default:
        return "running";
    }
  }, []);

  /* Phase B/C/D: verification + before-state snapshots (disk is truth). */
  const snapshotTaskFile = useCallback(async (taskId: string, evt: OpenCodeAgentEvent) => {
    try {
      const api = (await import("@/lib/desktopApi")).getDesktopApi();
      const task = executionTasksRef.current[taskId];
      const file = typeof evt.payload.file === "string" ? evt.payload.file : null;
      if (!api?.workspaceSnapshot || !task?.workspace?.rootPath || !file) return;
      await api.workspaceSnapshot(task.workspace.rootPath, taskId, [file]).catch(() => {});
    } catch {
      /* best effort */
    }
  }, []);

  const verifyTaskCompletion = useCallback(
    async (taskId: string) => {
      try {
        const api = (await import("@/lib/desktopApi")).getDesktopApi();
        const task = executionTasksRef.current[taskId];
        if (!api?.workspaceVerify || !task?.workspace?.rootPath) return;
        const events = await openCodeAgentApi.getTask(taskId).then((r) => r.events).catch(() => []);
        const claimed = [...new Set(
          events
            .filter((e) => e.type === "agent.file.changed")
            .map((e) => String(e.payload.file ?? e.payload.target ?? ""))
            .filter(Boolean)
        )].slice(0, 50);
        if (claimed.length === 0) return;
        const verified = await api
          .workspaceVerify(task.workspace.rootPath, claimed.map((path) => ({ path })))
          .catch(() => []);
        const ok = verified.filter((v) => v.exists);
        const missing = verified.filter((v) => !v.exists).map((v) => v.path);
        patchExecutionMessage(taskId, (m) => ({
          ...m,
          agentTrace: [
            ...(m.agentTrace ?? []),
            {
              step: "agent.verified",
              detail:
                missing.length === 0
                  ? `Verified ${ok.length} file${ok.length === 1 ? "" : "s"} on disk: ${ok.map((v) => v.path).slice(0, 8).join(", ")}${ok.length > 8 ? "…" : ""}`
                  : `Verified ${ok.length}, unverified claims: ${missing.slice(0, 8).join(", ")}`,
            },
          ].slice(-120),
        }));
      } catch {
        /* verification failure never breaks the conversation */
      }
    },
    [patchExecutionMessage]
  );

  /** Single canonical event pipeline: agent events update task state + inline activity. */
  useEffect(() => {
    if (!hasOpenCodeDesktopApi()) return;
    let dispose = () => {};
    try {
      dispose = openCodeAgentApi.onEvent((evt) => {
        setExecutionEvents((prev) => {
          const list = prev[evt.taskId] ?? [];
          if (list.some((e) => e.eventId === evt.eventId)) return prev;
          return { ...prev, [evt.taskId]: [...list.slice(-499), evt] };
        });
        const status = statusForEvent(evt.type);
        setExecutionTasks((prev) => {
          const t = prev[evt.taskId];
          if (!t) return prev;
          const mapped =
            status === "waiting_for_permission"
              ? "WAITING_FOR_PERMISSION"
              : status === "completed"
                ? "COMPLETED"
                : status === "failed"
                  ? "FAILED"
                  : status === "cancelled"
                    ? "CANCELLED"
                    : status === "starting"
                      ? "STARTING"
                      : "RUNNING";
          return { ...prev, [evt.taskId]: { ...t, status: mapped, lastEvent: evt.type, updatedAt: evt.timestamp } };
        });
        const detail = humanizeAgentEvent(evt);
        patchExecutionMessage(evt.taskId, (m) => ({
          ...m,
          executionStatus: status,
          agentTrace: [...(m.agentTrace ?? []), { step: evt.type, detail }].slice(-120),
          content:
            evt.type === "agent.completed" && typeof evt.payload.message === "string" && evt.payload.message
              ? `${m.content ? `${m.content}\n\n` : ""}${String(evt.payload.message).slice(0, 2000)}`
              : m.content,
          streaming: evt.type === "agent.completed" || evt.type === "agent.failed" || evt.type === "agent.cancelled" ? false : m.streaming,
        }));
        if (evt.type === "agent.permission.requested") {
          setExecutionDrawerTaskId((cur) => cur ?? evt.taskId);
        }
        if (evt.type === "agent.file.changed") {
          // Phase C/D: lazily capture before-state for real diffs.
          void snapshotTaskFile(evt.taskId, evt);
        }
        if (evt.type === "agent.completed" || evt.type === "agent.failed" || evt.type === "agent.cancelled") {
          setIsLoading(false);
        }
        if (evt.type === "agent.completed") {
          // Phase B: verify claimed files against disk before reporting success.
          void verifyTaskCompletion(evt.taskId);
        }
      });
    } catch {
      /* bridge unavailable — normal chat continues */
    }
    return () => {
      try {
        dispose();
      } catch {
        /* noop */
      }
    };
  }, [humanizeAgentEvent, patchExecutionMessage, statusForEvent, snapshotTaskFile, verifyTaskCompletion]);

  /**
   * Chat → OpenCode seam. Returns true when the turn was absorbed by
   * execution (same conversation UI; never redirects to /agent).
   */
  const tryRouteToExecution = useCallback(
    async (args: {
      chatId: string;
      assistantMessageId: string;
      text: string;
      projectId?: string | null;
      inputSource: "text" | "voice";
      model?: string;
      /** Explicit escalation (user picked run-as-task): build regardless of heuristics. */
      forceBuild?: boolean;
    }): Promise<boolean> => {
      let decision: { category: string; routeToOpenCode: boolean; mode: "plan" | "build"; reason: string };
      try {
        decision = decideRoute(args.text);
      } catch {
        return false;
      }
      if (!decision.routeToOpenCode) return false;
      if (getExecutionRuntime() !== "opencode") return false;
      if (!hasOpenCodeDesktopApi()) return false;

      const workspaceRoot = resolveExecutionWorkspace(args.projectId);
      if (!workspaceRoot) {
        // Execution needs files but no workspace is selected: contextual
        // prompt inline (never a technical error, never Settings).
        setWorkspaceNeeded(true);
        patchMessageById(args.chatId, args.assistantMessageId, (m) => ({
          ...m,
          executionStatus: undefined,
          content:
            "This task needs a workspace before I can run it.\n\nChoose a project folder (or create one), then send the message again — I'll pick up right here in this conversation.",
          streaming: false,
        }));
        setIsLoading(false);
        return true;
      }

      // Task continuity: note the previous task in this conversation (if still
      // active) so the new task carries context — but never blindly reuse a
      // process; the harness owns session decisions.
      const prevTasks = chatsRef.current.find((c) => c.id === args.chatId)?.taskIds ?? [];
      const lastId = prevTasks[prevTasks.length - 1];
      const lastStatus = lastId ? executionTasksRef.current[lastId]?.status : undefined;
      const continuing =
        lastId && lastStatus && ["QUEUED", "STARTING", "RUNNING", "WAITING_FOR_PERMISSION"].includes(lastStatus)
          ? ` (continuing conversation; related in-flight task ${lastId} is ${lastStatus})`
          : "";

      try {
        const mode = args.forceBuild ? "build" : decision.mode;
        // Phase B: bind the real project context (bounded; untrusted parts
        // are already DATA-wrapped by the harness prompt enrichment).
        const projectBlock = (() => {
          try {
            return projectContextProviderRef.current?.() ?? null;
          } catch {
            return null;
          }
        })();
        patchMessageById(args.chatId, args.assistantMessageId, (m) => ({
          ...m,
          executionStatus: "starting",
          agentTrace: [
            {
              step: "agent.started",
              detail:
                mode === "plan"
                  ? "Working on it… (plan · read-only — ask for changes to switch to build)"
                  : "Working on it… (build — writes will ask for approval)",
            },
          ],
        }));
        const created = await openCodeAgentApi.createTask({
          prompt: `${args.text.slice(0, 8000)}${continuing}${projectBlock ? `\n\n${projectBlock.slice(0, 3000)}` : ""}`.slice(0, 12000),
          title: args.text.slice(0, 80),
          workspaceRoot,
          mode,
          inputSource: args.inputSource,
          model: args.model?.trim() ? args.model.trim() : undefined,
        });
        setExecutionTasks((prev) => ({ ...prev, [created.id]: created }));
        setExecutionEvents((prev) => ({ ...prev, [created.id]: [] }));
        // Re-link placeholder message to the real task id.
        setChats((prev) =>
          prev.map((c) =>
            c.id === args.chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === args.assistantMessageId ? { ...m, taskId: created.id } : m
                  ),
                  updatedAt: new Date(),
                }
              : c
          )
        );
        appendTaskToChat(args.chatId, created.id);
        const started = await openCodeAgentApi.startTask(created.id);
        setExecutionTasks((prev) => ({ ...prev, [created.id]: started }));
        setExecutionDrawerTaskId((cur) => cur ?? created.id);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Execution failed to start.";
        patchMessageById(args.chatId, args.assistantMessageId, (m) => ({
          ...m,
          executionStatus: "failed",
          content: `I couldn't start the execution engine: ${msg}\n\nFalling back to chat — tell me more about what you need, or check Setup → Execution.`,
          streaming: false,
        }));
        setIsLoading(false);
        return true;
      }
    },
    [appendTaskToChat, patchMessageById]
  );

  const cancelExecutionTask = useCallback(
    async (taskId: string) => {
      try {
        const t = await openCodeAgentApi.cancelTask(taskId);
        setExecutionTasks((prev) => ({ ...prev, [taskId]: t }));
      } catch (e) {
        console.error("cancelExecutionTask failed", e);
      }
      patchExecutionMessage(taskId, (m) => ({ ...m, executionStatus: "cancelled", streaming: false }));
      setIsLoading(false);
    },
    [patchExecutionMessage]
  );

  const respondToExecutionPermission = useCallback(
    async (taskId: string, approvalId: string, decision: "allow-once" | "allow-task" | "deny") => {
      try {
        const t = await openCodeAgentApi.respondToPermission({ taskId, approvalId, decision });
        setExecutionTasks((prev) => ({ ...prev, [taskId]: t }));
        patchExecutionMessage(taskId, (m) => ({
          ...m,
          executionStatus: "running",
          agentTrace: [...(m.agentTrace ?? []), { step: "agent.permission.responded", detail: `Permission ${decision}` }],
        }));
      } catch (e) {
        toast({
          title: "Permission failed",
          description: e instanceof Error ? e.message : "Could not respond.",
          variant: "destructive",
        });
      }
    },
    [patchExecutionMessage, toast]
  );

  /* ---------- Universal OpenCode layer: ask + build + plan, no keys ---------- */
  const [openCodeLayer, setOpenCodeLayer] = useState<OpenCodeLayerSnapshot>({
    available: false,
    checking: hasOpenCodeDesktopApi(),
    baseUrl: null,
    models: [],
    status: null,
    askReady: false,
    opencodeInstalled: false,
  });
  const openCodeLayerRef = useRef(openCodeLayer);
  openCodeLayerRef.current = openCodeLayer;

  const [openCodeModel, setOpenCodeModelState] = useState<string>(() => loadStoredOpenCodeModel() ?? "auto");
  const openCodeModelRef = useRef(openCodeModel);
  openCodeModelRef.current = openCodeModel;

  const refreshOpenCodeLayer = useCallback(async () => {
    if (!hasOpenCodeDesktopApi()) {
      setOpenCodeLayer({
        available: false, checking: false, baseUrl: null, models: [], status: null,
        askReady: false, opencodeInstalled: false,
      });
      return;
    }
    setOpenCodeLayer((prev) => ({ ...prev, checking: true }));
    const snap = await fetchOpenCodeLayer();
    setOpenCodeLayer({ ...snap, checking: false });
    // Adopt stored/default model once models are known.
    setOpenCodeModelState((prev) => {
      if (prev && prev !== "auto" && snap.models.some((m) => m.id === prev)) return prev;
      const stored = loadStoredOpenCodeModel();
      if (stored && snap.models.some((m) => m.id === stored)) return stored;
      return snap.models.length ? defaultOpenCodeModel(snap.models) : prev;
    });
  }, []);

  useEffect(() => {
    void refreshOpenCodeLayer();
  }, [refreshOpenCodeLayer]);

  /**
   * Desktop first contact: bring our own runtime up automatically so chat
   * just works (ask via the binary, stream via the gateway when ready).
   * Once per session, fail-closed — status banners explain the rest.
   */
  const autoEnsureTriedRef = useRef(false);
  useEffect(() => {
    if (autoEnsureTriedRef.current) return;
    if (!hasOpenCodeDesktopApi()) return;
    if (openCodeLayer.checking) return;
    if (openCodeLayer.available) return;
    autoEnsureTriedRef.current = true;
    void (async () => {
      try {
        await openCodeAgentApi.ensureRuntime();
      } catch {
        /* banner covers it */
      } finally {
        await refreshOpenCodeLayer();
      }
    })();
  }, [openCodeLayer.checking, openCodeLayer.available, refreshOpenCodeLayer]);

  const setOpenCodeModel = useCallback((id: string) => {
    const clean = id.trim() || "auto";
    setOpenCodeModelState(clean);
    storeOpenCodeModel(clean);
  }, []);

  /**
   * Ask-path through the layer: gateway streaming when the gateway is up,
   * else the real binary (`opencode run`) chunked into the bubble.
   * Same streaming UX either way; no keys, no provider maze.
   */
  const runLayerPipeline = useCallback(
    async (
      activeChatId: string,
      chatMessages: Message[],
      extras: PipelineExtras,
      opts?: { projectId?: string | null }
    ) => {
      const layer = openCodeLayerRef.current;
      if (!layer.available) throw new Error("OpenCode layer unavailable.");
      const model = openCodeModelRef.current?.trim() || defaultOpenCodeModel(layer.models);
      const controller = new AbortController();
      abortControllersRef.current = [controller];

      const assistantMessageId = uuidv4();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        streaming: true,
      };
      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === activeChatId
            ? { ...chat, messages: [...chat.messages, assistantMessage], updatedAt: new Date() }
            : chat
        )
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
      const patchAssistant = (patch: (m: Message) => Message) => {
        batcher.flushPending();
        setChats((prevChats) =>
          prevChats.map((chat) => {
            if (chat.id !== activeChatId) return chat;
            return {
              ...chat,
              messages: chat.messages.map((msg) => (msg.id === assistantMessageId ? patch(msg) : msg)),
              updatedAt: new Date(),
            };
          })
        );
      };
      const finishText = (
        text: string,
        metrics: ResponseMetrics,
        modelLabel: string,
        startedAt: number
      ) => {
        void startedAt;
        patchAssistant((msg) => ({
          ...msg,
          content: text,
          metrics,
          researchSources: extras.researchSources,
          agentTrace: extras.agentTrace,
          streaming: false,
        }));
        updateChatTitleFromMessages(activeChatId, [
          ...chatMessages,
          { ...assistantMessage, content: text, metrics },
        ]);
        if (chatLogPersisterRef.current) {
          const lastUser = [...chatMessages].reverse().find((m) => m.role === "user");
          if (lastUser && typeof lastUser.content === "string") {
            chatLogPersisterRef.current(activeChatId, "user", lastUser.content, "");
          }
          chatLogPersisterRef.current(activeChatId, "assistant", text, `opencode/${modelLabel}`);
        }
      };
      const startedAt = Date.now();
      // NOTE: baseUrl is always computed from the port — it says nothing
      // about the gateway being UP. Only READY means streamable.
      const gatewayUp = Boolean(layer.baseUrl) && layer.status?.omniRoute?.status === "READY";
      const shortReason = (e: unknown) => (e instanceof Error ? e.message.slice(0, 160) : "request failed");
      try {
        // Project conversations run with project context; global chat uses
        // the neutral sandbox (never leaks a default folder's files).
        const askWorkspace =
          opts?.projectId ? resolveExecutionWorkspace(opts.projectId) || undefined : undefined;
        if (gatewayUp && layer.baseUrl) {
          try {
            const { text, metrics } = await streamOpenCodeLayerChat({
              model,
              baseUrl: layer.baseUrl,
              systemPrompts: extras.systemPrompts,
              chatMessages,
              signal: controller.signal,
              callbacks: {
                onDelta: (delta: string) => batcher.push(delta),
                onUsage: (u) => {
                  if (u.prompt_tokens != null) setStreamingPromptTokens(u.prompt_tokens);
                },
              },
            });
            batcher.flushPending();
            const finalMetrics: ResponseMetrics = {
              ttftMs: metrics.ttftMs,
              totalMs: metrics.totalMs,
              promptTokens: metrics.promptTokens,
              completionTokens: metrics.completionTokens,
              totalTokens: metrics.totalTokens,
            };
            finishText(text, finalMetrics, model, startedAt);
            return;
          } catch (gatewayError) {
            // Gateway went away mid-flight: fall through to the binary
            // instead of failing when OpenCode itself is installed.
            if (!layer.askReady) throw gatewayError;
          }
        }
        // Answer through the real binary (`opencode run`) — no gateway, no keys.
        if (!layer.askReady) throw new Error("OpenCode is not installed. See Setup → Execution.");
        const lastUser = [...chatMessages].reverse().find((m) => m.role === "user");
        const askText = typeof lastUser?.content === "string" ? lastUser.content : "";
        const startedRunAt = Date.now();
        const res = await askOpenCodeLayer({
          message: askText.slice(0, 8000),
          model,
          workspaceRoot: askWorkspace,
          title: askText.slice(0, 80),
          sessionId: askSessionsRef.current.get(activeChatId),
        });
        if (res.sessionId) askSessionsRef.current.set(activeChatId, res.sessionId);
        const blocked = Array.isArray(res.permissionRequests) ? res.permissionRequests.slice(0, 10) : [];
        let finalText = res.text;
        if (blocked.length > 0) {
          // The binary auto-denied mid-answer: never present the partial
          // text as a complete answer. Record escalation + surface selection.
          askEscalationsRef.current.set(assistantMessageId, { chatId: activeChatId, prompt: askText });
          patchAssistant((msg) => ({ ...msg, askPermissionRequests: blocked }));
          const listed = blocked.map((b) => `\n- ${b}`).join("");
          finalText =
            `${res.text ? `${res.text}\n\n` : ""}` +
            `OpenCode needed permission to continue and I held it back (quick answers never auto-approve):${listed}\n\nPick below to run it as an approval-gated task, or dismiss.`;
        }
        await streamTextChunked(finalText, (chunk) => batcher.push(chunk), controller.signal);
        batcher.flushPending();
        finishText(finalText, { ttftMs: null, totalMs: Date.now() - startedRunAt }, res.model, startedRunAt);
      } catch (error) {
        const aborted =
          (error instanceof Error || (typeof DOMException !== "undefined" && error instanceof DOMException)) &&
          (error as { name?: string }).name === "AbortError";
        batcher.flushPending();
        setChats((prevChats) =>
          prevChats.map((chat) => {
            if (chat.id !== activeChatId) return chat;
            return {
              ...chat,
              messages: aborted
                ? chat.messages.filter((msg) => msg.id !== assistantMessageId)
                : chat.messages.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          // Plain layer copy only — never the legacy
                          // provider formatters (no Hugging Face/key hints).
                           content:
                             msg.content ||
                             `OpenCode didn't respond — the runtime may be busy or offline. Check Setup → Execution, then click Retry below.`,
                          streaming: false,
                        }
                      : msg
                  ),
              updatedAt: new Date(),
            };
          })
        );
        if (!aborted) {
          toast({
            title: "OpenCode layer error",
            description: shortReason(error),
            variant: "destructive",
          });
        }
      } finally {
        setStreamingPromptTokens(null);
        setWebgpuModelDownloadProgress(null);
        setIsLoading(false);
        abortControllersRef.current = [];
      }
    },
    [toast]
  );

  /* Ask-path continuity + escalation (per conversation / message). */
  const askSessionsRef = useRef(new Map<string, string>());
  const askEscalationsRef = useRef(new Map<string, { chatId: string; prompt: string }>());

  const dismissAskPermissions = useCallback((messageId: string) => {
    askEscalationsRef.current.delete(messageId);
    setChats((prev) =>
      prev.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === messageId ? { ...m, askPermissionRequests: undefined } : m
        ),
      }))
    );
  }, []);

  const escalateAskToTask = useCallback(
    async (messageId: string) => {
      const esc = askEscalationsRef.current.get(messageId);
      if (!esc) return;
      askEscalationsRef.current.delete(messageId);
      const chatId = esc.chatId;
      if (!chatsRef.current.some((c) => c.id === chatId)) return;
      // Clear the prompt card, then run the SAME prompt as an
      // approval-gated build task in this conversation.
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId ? { ...m, askPermissionRequests: undefined } : m
                ),
                updatedAt: new Date(),
              }
            : c
        )
      );
      const assistantMessageId = uuidv4();
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    id: assistantMessageId,
                    role: "assistant",
                    content: "",
                    timestamp: new Date(),
                    streaming: true,
                  },
                ],
                updatedAt: new Date(),
              }
            : c
        )
      );
      setIsLoading(true);
      try {
        const chatProjectId =
          chatsRef.current.find((c) => c.id === chatId)?.projectId ?? null;
        await tryRouteToExecution({
          chatId,
          assistantMessageId,
          text: esc.prompt,
          projectId: chatProjectId,
          inputSource: "text",
          model: openCodeModelRef.current,
          forceBuild: true,
        });
      } catch {
        patchMessageById(chatId, assistantMessageId, (m) => ({
          ...m,
          content: "Couldn't start that as a task. Try sending it again as a message.",
          streaming: false,
        }));
        setIsLoading(false);
      }
    },
    [patchMessageById, tryRouteToExecution]
  );

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
    let ws = pipelineOpts?.workspaceAssistBlock;

    // Auto-RAG: if a research corpus provider is registered, fetch top hits for
    // the last user message and append them to the workspace assist block.
    if (corpusRagProviderRef.current) {
      try {
        const lastUser = [...msgs].reverse().find((m) => m.role === "user");
        const query = (typeof lastUser?.content === "string" ? lastUser.content : "")
          .slice(0, 400)
          .trim();
        if (query) {
          const evidence = await corpusRagProviderRef.current(query);
          if (evidence.trim()) {
            ws = ws ? `${ws}\n\n${evidence}` : evidence;
          }
        }
      } catch {
        /* RAG failure is non-fatal; continue without evidence */
      }
    }
    const researchOn =
      cfg.researchEnabled &&
      isResearchNetworkAllowed(cfg, !isNavigatorOnline()) &&
      ((cfg.aiProvider !== "webgpu_gemma" && cfg.aiProvider !== "local_gguf") || cfg.researchWithLocalModel);
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
    const layerOk = hasOpenCodeDesktopApi() && openCodeLayerRef.current.available;
    if ((!layerOk && !canSendMessage(apiConfig)) || isLoading || !currentChatId) return;
    if (!layerOk && apiConfig.aiProvider === "webgpu_gemma" && !getLocalWeightsConsent()) {
      toast({
        title: "On-device model not enabled",
        description:
          "Confirm the Qwen 0.5B download in the setup banner above the composer first.",
        variant: "destructive",
      });
      return;
    }
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

    setIsLoading(true);
    setStreamingPromptTokens(null);

    const workspaceBlock = notebookAssistSyncRef.current?.() ?? workspaceRouteAssistRef.current;
    try {
      const extras = await buildPipelineExtras(msgs, apiConfig, {
        workspaceAssistBlock: workspaceBlock,
      });
      await runAssistantPipeline(currentChatId, msgs, apiConfig, extras);
    } catch (e) {
      setIsLoading(false);
      setStreamingPromptTokens(null);
      console.error("Error regenerating:", e);
      toast({
        title: "Error",
        description: formatUserFacingError(e, "Failed to retry"),
        variant: "destructive",
      });
    }
  };

  const runAssistantPipeline = async (
    activeChatId: string,
    chatMessages: Message[],
    cfg: ApiKeyConfig,
    extras: PipelineExtras
  ) => {
    // Regenerate (and any direct callers) honor the universal layer too.
    if (hasOpenCodeDesktopApi() && openCodeLayerRef.current.available) {
      const chatProjectId = chatsRef.current.find((c) => c.id === activeChatId)?.projectId ?? null;
      await runLayerPipeline(activeChatId, chatMessages, extras, { projectId: chatProjectId });
      return;
    }
    const comparisonIds = dedupeModels(cfg.comparisonModelIds).slice(0, 4);
    const useTiling =
      cfg.aiProvider !== "webgpu_gemma" &&
      cfg.aiProvider !== "local_gguf" &&
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
        streaming: true,
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
        const notebookRoutedTask = detectNotebookRoutedTask(chatMessages);
        const streamCallbacks = {
          onDelta: (delta: string) => batcher.push(delta),
          onUsage: (u: { prompt_tokens?: number }) => {
            if (u.prompt_tokens != null) setStreamingPromptTokens(u.prompt_tokens);
          },
        };

        const { text, metrics, rateLimitHeaders } = notebookRoutedTask
          ? await streamRoutedTask(
              notebookRoutedTask,
              cfg,
              apiMessages,
              controller.signal,
              streamCallbacks,
              { navigatorOffline: !isNavigatorOnline() }
            )
          : cfg.aiProvider === "local_gguf"
            ? await import("@/lib/localGguf/streamLocalGguf").then(({ streamLocalGgufChat }) =>
                streamLocalGgufChat(cfg, cfg.model, apiMessages, controller.signal, {
                  ...streamCallbacks,
                })
              )
            : cfg.aiProvider === "webgpu_gemma"
              ? await import("@/lib/gemmaWebGpu/streamLocalGemma").then(({ streamLocalGemmaChat }) =>
                streamLocalGemmaChat(cfg, apiMessages, controller.signal, {
                  ...streamCallbacks,
                  onModelDownloadProgress: (pct) => {
                    setWebgpuModelDownloadProgress(pct);
                  },
                  onBackendPicked: (backend) => {
                    if (backend.device === "wasm" && backend.reason === "no-webgpu") {
                      toast({
                        title: "On-device model running on CPU",
                        description:
                          "WebGPU session failed or unavailable; using WASM/CPU (q8). Replies are slower than GPU but stay fully local.",
                      });
                    }
                  },
                  onModelAutoSwitched: ({ from, to, reason }) => {
                    /** Persist the auto-pick so ChatInput / Settings reflect the model actually loaded. */
                    setApiConfigState((prev) =>
                      prev.aiProvider === "webgpu_gemma" && prev.model === from.storedId
                        ? normalizeApiConfig({
                            ...prev,
                            model: to.storedId,
                            comparisonModelIds: [to.storedId],
                          })
                        : prev
                    );
                    toast({
                      title: `Switched to ${to.displayName}`,
                      description:
                        reason === "gpu-buffer"
                          ? `Your GPU can't fit ${from.displayName}; running the next-smaller model that does fit.`
                          : reason === "cpu-ram"
                            ? `Not enough RAM for ${from.displayName}; using a smaller model so generations stay responsive.`
                            : reason === "no-webgpu"
                              ? "WebGPU isn't available here, so we picked the smallest model for WASM/CPU inference."
                              : `Auto-selected a lighter model to keep chats responsive.`,
                    });
                  },
                  onDtypeFallback: ({ from, to }) => {
                    toast({
                      title: "Adjusting model precision",
                      description: `Retrying with ${to.toUpperCase()} after ${from.toUpperCase()} couldn't run on this device.`,
                    });
                  },
                })
              )
              : await streamChatForConfig(cfg, cfg.model, apiMessages, controller.signal, streamCallbacks);
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
                      streaming: false,
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

        // Persist messages to research project DB (fire-and-forget; non-critical).
        if (chatLogPersisterRef.current) {
          const lastUser = [...chatMessages].reverse().find((m) => m.role === "user");
          if (lastUser && typeof lastUser.content === "string") {
            chatLogPersisterRef.current(activeChatId, "user", lastUser.content, "");
          }
          chatLogPersisterRef.current(activeChatId, "assistant", text, cfg.model ?? "");
        }
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
    options?: { workspaceAssistBlock?: string; projectId?: string | null; inputSource?: "text" | "voice" }
  ) => {
    const trimmed = content.trim();
    if (!trimmed && attachments.length === 0) return;
    // Universal layer: on desktop with OpenCode available, EVERY request goes
    // through it — no keys, no provider maze, works offline (loopback).
    const useLayer = hasOpenCodeDesktopApi() && openCodeLayerRef.current.available;
    if (!useLayer) {
      if (!canSendChat(apiConfig)) {
        toastKeyMissing(
          apiConfig.aiProvider === "webgpu_gemma"
            ? "WebGPU is not available in this browser. Use Chrome/Edge or the desktop build, or switch to OpenRouter in Settings."
            : apiConfig.aiProvider === "local_gguf"
              ? "Use the Openbentt desktop app, install llama-server on PATH (or set a binary path), download a GGUF in Labs, and pick it in Settings."
              : "Add an OpenRouter API key or set an OpenAI-compatible base URL (e.g. Ollama) in Settings."
        );
        return;
      }
      if (!canSendMessage(apiConfig)) {
        toast({
          title: "Local model not selected",
          description: "Download a GGUF in Labs → Local model hub, then choose it in Settings → AI & models.",
          variant: "destructive",
        });
        return;
      }
      if (apiConfig.aiProvider === "webgpu_gemma" && !getLocalWeightsConsent()) {
        toast({
          title: "On-device model not enabled",
          description:
            "Confirm the Qwen 0.5B download in the setup banner above the composer (check the box, then Enable & chat or Download & cache).",
          variant: "destructive",
        });
        return;
      }

      try {
        assertChatProviderAllowed(apiConfig, !isNavigatorOnline());
      } catch (e) {
        toast({
          title: "Offline-first mode",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
        return;
      }
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

    const inputSource = options?.inputSource ?? "text";
    const projectId = options?.projectId ?? activeProjectIdRef.current ?? null;

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: body,
      timestamp: new Date(),
      attachments: attachments.length ? attachments : undefined,
      inputSource,
    };

    const prior = chatsRef.current.find((c) => c.id === activeChatId);
    const chatMessages = prior ? [...prior.messages, userMessage] : [userMessage];

    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            // Project is the workspace context boundary: stamp it once, keep it.
            projectId: chat.projectId ?? projectId ?? null,
            messages: [...chat.messages, userMessage],
            updatedAt: new Date(),
          };
        }
        return chat;
      })
    );

    setIsLoading(true);
    setStreamingPromptTokens(null);

    // ---- Unified Chat → OpenCode seam (same conversation, no redirect) ----
    // Execution-class turns are absorbed by OpenCode underneath; everything
    // else falls through to the normal assistant pipeline below.
    if (attachments.length === 0) {
      const seamAssistantId = uuidv4();
      const seamPlaceholder: Message = {
        id: seamAssistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        streaming: true,
        inputSource,
      };
      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === activeChatId
            ? { ...chat, messages: [...chat.messages, seamPlaceholder], updatedAt: new Date() }
            : chat
        )
      );
      let absorbed = false;
      try {
        absorbed = await tryRouteToExecution({
          chatId: activeChatId,
          assistantMessageId: seamAssistantId,
          text: body,
          projectId,
          inputSource,
          model: openCodeModelRef.current,
        });
      } catch {
        absorbed = false;
      }
      if (absorbed) return;
      // Not an execution turn: remove the seam placeholder, run normal chat.
      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === activeChatId
            ? {
                ...chat,
                messages: chat.messages.filter((m) => m.id !== seamAssistantId),
                updatedAt: new Date(),
              }
            : chat
        )
      );
    }

    const workspaceBlock =
      options?.workspaceAssistBlock ??
      notebookAssistSyncRef.current?.() ??
      workspaceRouteAssistRef.current;

    try {
      const extras = await buildPipelineExtras(chatMessages, apiConfig, {
        workspaceAssistBlock: workspaceBlock,
      });
      // Universal layer: ask-turns go through OpenCode (gateway stream
      // or the real binary) — same pipeline shape, no keys required.
      if (useLayer) {
        await runLayerPipeline(activeChatId, chatMessages, extras, { projectId });
        return;
      }
      await runAssistantPipeline(activeChatId, chatMessages, apiConfig, extras);
    } catch (e) {
      setIsLoading(false);
      setStreamingPromptTokens(null);
      console.error("Error preparing chat:", e);
      toast({
        title: "Error",
        description: formatUserFacingError(e, "Failed to send message"),
        variant: "destructive",
      });
    }
  };

  /** Voice transcripts enter the SAME canonical conversation as typed text. */
  const submitVoiceTranscript = async (transcript: string) => {
    const clean = transcript.trim().slice(0, 4000);
    if (!clean) return;
    await sendMessage(clean, [], { inputSource: "voice" });
  };

  /** Phase 6: agent mode + run plumbing (additive; standard pipeline untouched). */
  const [agentMode, setAgentMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("openbentt-agent-mode") === "1";
    } catch {
      return false;
    }
  });
  const [pendingAgentConfirm, setPendingAgentConfirm] = useState<{
    runId: string; toolId: string; summary: string;
  } | null>(null);
  const agentProjectProviderRef = useRef<(() => string | null) | null>(null);
  const agentRunMessageRef = useRef(new Map<string, { chatId: string; messageId: string }>());

  const setAgentModeAndPersist = useCallback((v: boolean) => {
    setAgentMode(v);
    try {
      localStorage.setItem("openbentt-agent-mode", v ? "1" : "0");
    } catch {
      /* non-critical */
    }
  }, []);

  const [sourceScope, setSourceScope] = useState<string[]>([]);

  const registerAgentProjectProvider = useCallback((fn: (() => string | null) | null) => {
    agentProjectProviderRef.current = fn;
  }, []);

  const projectContextProviderRef = useRef<(() => string | null) | null>(null);
  const registerProjectContextProvider = useCallback((fn: (() => string | null) | null) => {
    projectContextProviderRef.current = fn;
  }, []);

  const patchAgentMessage = useCallback(
    (chatId: string, messageId: string, patch: (m: Message) => Message) => {
      setChats((prevChats) =>
        prevChats.map((chat) => {
          if (chat.id !== chatId) return chat;
          return {
            ...chat,
            messages: chat.messages.map((msg) => (msg.id === messageId ? patch(msg) : msg)),
            updatedAt: new Date(),
          };
        })
      );
    },
    []
  );

  const persistAgentTurn = useCallback(
    (chatId: string, userContent: string, assistantText: string, model: string) => {
      updateChatTitleFromMessages(chatId, [
        ...(chatsRef.current.find((c) => c.id === chatId)?.messages ?? []),
      ]);
      if (chatLogPersisterRef.current) {
        try {
          chatLogPersisterRef.current(chatId, "user", userContent, "");
          chatLogPersisterRef.current(chatId, "assistant", assistantText, model);
        } catch {
          /* non-critical */
        }
      }
    },
    []
  );

  const sendAgentMessage = async (content: string, opts?: { projectId?: string }) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      if (!canSendChat(apiConfig)) {
        toastKeyMissing("Add an OpenRouter API key or set an OpenAI-compatible base URL in Settings.");
        return;
      }
      let activeChatId = currentChatId;
      if (activeChatId && !chatsRef.current.some((c) => c.id === activeChatId)) {
        activeChatId = null;
      }
      if (!activeChatId) {
        activeChatId = createNewChat();
      }
      const chatId: string = activeChatId;
      const projectId = opts?.projectId ?? agentProjectProviderRef.current?.() ?? undefined;

      const userMessage: Message = {
        id: uuidv4(), role: "user", content: trimmed, timestamp: new Date(),
      };
      const assistantMessage: Message = {
        id: uuidv4(), role: "assistant", content: "", timestamp: new Date(),
        agentTrace: [], streaming: true,
      };
      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, userMessage, assistantMessage], updatedAt: new Date() }
            : chat
        )
      );
      setIsLoading(true);
      const controller = new AbortController();
      abortControllersRef.current.push(controller);
      const messageId = assistantMessage.id;

      try {
        const def = getAgentDefinition("research-assistant");
        const modelFn = collectingModelFn(createRoutedModelFn(def, apiConfig));
        const output = await runAgent(
          def,
          { request: trimmed, projectId, chatId, source: "chat" },
          { model: modelFn, executeTool: defaultAgentToolExecutor },
          {
            signal: controller.signal,
            audit: createAgentAuditSink(),
            activity: (e) => {
              patchAgentMessage(chatId, messageId, (m) => ({
                ...m,
                agentTrace: [...(m.agentTrace ?? []), { step: e.kind, detail: e.detail ? `${e.label} · ${e.detail}` : e.label }],
              }));
            },
          }
        );
        agentRunMessageRef.current.set(output.run.runId, { chatId, messageId });
        patchAgentMessage(chatId, messageId, (m) => ({ ...m, agentRunId: output.run.runId }));
        const trace = agentStepsToTrace(output);
        const sources = runOutputToSources(output);
        if (output.run.status === "awaiting_confirmation" && output.run.pendingConfirmation) {
          const pending = output.run.pendingConfirmation;
          setPendingAgentConfirm({ runId: output.run.runId, toolId: pending.toolId, summary: pending.summary });
          patchAgentMessage(chatId, messageId, (m) => ({
            ...m,
            content: m.content || "The agent needs your confirmation to continue.",
            agentTrace: [...trace, { step: "awaiting_confirmation", detail: confirmationPromptFor(output) ?? pending.summary }],
            streaming: false,
          }));
          toast({ title: "Confirmation needed", description: `Agent requests: ${pending.toolId}` });
        } else if (output.run.status === "completed" && output.run.finalText !== undefined) {
          patchAgentMessage(chatId, messageId, (m) => ({ ...m, content: "", agentTrace: trace, streaming: true }));
          await streamTextChunked(output.run.finalText ?? "", (chunk) => {
            patchAgentMessage(chatId, messageId, (m) => ({ ...m, content: m.content + chunk }));
          }, controller.signal);
          patchAgentMessage(chatId, messageId, (m) => ({
            ...m, researchSources: sources, streaming: false,
            metrics: { ttftMs: null, totalMs: output.run.durationMs ?? 0 },
          }));
          persistAgentTurn(chatId, trimmed, output.run.finalText ?? "", apiConfig.model ?? "");
        } else {
          const kind = output.run.errorKind ?? "failed";
          patchAgentMessage(chatId, messageId, (m) => ({
            ...m,
            content: m.content || `Agent run ${output.run.status}: ${output.run.error ?? kind}`,
            agentTrace: trace,
            streaming: false,
          }));
          if (output.run.status === "failed") {
            toast({ title: "Agent run failed", description: output.run.error ?? kind, variant: "destructive" });
          }
        }
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === "AbortError";
        patchAgentMessage(chatId, messageId, (m) => ({
          ...m,
          content: m.content || (aborted ? "Agent run cancelled." : "Agent run failed."),
          streaming: false,
        }));
        if (!aborted) {
          console.error("Error in agent turn:", e);
          toast({ title: "Agent error", description: formatUserFacingError(e, "Agent run failed"), variant: "destructive" });
        }
      } finally {
        setIsLoading(false);
      }
  };

  const confirmAgentRun = useCallback(
    async (runId: string) => {
      const stored = getStoredRun(runId);
      const slot = agentRunMessageRef.current.get(runId);
      if (!stored || !slot) {
        toast({ title: "Confirmation expired", description: "The agent run is no longer available.", variant: "destructive" });
        setPendingAgentConfirm(null);
        return;
      }
      const pending = stored.run.pendingConfirmation;
      if (!pending) {
        setPendingAgentConfirm(null);
        return;
      }
      setPendingAgentConfirm(null);
      setIsLoading(true);
      const controller = new AbortController();
      abortControllersRef.current.push(controller);
      patchAgentMessage(slot.chatId, slot.messageId, (m) => ({ ...m, streaming: true }));
      try {
        const def = getAgentDefinition(stored.run.agentId);
        const modelFn = collectingModelFn(createRoutedModelFn(def, apiConfig));
        const output = await resumeAgentRun(
          runId, def,
          { model: modelFn, executeTool: defaultAgentToolExecutor },
          { userConfirmed: true, confirmedToolId: pending.toolId },
          {
            signal: controller.signal,
            audit: createAgentAuditSink(),
            activity: (e) => {
              patchAgentMessage(slot.chatId, slot.messageId, (m) => ({
                ...m,
                agentTrace: [...(m.agentTrace ?? []), { step: e.kind, detail: e.detail ? `${e.label} · ${e.detail}` : e.label }],
              }));
            },
          }
        );
        const trace = agentStepsToTrace(output);
        const sources = runOutputToSources(output);
        if (output.run.status === "awaiting_confirmation" && output.run.pendingConfirmation) {
          const next = output.run.pendingConfirmation;
          setPendingAgentConfirm({ runId: output.run.runId, toolId: next.toolId, summary: next.summary });
          patchAgentMessage(slot.chatId, slot.messageId, (m) => ({
            ...m, agentTrace: trace, streaming: false,
          }));
          toast({ title: "Confirmation needed", description: `Agent requests: ${next.toolId}` });
        } else if (output.run.status === "completed" && output.run.finalText !== undefined) {
          const continuation = output.run.finalText ?? "";
          await streamTextChunked(continuation, (chunk) => {
            patchAgentMessage(slot.chatId, slot.messageId, (m) => ({ ...m, content: m.content + chunk }));
          }, controller.signal);
          patchAgentMessage(slot.chatId, slot.messageId, (m) => ({
            ...m, agentTrace: trace, researchSources: sources, streaming: false,
            metrics: { ttftMs: null, totalMs: output.run.durationMs ?? 0 },
          }));
          persistAgentTurn(slot.chatId, stored.run.request, continuation, apiConfig.model ?? "");
        } else {
          patchAgentMessage(slot.chatId, slot.messageId, (m) => ({
            ...m, agentTrace: trace, streaming: false,
          }));
        }
      } catch (e) {
        patchAgentMessage(slot.chatId, slot.messageId, (m) => ({ ...m, streaming: false }));
        console.error("Error resuming agent run:", e);
        toast({ title: "Agent error", description: formatUserFacingError(e, "Could not resume agent run"), variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    },
    [apiConfig, patchAgentMessage, persistAgentTurn, toast]
  );

  const value: ChatContextProps = {
    chats,
    currentChatId,
    isLoading,
    isLoadingConfig,
    apiConfig,
    pendingComposer,
    clearPendingComposer,
    createNewChat,
    activeProjectId,
    setActiveProjectId,
    setProjectWorkspace,
    executionTasks,
    executionEvents,
    workspaceNeeded,
    setWorkspaceNeeded,
    executionDrawerTaskId,
    setExecutionDrawerTaskId,
    cancelExecutionTask,
    respondToExecutionPermission,
    registerProjectContextProvider,
    submitVoiceTranscript,
    escalateAskToTask,
    dismissAskPermissions,
    openCodeLayer,
    refreshOpenCodeLayer,
    openCodeModel,
    setOpenCodeModel,
    unifiedChatReady: openCodeLayer.available || canSendMessage(apiConfig),
    selectChat,
    deleteChat,
    clearChats,
    sendMessage,
    regenerateLastResponse,
    beginEditUserMessage,
    agentMode,
    setAgentMode: setAgentModeAndPersist,
    sourceScope,
    setSourceScope,
    pendingAgentConfirm,
    sendAgentMessage,
    confirmAgentRun,
    registerAgentProjectProvider,
    setApiConfig,
    stopStreaming,
    queuePromptInComposer,
    streamingPromptTokens,
    providerQuotaSnapshot,
    setWorkspaceRouteAssist,
    registerNotebookAssistSync,
    registerCorpusRagProvider,
    registerChatLogPersister,
    workspaceAssistTokenEstimate,
    setWorkspaceAssistTokenEstimate,
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
