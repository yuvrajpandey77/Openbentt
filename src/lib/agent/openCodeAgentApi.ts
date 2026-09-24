/**
 * Phase 1 — Renderer bridge to the Electron `agent:*` IPC (openbenttAgent).
 * Phase 3 adds narrow `voice:*` methods on the same surface (no new bridge).
 * Web fallback: unavailable (desktop-only execution).
 */
import type {
  CombinedAgentStatus,
  OmniRouteDetection,
  OpenCodeAgentEvent,
  OpenCodeDetection,
  OpenCodeRuntimeState,
  OpenCodeTask,
  RuntimeModel,
  VoiceEvent,
  VoiceSessionPublic,
  VoiceStatusSnapshot,
} from "./openCodeTypes";

interface AgentBridge {
  detectOpenCode: () => Promise<OpenCodeDetection>;
  defaultWorkspace: () => Promise<{ path: string }>;
  getStatus: () => Promise<{ runtime: OpenCodeRuntimeState; tasks: number; sessions: number }>;
  createTask: (args: {
    prompt: string;
    title?: string;
    workspaceRoot: string;
    displayName?: string;
    mode?: "plan" | "build";
    inputSource?: "text" | "voice";
    /** Optional OpenCode model pin from the chat model picker. */
    model?: string;
  }) => Promise<OpenCodeTask>;
  startTask: (taskId: string) => Promise<OpenCodeTask>;
  cancelTask: (taskId: string) => Promise<OpenCodeTask>;
  getTask: (taskId: string) => Promise<{ task: OpenCodeTask; events: OpenCodeAgentEvent[] }>;
  listTasks: () => Promise<OpenCodeTask[]>;
  respondToPermission: (args: {
    taskId: string;
    approvalId: string;
    decision: "allow-once" | "allow-task" | "deny";
  }) => Promise<OpenCodeTask>;
  onEvent: (cb: (evt: OpenCodeAgentEvent) => void) => () => void;
  /* Universal ask path: conversational turn through the real binary. */
  askOpenCode: (args: {
    message: string;
    model?: string;
    workspaceRoot?: string;
    title?: string;
    sessionId?: string;
  }) => Promise<{
    text: string;
    model: string;
    durationMs: number;
    sessionId?: string;
    permissionRequests: string[];
  }>;
  listOpenCodeModels: () => Promise<{ models: RuntimeModel[]; detected: boolean }>;
  /* Phase 2: OmniRoute runtime */
  detectOmniRoute: () => Promise<OmniRouteDetection>;
  getRuntimeStatus: () => Promise<CombinedAgentStatus>;
  getModels: (refresh?: boolean) => Promise<{ models: RuntimeModel[]; fetchedAt?: string | null }>;
  ensureRuntime: () => Promise<unknown>;
  restartRuntime: () => Promise<unknown>;
  /* Phase 3: local voice (narrow voice:* IPC; transcripts are untrusted input) */
  startVoiceSession: (mode?: string) => Promise<VoiceSessionPublic>;
  voiceMicReady: (sessionId: string) => Promise<VoiceSessionPublic>;
  voiceMicDenied: (sessionId: string, reason?: string) => Promise<VoiceSessionPublic>;
  beginVoiceUtterance: (sessionId: string) => Promise<VoiceSessionPublic & { utteranceId: string }>;
  sendVoiceAudio: (args: { sessionId: string; utteranceId: string; base64: string; last?: boolean }) => Promise<{ ok: boolean; done: boolean; transcript?: string; receivedBytes?: number }>;
  cancelVoiceUtterance: (sessionId: string) => Promise<VoiceSessionPublic>;
  voiceThinking: (sessionId: string) => Promise<VoiceSessionPublic>;
  speakVoiceText: (sessionId: string, text: string) => Promise<VoiceSessionPublic>;
  stopVoiceSpeaking: (sessionId: string) => Promise<VoiceSessionPublic>;
  stopVoiceSession: (sessionId: string) => Promise<{ ok: boolean; sessionId: string }>;
  setVoiceMode: (sessionId: string, mode: string) => Promise<VoiceSessionPublic>;
  getVoiceStatus: (sessionId?: string) => Promise<VoiceStatusSnapshot | VoiceSessionPublic>;
  getVoiceEngineStatus: () => Promise<{
    stt: { model: string; loaded: boolean; loading: boolean; fake?: boolean };
    tts: { backend: string; ok: boolean; error?: string };
  }>;
  ensureVoiceStt: (sessionId?: string) => Promise<unknown>;
  clearVoiceSttCache: () => Promise<{ ok: boolean; reason?: string }>;
  onVoiceEvent: (cb: (evt: VoiceEvent) => void) => () => void;
}

