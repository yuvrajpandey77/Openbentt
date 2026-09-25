/**
 * Phase 1 — OpenCode TypeScript contracts (types only, no runtime).
 * Runtime lives in openCodeCore.mjs (shared with Electron main).
 */

export type OpenCodeTaskStatus =
  | "QUEUED"
  | "STARTING"
  | "RUNNING"
  | "WAITING_FOR_PERMISSION"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "CRASHED"
  | "UNKNOWN";

export type OpenCodeSessionStatus =
  | "CREATING"
  | "READY"
  | "RUNNING"
  | "WAITING_FOR_PERMISSION"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "CRASHED"
  | "UNKNOWN";

export type OpenCodeRuntimeStatus =
  | "STOPPED"
  | "STARTING"
  | "READY"
  | "DEGRADED"
  | "STOPPING"
  | "CRASHED";

export type TaskCategory =
  | "CHAT"
  | "RESEARCH"
  | "DOCUMENT"
  | "CODE"
  | "SYSTEM_TASK"
  | "COMPUTER_USE"
  | "VOICE"
  | "UNKNOWN";

export type AgentCapability =
  | "READ_FILES"
  | "WRITE_FILES"
  | "DELETE_FILES"
  | "RUN_COMMANDS"
  | "NETWORK_ACCESS";

export type CommandRiskLevel =
  | "READ_ONLY"
  | "LOW_RISK"
  | "MODERATE_RISK"
  | "HIGH_RISK"
  | "SYSTEM_RISK";

export type OpenCodeEventType =
  | "agent.started"
  | "agent.status"
  | "agent.thinking"
  | "agent.tool.requested"
  | "agent.permission.requested"
  | "agent.permission.replied"
  | "agent.question.requested"
  | "agent.question.answered"
  | "agent.question.rejected"
  | "agent.tool.started"
  | "agent.tool.progress"
  | "agent.tool.output"
  | "agent.tool.completed"
  | "agent.tool.failed"
  | "agent.step.started"
  | "agent.step.completed"
  | "agent.step.failed"
  | "agent.file.changed"
  | "agent.diff.updated"
  | "agent.command.requested"
  | "agent.command.output"
  | "agent.terminal.started"
  | "agent.terminal.output"
  | "agent.terminal.completed"
  | "agent.message.delta"
  | "agent.message.completed"
  | "agent.reasoning.delta"
  | "agent.todo.updated"
  | "agent.context.updated"
  | "agent.session.status"
  | "agent.session.idle"
  | "agent.subagent.started"
  | "agent.error"
  | "agent.completed"
  | "agent.failed"
  | "agent.cancelled";

export interface OpenCodeWorkspace {
  workspaceId: string;
  rootPath: string;
  displayName: string;
}

export interface OpenCodeTask {
  id: string;
  title: string;
  prompt: string;
  category: TaskCategory;
  workspace: OpenCodeWorkspace;
  status: OpenCodeTaskStatus;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  lastEvent?: string;
  error?: string;
  mode?: "plan" | "build";
  /** Phase 2: provider attribution for audit/debugging. */
  provider?: string;
  model?: string;
  providerStatus?: string;
  /** Phase 3: input modality (text default). */
  inputSource?: InputSource;
  /** Live engine: OpenCode server session id (ses_*) for resume/inspect. */
  opencodeSessionId?: string;
  /** Distinguishes permission waits from question waits (both WAITING_FOR_PERMISSION). */
  waitingKind?: "permission" | "question";
  /** Server request id (per_ / que_ prefixed) currently blocking the task, if any. */
  pendingRequestId?: string;
  lastError?: string;
}

export interface OpenCodeSession {
  id: string;
  workspaceId: string;
  status: OpenCodeSessionStatus;
  createdAt: string;
  updatedAt: string;
  opencodeSessionId?: string;
  taskId?: string;
}

export interface OpenCodePermissionRequest {
  requestId: string;
  taskId: string;
  sessionId: string;
  capability: AgentCapability;
  risk: string;
  description: string;
  workspace: string;
  target: string;
  preview: Array<{ label: string; value: string }>;
  expiresAt: string;
  /** Bound approval id when bridged through actionStore. */
  approvalId?: string;
  fingerprint?: string;
}

