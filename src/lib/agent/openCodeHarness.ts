/**
 * Phase 1 — OpenCode harness (renderer-side orchestration facade).
 *
 * Flow: user task → classifyTask → workspace selection (explicit) →
 * createTask/startTask via openbenttAgent bridge → event stream →
 * permission UI → completion/cancel.
 *
 * The harness never touches the filesystem or processes directly; all
 * authority stays in Electron main (opencodeService.mjs). Untrusted content
 * is wrapped as DATA via wrapUntrustedContent.
 */
import { classifyTask, decideMode, shouldRouteToOpenCode, wrapUntrustedContent } from "./openCodeEvents";
import type { OpenCodeAgentEvent, OpenCodeTask, TaskCategory } from "./openCodeTypes";
import { openCodeAgentApi, hasOpenCodeDesktopApi } from "./openCodeAgentApi";

export interface HarnessTaskRequest {
  prompt: string;
  title?: string;
  workspaceRoot: string;
  displayName?: string;
  mode?: "plan" | "build";
  untrustedContext?: Array<{ source: string; text: string }>;
  /** Phase 3: input modality tag. Voice changes nothing about policy. */
  inputSource?: "text" | "voice";
  /** Selected OpenCode model (universal layer picker). */
  model?: string;
}

export interface HarnessRouteDecision {
  category: TaskCategory;
  routeToOpenCode: boolean;
  /** Plan by default; build only when the user explicitly asks for writes. */
  mode: "plan" | "build";
  reason: string;
}

export function decideRoute(prompt: string): HarnessRouteDecision {
  const category = classifyTask(prompt);
  const routeToOpenCode = shouldRouteToOpenCode(category);
  const mode = decideMode(prompt);
  const reason = routeToOpenCode
    ? `Execution semantics with project binding — routing to OpenCode (${mode}).`
    : category === "UNKNOWN"
      ? "Insufficient execution semantics — staying in chat."
      : `Category ${category} is handled by the native flow in Phase 1.`;
  return { category, routeToOpenCode, mode, reason };
}

export function enrichPrompt(req: HarnessTaskRequest): string {
  const parts = [req.prompt.trim()];
  if (req.untrustedContext?.length) {
    parts.push("");
    for (const ctx of req.untrustedContext.slice(0, 8)) {
      parts.push(wrapUntrustedContent(ctx.source, ctx.text));
    }
  }
  return parts.join("\n").slice(0, 20000);
}

export async function submitHarnessTask(req: HarnessTaskRequest): Promise<OpenCodeTask> {
  if (!hasOpenCodeDesktopApi()) throw new Error("OpenCode bridge unavailable (desktop only).");
  const prompt = enrichPrompt(req);
  const decision = decideRoute(req.prompt);
  if (!decision.routeToOpenCode) {
    throw new Error(`Not an execution task (${decision.category}). ${decision.reason}`);
  }
  const task = await openCodeAgentApi.createTask({
    prompt,
    title: req.title,
    workspaceRoot: req.workspaceRoot,
    displayName: req.displayName,
    mode: req.mode ?? decision.mode,
    inputSource: req.inputSource === "voice" ? "voice" : "text",
    model: req.model?.trim() ? req.model.trim() : undefined,
  });
  await openCodeAgentApi.startTask(task.id);
  return task;
}

/**
 * Phase 3 — voice entry point. A validated STT transcript enters the SAME
 * pipeline as typed text: decideRoute → createTask(inputSource: voice) →
 * policy → approvals. Voice is metadata, never authority.
 */
export async function submitVoiceTask(
  transcript: string,
  opts: Omit<HarnessTaskRequest, "prompt" | "inputSource">,
): Promise<OpenCodeTask> {
  const clean = typeof transcript === "string" ? transcript.trim().slice(0, 4000) : "";
  if (!clean) throw new Error("Empty transcript — nothing to run.");
  return submitHarnessTask({ ...opts, prompt: clean, inputSource: "voice" });
}

export type AgentEventCallback = (evt: OpenCodeAgentEvent) => void;

export function subscribeAgentEvents(cb: AgentEventCallback): () => void {
  return openCodeAgentApi.onEvent(cb);
}