function bridge(): AgentBridge | undefined {
  try {
    const w = window as unknown as { openbenttAgent?: AgentBridge };
    return w.openbenttAgent;
  } catch {
    return undefined;
  }
}

export function hasOpenCodeDesktopApi(): boolean {
  return Boolean(bridge());
}

function requireBridge(): AgentBridge {
  const b = bridge();
  if (!b) throw new Error("OpenCode bridge unavailable (desktop only).");
  return b;
}

export const openCodeAgentApi = {
  detectOpenCode(): Promise<OpenCodeDetection> {
    return requireBridge().detectOpenCode();
  },
  defaultWorkspace(): Promise<{ path: string }> {
    return requireBridge().defaultWorkspace();
  },
  getStatus() {
    return requireBridge().getStatus();
  },
  createTask(args: Parameters<AgentBridge["createTask"]>[0]) {
    return requireBridge().createTask(args);
  },
  startTask(taskId: string) {
    return requireBridge().startTask(taskId);
  },
  cancelTask(taskId: string) {
    return requireBridge().cancelTask(taskId);
  },
  getTask(taskId: string) {
    return requireBridge().getTask(taskId);
  },
  listTasks() {
    return requireBridge().listTasks();
  },
  respondToPermission(args: Parameters<AgentBridge["respondToPermission"]>[0]) {
    return requireBridge().respondToPermission(args);
  },
  onEvent(cb: (evt: OpenCodeAgentEvent) => void): () => void {
    return requireBridge().onEvent(cb);
  },
  askOpenCode(args: Parameters<AgentBridge["askOpenCode"]>[0]) {
    return requireBridge().askOpenCode(args);
  },
  listOpenCodeModels() {
    return requireBridge().listOpenCodeModels();
  },
  detectOmniRoute() {
    return requireBridge().detectOmniRoute();
  },
  getRuntimeStatus() {
    return requireBridge().getRuntimeStatus();
  },
  getModels(refresh = true) {
    return requireBridge().getModels(refresh);
  },
  ensureRuntime() {
    return requireBridge().ensureRuntime();
  },
  restartRuntime() {
    return requireBridge().restartRuntime();
  },
  startVoiceSession(mode?: string) {
    return requireBridge().startVoiceSession(mode);
  },
  voiceMicReady(sessionId: string) {
    return requireBridge().voiceMicReady(sessionId);
  },
  voiceMicDenied(sessionId: string, reason?: string) {
    return requireBridge().voiceMicDenied(sessionId, reason);
  },
  beginVoiceUtterance(sessionId: string) {
    return requireBridge().beginVoiceUtterance(sessionId);
  },
  sendVoiceAudio(args: Parameters<AgentBridge["sendVoiceAudio"]>[0]) {
    return requireBridge().sendVoiceAudio(args);
  },
  cancelVoiceUtterance(sessionId: string) {
    return requireBridge().cancelVoiceUtterance(sessionId);
  },
  voiceThinking(sessionId: string) {
    return requireBridge().voiceThinking(sessionId);
  },
  speakVoiceText(sessionId: string, text: string) {
    return requireBridge().speakVoiceText(sessionId, text);
  },
  stopVoiceSpeaking(sessionId: string) {
    return requireBridge().stopVoiceSpeaking(sessionId);
  },
  stopVoiceSession(sessionId: string) {
    return requireBridge().stopVoiceSession(sessionId);
  },
  setVoiceMode(sessionId: string, mode: string) {
    return requireBridge().setVoiceMode(sessionId, mode);
  },
  getVoiceStatus(sessionId?: string) {
    return requireBridge().getVoiceStatus(sessionId);
  },
  getVoiceEngineStatus() {
    return requireBridge().getVoiceEngineStatus();
  },
  ensureVoiceStt(sessionId?: string) {
    return requireBridge().ensureVoiceStt(sessionId);
  },
  clearVoiceSttCache() {
    return requireBridge().clearVoiceSttCache();
  },
  onVoiceEvent(cb: (evt: VoiceEvent) => void): () => void {
    return requireBridge().onVoiceEvent(cb);
  },
};