export interface OpenCodeAgentEvent {
  eventId: string;
  taskId: string;
  sessionId: string;
  timestamp: string;
  type: OpenCodeEventType;
  payload: Record<string, unknown>;
}

export interface OpenCodeDetection {
  installed: boolean;
  executablePath?: string;
  version?: string;
  source?: "managed" | "system" | "unknown";
  compatible?: boolean;
}

/** Managed `opencode serve` state (live engine). */
export interface OpenCodeServerState {
  status: "STOPPED" | "STARTING" | "READY" | "DEGRADED" | "STOPPING" | "CRASHED";
  port?: number;
  pid?: number;
  startedAt?: string;
  lastError?: string;
  executablePath?: string;
  version?: string;
  connected: boolean;
  reconnects: number;
  restarts: number;
}

export interface OpenCodeQuestionOption {
  label: string;
  description?: string;
}

export interface OpenCodeQuestion {
  header: string;
  question: string;
  options: OpenCodeQuestionOption[];
  multi: boolean;
}

export interface OpenCodeTodo {
  content: string;
  status: string;
  priority: string;
}

export interface OpenCodeFileDiff {
  file: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface OpenCodeRuntimeState {
  status: OpenCodeRuntimeStatus;
  pid?: number;
  startedAt?: string;
  executablePath?: string;
  version?: string;
  workspace?: string;
  sessionCount?: number;
  lastError?: string;
}

/* ---------------- Phase 2: OmniRoute contracts ---------------- */

export type OmniRouteStatus =
  | "NOT_INSTALLED"
  | "DETECTED"
  | "STARTING"
  | "READY"
  | "DEGRADED"
  | "STOPPING"
  | "STOPPED"
  | "CRASHED";

export interface RuntimeModel {
  id: string;
  provider?: string;
  displayName?: string;
  available: boolean;
  metadata?: Record<string, unknown>;
}

export interface OmniRouteDetection {
  installed: boolean;
  executablePath?: string;
  version?: string;
  source?: "managed" | "system" | "unknown";
  compatible?: boolean;
}

export interface OmniRouteState {
  status: OmniRouteStatus;
  pid?: number;
  startedAt?: string;
  executablePath?: string;
  version?: string;
  port: number;
  baseUrl: string;
  provider?: { available?: boolean; modelCount?: number; lastCheckedAt?: string; detail?: string };
  modelsCached?: number;
  restartCount?: number;
  lastError?: string;
}

export interface CombinedAgentStatus {
  opencode: OpenCodeRuntimeState;
  omniRoute: OmniRouteState;
  tasks: number;
  sessions: number;
}

/* ---------------- Phase 3: voice contracts ---------------- */

export type InputSource = "text" | "voice";

export type VoiceSessionState =
  | "OFF"
  | "REQUESTING_PERMISSION"
  | "READY"
  | "LISTENING"
  | "TRANSCRIBING"
  | "THINKING"
  | "SPEAKING"
  | "INTERRUPTED"
  | "ERROR"
  | "STOPPING";

export type VoiceMode = "push-to-talk" | "auto";

export interface VoiceSessionPublic {
  id: string;
  mode: VoiceMode;
  state: VoiceSessionState;
  mic: string;
  utteranceId?: string | null;
  transcript?: string | null;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface VoiceStatusSnapshot {
  micGrant: boolean;
  sessions: VoiceSessionPublic[];
}

export type VoiceEventType =
  | "voice.mic.requested"
  | "voice.mic.active"
  | "voice.mic.unavailable"
  | "voice.listening"
  | "voice.transcribing"
  | "voice.transcript"
  | "voice.speaking"
  | "voice.interrupted"
  | "voice.stopped"
  | "voice.cancelled"
  | "voice.stt.progress"
  | "voice.error";

export interface VoiceEvent {
  eventId: string;
  sessionId: string;
  timestamp: string;
  type: VoiceEventType;
  payload: Record<string, unknown>;
}
