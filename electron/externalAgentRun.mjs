/**
 * One-shot run of a connected coding CLI (Claude, Codex, Cursor Agent, …)
 * inside an existing task. Fixed argv, no shell. OpenCode stays on its own path.
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { detectExternalAgents } from "./externalAgentDetect.mjs";

const children = new Map();

const ALLOWED = new Set(["claude", "codex", "cursor-agent", "aider", "gemini"]);

export function isExternalAgentCli(id) {
  return ALLOWED.has(id);
}

export async function externalAgentReady(id) {
  if (!isExternalAgentCli(id)) return false;
  const agents = await detectExternalAgents();
  const found = agents.find((a) => a.id === id && a.available && a.path);
  if (!found) return false;
  if (id === "cursor-agent" && path.basename(found.path) === "cursor") return false;
  return true;
}

export function stopExternalAgent(taskId) {
  const child = children.get(taskId);
  if (!child) return;
  children.delete(taskId);
  try {
    child.kill("SIGTERM");
  } catch { /* already gone */ }
}

function argsFor(id, prompt) {
  switch (id) {
    case "claude":
      return ["-p", prompt];
    case "codex":
      return ["exec", prompt];
    case "cursor-agent":
      return ["-p", prompt];
    case "aider":
      return ["--message", prompt, "--no-auto-commits", "--exit"];
    case "gemini":
      return ["-p", prompt];
    default:
      return null;
  }
}

/**
 * @returns {Promise<boolean>} true when the CLI was spawned
 */
export async function startExternalAgent({ task, session, pushEvent, syncTaskState, app }) {
  const id = task.agentCli;
  if (!isExternalAgentCli(id)) return false;
  const args = argsFor(id, task.prompt);
  if (!args) return false;
  const agents = await detectExternalAgents();
  const found = agents.find((a) => a.id === id && a.available && a.path);
  if (!found) return false;
  if (id === "cursor-agent" && path.basename(found.path) === "cursor") return false;

  pushEvent(task.id, session.id, "agent.started", {
    title: task.title,
    mode: task.mode,
    workspace: task.workspace.rootPath,
    engine: id,
    message: `Running on ${found.name}.`,
  });

  const child = spawn(found.path, args, {
    cwd: task.workspace.rootPath,
    shell: false,
    windowsHide: true,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.set(task.id, child);
  let settled = false;

  let text = "";
  const pushText = (chunk) => {
    const piece = String(chunk ?? "");
    if (!piece) return;
    text = `${text}${piece}`.slice(-60000);
    pushEvent(task.id, session.id, "agent.message.delta", { delta: piece });
  };
  child.stdout?.on("data", pushText);
  child.stderr?.on("data", (chunk) => {
    const piece = String(chunk ?? "");
    if (piece.trim()) {
      pushEvent(task.id, session.id, "agent.terminal.output", { text: piece.slice(0, 4000) });
    }
  });

  const timer = setTimeout(() => {
    try { child.kill("SIGTERM"); } catch { /* noop */ }
  }, 10 * 60 * 1000);

  child.on("close", (code) => {
    clearTimeout(timer);
    children.delete(task.id);
    if (settled || task.status === "CANCELLED") return;
    settled = true;
    const answer = text.trim();
    if (code === 0) {
      task.status = "COMPLETED";
      task.updatedAt = new Date().toISOString();
      syncTaskState(app, task, session);
      pushEvent(task.id, session.id, "agent.completed", {
        message: answer ? "" : `Finished with ${found.name}.`,
        agent: id,
      });
    } else {
      task.status = "FAILED";
      task.error = answer.slice(0, 500) || `${found.name} exited ${code ?? "unknown"}`;
      task.updatedAt = new Date().toISOString();
      syncTaskState(app, task, session);
      pushEvent(task.id, session.id, "agent.failed", { message: task.error, agent: id });
    }
  });
  child.on("error", (err) => {
    clearTimeout(timer);
    children.delete(task.id);
    if (settled) return;
    settled = true;
    task.status = "FAILED";
    task.error = err instanceof Error ? err.message.slice(0, 300) : "agent failed to start";
    task.updatedAt = new Date().toISOString();
    syncTaskState(app, task, session);
    pushEvent(task.id, session.id, "agent.failed", { message: task.error, agent: id });
  });

  return true;
}
