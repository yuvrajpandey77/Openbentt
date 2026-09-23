/**
 * Canonical Openbentt conversation model.
 *
 * One workspace. One conversation model. One composer. One harness.
 * OpenCode underneath.
 *
 * - Conversation is the canonical unit (global when projectId is null,
 *   project-scoped when projectId is set).
 * - A conversation may own MANY tasks (question → normal answer,
 *   research task, coding task → OpenCode). Never 1:1 conversation:process.
 * - Messages never duplicate history between Chat and OpenCode: OpenCode
 *   activity is rendered as native conversation activity on the same
 *   message/task, driven by normalized agent.* events.
 */

export type InputSource = "text" | "voice";

export interface Conversation {
  id: string;
  /** null/undefined = global chat; set = project workspace context */
  projectId?: string | null;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export type ConversationMessageRole = "user" | "assistant" | "system";

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: ConversationMessageRole;
  content: string;
  inputSource?: InputSource;
  /** OpenCode task spawned from this turn (if any). Many messages → one task; one conversation → many tasks. */
  taskId?: string;
  createdAt: string;
}

export interface ConversationTaskLink {
  conversationId: string;
  messageId: string;
  taskId: string;
  /** Last known session id for continuity (continue vs new session). */
  sessionId?: string;
  createdAt: string;
}

/** Map conversationId → ordered task ids (execution history, secondary to conversation). */
export type ConversationTaskMap = Record<string, string[]>;

/** A conversation may own many tasks; tasks never duplicate message history. */
export function linkTaskToConversation(
  map: ConversationTaskMap,
  conversationId: string,
  taskId: string
): ConversationTaskMap {
  const existing = map[conversationId] ?? [];
  if (existing.includes(taskId)) return map;
  return { ...map, [conversationId]: [...existing, taskId] };
}

export function getTasksForConversation(map: ConversationTaskMap, conversationId: string): string[] {
  return [...(map[conversationId] ?? [])];
}

/** Global chat vs project chat differ ONLY by projectId — same system. */
export function isProjectConversation(c: Pick<Conversation, "projectId">): boolean {
  return c.projectId != null && c.projectId !== "";
}
