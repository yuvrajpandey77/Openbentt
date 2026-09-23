/**
 * Phase 1 (OpenCode) — Shared OpenCode core (single source of truth).
 * Plain JS so the renderer (via TS facades) and Electron (opencodeService.mjs)
 * share task classification, capability policy, command risk, workspace
 * boundary checks, version comparison, and event normalization with zero
 * divergence. Mirrors the toolCore.mjs / actionCore.mjs precedent.
 *
 * Deterministic only. No network, no LLM, no secrets, no Node APIs here.
 */

export const OPENCODE_MIN_VERSION = "1.0.0";

export const TASK_STATUSES = [
  "QUEUED",
  "STARTING",
  "RUNNING",
  "WAITING_FOR_PERMISSION",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "CRASHED",
  "UNKNOWN",
];

export const SESSION_STATUSES = [
  "CREATING",
  "READY",
  "RUNNING",
  "WAITING_FOR_PERMISSION",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "CRASHED",
  "UNKNOWN",
];

export const RUNTIME_STATUSES = [
  "STOPPED",
  "STARTING",
  "READY",
  "DEGRADED",
  "STOPPING",
  "CRASHED",
];

export const TASK_CATEGORIES = [
  "CHAT",
  "RESEARCH",
  "DOCUMENT",
  "CODE",
  "SYSTEM_TASK",
  "COMPUTER_USE",
  "VOICE",
  "UNKNOWN",
];

export const AGENT_CAPABILITIES = [
  "READ_FILES",
  "WRITE_FILES",
  "DELETE_FILES",
  "RUN_COMMANDS",
  "NETWORK_ACCESS",
];

export const COMMAND_RISK_LEVELS = [
  "READ_ONLY",
  "LOW_RISK",
  "MODERATE_RISK",
  "HIGH_RISK",
  "SYSTEM_RISK",
];

export const OPENCODE_EVENT_TYPES = [
  "agent.started",
  "agent.status",
  "agent.thinking",
  "agent.tool.requested",
  "agent.permission.requested",
  "agent.tool.started",
  "agent.tool.output",
  "agent.file.changed",
  "agent.command.requested",
  "agent.command.output",
  "agent.error",
  "agent.completed",
  "agent.failed",
  "agent.cancelled",
];

export const OPENCODE_LIMITS = {
  maxTaskTitleChars: 200,
  maxPromptChars: 20000,
  maxWorkspacePathChars: 1024,
  maxTargetChars: 2048,
  maxCommandChars: 4000,
  maxOutputChars: 64000,
  maxEventsPerTask: 500,
  maxTasks: 50,
  maxSessions: 8,
  maxLogChars: 200000,
  approvalTtlMs: 15 * 60 * 1000,
};

/* ---------------- version ---------------- */

export function parseVersionTag(raw) {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function compareVersions(a, b) {
  const pa = parseVersionTag(a);
  const pb = parseVersionTag(b);
  if (!pa || !pb) return 0;
  for (const k of ["major", "minor", "patch"]) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1;
  }
  return 0;
}

export function isSupportedVersion(version, min = OPENCODE_MIN_VERSION) {
  if (typeof version !== "string" || !parseVersionTag(version)) return false;
  return compareVersions(version, min) >= 0;
}

/* ---------------- task classifier (deterministic, conservative) ---------------- */

const CODE_SIGNALS = [
  /\bfix\b.*\b(bug|test|tests|build|error|fail)/i,
  /\b(refactor|patch|implement|build|create file|modify|edit)\b/i,
  /\b(inspect|analyze|review).{0,40}(repo|repository|project|codebase|code)\b/i,
  /\bcompile\b.{0,40}(thesis|project|document|paper|book|repo|code|latex)/i,
  /\b(latexmk|pdflatex|xelatex|bibtex)\b/i,
  /\bnpm (test|run|install|build)\b/i,
  /\b(git (status|diff|log)|pytest|cargo test|go test)\b/i,
  /\.(ts|tsx|js|jsx|py|rs|go)\b.*\b(fix|change|update)\b/i,
];

const RESEARCH_SIGNALS = [
  /\b(literature|paper|papers|citation|survey|research)\b/i,
  /\b(search|find).{0,30}(paper|article|study|studies)\b/i,
];

const DOCUMENT_SIGNALS = [
  /\b(summarize|summarise).{0,30}(pdf|document|doc|paper|report)\b/i,
  /\b(pdf|docx)\b/i,
];

const SYSTEM_SIGNALS = [
  /\b(install|deploy|docker|systemctl|service)\b.{0,30}\b(server|package|system)\b/i,
];

const COMPUTER_USE_SIGNALS = [
  /\b(open|launch).{0,20}(browser|chrome|firefox|app|application)\b/i,
  /\b(click|download).{0,20}(button|page|report|file)\b.*\b(browser|website)\b/i,
];

const VOICE_SIGNALS = [/\b(speak|say out loud|read aloud|voice)\b/i];

const CHAT_SIGNALS = [
  /\b(explain|what is|what are|how does|describe|tell me about)\b/i,
];

/**
 * Classify a user request. Conservative: CODE requires execution semantics
 * (a workspace/project + an action verb), not just the word "code".
 * Returns one of TASK_CATEGORIES.
 */
export function classifyTask(text) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return "UNKNOWN";
  const lower = t.toLowerCase();

  // Explicit execution intent + project binding beats generic chat.
  const mentionsProject =
    /project|repo|repository|codebase|workspace|this (repo|project|code|file)|my (project|repo|code|app)/i.test(t);
  const hasCodeAction =
    /fix|refactor|patch|implement|build|create|modify|edit|run (the )?tests?|debug|repair|inspect|analyze|review/i.test(t);

  if (COMPUTER_USE_SIGNALS.some((r) => r.test(t))) return "COMPUTER_USE";
  if (VOICE_SIGNALS.some((r) => r.test(t)) && t.length < 240) {
    // Voice is a modality, not a task — Phase 1 routes content, not modality.
    // Fall through to content classification unless nothing else matches.
  }
  if (DOCUMENT_SIGNALS.some((r) => r.test(t))) return "DOCUMENT";
  if (RESEARCH_SIGNALS.some((r) => r.test(t))) return "RESEARCH";
  if (SYSTEM_SIGNALS.some((r) => r.test(t))) return "SYSTEM_TASK";
  if (CODE_SIGNALS.some((r) => r.test(t))) return "CODE";
  if (mentionsProject && hasCodeAction) return "CODE";
  if (CHAT_SIGNALS.some((r) => r.test(t))) return "CHAT";
  // Short generic utterances default to CHAT only when clearly conversational.
  if (lower.length < 120 && /^(hi|hello|hey|thanks|ok)\b/.test(lower)) return "CHAT";
  return "UNKNOWN";
}

export function shouldRouteToOpenCode(category) {
  return category === "CODE";
}

/**
 * Plan is the default; build is added only when the user explicitly asks
 * for writes. Read-only inspection/analysis/explanation stays in plan.
 */
const BUILD_SIGNALS = [
  /\b(fix|patch|refactor|modify|implement|build|create|add|edit|update|delete|remove|migrate|rename|install|deploy|debug|repair)\b/i,
  /\brun (the )?tests?\b/i,
  /\bnpm (test|run|install|build)\b/i,
  /\bwrite (a|the|some)?\s?(test|code|file|script|component|function)\b/i,
];

export function decideMode(text) {
  const t = typeof text === "string" ? text : "";
  if (!t.trim()) return "plan";
  return BUILD_SIGNALS.some((r) => r.test(t)) ? "build" : "plan";
}

/* ---------------- capability policy (Phase 1) ---------------- */

export function isKnownCapability(cap) {
  return AGENT_CAPABILITIES.includes(cap);
}

/**
 * Phase 1 defaults:
 * READ_FILES allow-in-workspace / WRITE+DELETE+RUN+NETWORK confirm / unknown deny.
 * Returns { decision: "ALLOW"|"CONFIRM"|"DENY", reason }.
 */
export function evaluateCapabilityPolicy(capability, context = {}) {
  if (!isKnownCapability(capability)) {
    return { decision: "DENY", reason: "unknown capability" };
  }
  const inWorkspace = context.inWorkspace === true;
  switch (capability) {
    case "READ_FILES":
      if (inWorkspace) return { decision: "ALLOW", reason: "read inside workspace" };
      return { decision: "CONFIRM", reason: "read outside workspace requires confirmation" };
    case "WRITE_FILES":
    case "DELETE_FILES":
    case "RUN_COMMANDS":
    case "NETWORK_ACCESS":
      return { decision: "CONFIRM", reason: `${capability} requires user confirmation` };
    default:
      return { decision: "DENY", reason: "unknown capability" };
  }
}

/* ---------------- command parsing + risk ---------------- */

const SECRET_REDACT_PATTERNS = [
  /(api[_-]?key\s*[:=]\s*)(["']?)[^\s"'&;]+/gi,
  /(bearer\s+)[^\s"'&;]+/gi,
  /(password\s*[:=]\s*)(["']?)[^\s"'&;]+/gi,
  /(token\s*[:=]\s*)(["']?)[^\s"'&;]+/gi,
];

export function redactSecretsFromText(text) {
  if (typeof text !== "string") return "";
  let out = text;
  for (const re of SECRET_REDACT_PATTERNS) {
    out = out.replace(re, (_m, prefix, quote) => `${prefix}${quote ?? ""}[redacted]`);
  }
  // Authorization headers
  out = out.replace(/(authorization:\s*)[^\s;]+/gi, "$1[redacted]");
  // JSON-encoded secrets: {"api_key":"..."} / {"token":"..."} / {"password":"..."}
  // (Phase 2 hardening — provider/model metadata and event payloads are JSON.)
  out = out.replace(
    /("(?:api[_-]?key|token|password|secret|authorization|cookie|private[_-]?key|credential|access[_-]?token|refresh[_-]?token)"\s*:\s*")[^"]*/gi,
    "$1[redacted]",
  );
  // Spoken/natural-language form (Phase 3 — STT transcripts are prose):
  // "my api key is X", "the password is X". The value must look secret-like
  // (long or alphanumeric-with-digit) so ordinary sentences such as
  // "password is required" are left intact.
  out = out.replace(
    /\b(api[_\- ]?key|password|token|secret)\s+is\s+["']?([^\s"'&,.:;!?]+)/gi,
    (m, key, val) => {
      const v = String(val ?? "");
      if (v.length >= 12 || (v.length >= 8 && /\d/.test(v))) {
        return `${key} is [redacted]`;
      }
      return m;
    },
  );
  return out.slice(0, OPENCODE_LIMITS.maxOutputChars);
}

/**
 * Parse a shell command into { executable, args, raw }.
 * Handles simple quoting; never executes.
 */
export function parseCommand(commandText) {
  const raw = typeof commandText === "string" ? commandText.trim().slice(0, OPENCODE_LIMITS.maxCommandChars) : "";
  if (!raw) return { executable: "", args: [], raw: "" };
  const args = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) {
        args.push(cur);
        cur = "";
      }
    } else {
      cur += ch;
    }
  }
  if (cur) args.push(cur);
  const executable = (args.shift() ?? "").toLowerCase();
  return { executable, args, raw };
}

const READ_ONLY_BINARIES = new Set([
  "git", "ls", "cat", "head", "tail", "echo", "pwd", "whoami", "node",
  "python", "python3", "rg", "grep", "find", "wc", "diff", "tsc",
]);

const READ_ONLY_GIT_SUBCOMMANDS = new Set(["status", "diff", "log", "show", "branch", "ls-files"]);

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+.*-r/i,
  /\brm\s+-rf\b/i,
  /\bmkfs\b/i,
  /\bdd\b.*of=\/dev\//i,
  /:\(\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;/, // fork bomb
  /\bformat\b.*[c-z]:/i,
  /\bdel\b\s+\/[fs]/i,
];

const SYSTEM_PATTERNS = [/\bsudo\b/i, /\bsu\b/i, /\bdoas\b/i, /\brun0\b/i, /powershell.*bypass/i];

/**
 * Classify command risk. Conservative: unknown → MODERATE (confirm), never ALLOW.
 * Returns { level, reasons: string[], executable, args }.
 */
export function classifyCommand(commandText, opts = {}) {
  const { executable, args, raw } = parseCommand(commandText);
  const reasons = [];
  if (!raw) return { level: "MODERATE_RISK", reasons: ["empty command"], executable, args };

  const hay = `${executable} ${args.join(" ")}`;
  const hasChaining = /(&&|\|\||\||;|\$\(|`)/.test(raw);
  const hasRedirect = /(^|\s)(>|>>|<|2>|&\>)/.test(raw);
  const touchesHome = /~\/\.(ssh|aws|gnupg|config)/.test(raw) || /\.ssh\//.test(raw);
  const touchesCreds =
    /\.aws\/credentials|\.npmrc|browser.*(profile|Login Data)|password|secret/i.test(raw);

  if (SYSTEM_PATTERNS.some((r) => r.test(raw))) {
    reasons.push("privilege escalation");
    return { level: "SYSTEM_RISK", reasons, executable, args };
  }
  if (DESTRUCTIVE_PATTERNS.some((r) => r.test(raw))) {
    reasons.push("destructive filesystem operation");
    return { level: touchesCreds ? "SYSTEM_RISK" : "HIGH_RISK", reasons, executable, args };
  }
  if (touchesCreds || touchesHome) {
    reasons.push("credential or identity store access");
    return { level: "SYSTEM_RISK", reasons, executable, args };
  }
  // Package installs are moderate (network + filesystem write, confirmable).
  if (/^(npm|pnpm|yarn|pip|pip3|cargo|go)\b/.test(hay) && /\b(install|add|update|upgrade)\b/.test(hay)) {
    reasons.push("package installation");
    return { level: "MODERATE_RISK", reasons, executable, args };
  }
  if (/^(npm|pnpm|yarn)\b/.test(hay) && /\b(test|run|build|lint|typecheck)\b/.test(hay)) {
    reasons.push("project script execution");
    if (hasChaining) reasons.push("shell chaining");
    return { level: "MODERATE_RISK", reasons, executable, args };
  }
  if (executable === "git" && READ_ONLY_GIT_SUBCOMMANDS.has((args[0] ?? "").toLowerCase())) {
    reasons.push("read-only vcs inspection");
    return { level: "READ_ONLY", reasons, executable, args };
  }
  if (READ_ONLY_BINARIES.has(executable) && !hasRedirect && !hasChaining) {
    reasons.push("read-only utility");
    // opts.allowReadOnly bypasses nothing — callers still enforce workspace.
    void opts;
    return { level: "READ_ONLY", reasons, executable, args };
  }
  if (/curl|wget|ssh|scp|ftp|telnet|nc\b/i.test(hay)) {
    reasons.push("network operation");
    return { level: "MODERATE_RISK", reasons, executable, args };
  }
  if (hasChaining) reasons.push("shell chaining");
  if (hasRedirect) reasons.push("redirection");
  if (hasChaining || hasRedirect) return { level: "MODERATE_RISK", reasons, executable, args };
  reasons.push("unknown command — confirmation required");
  return { level: "MODERATE_RISK", reasons, executable, args };
}

/* ---------------- workspace boundary (pure helpers) ---------------- */

export function isUncPath(p) {
  return typeof p === "string" && (/^\\\\[^\\]+\\[^\\]+/.test(p) || /^\/\/[^/]+\/[^/]+/.test(p));
}

export function hasDriveEscape(candidate, workspaceRoot) {
  if (typeof candidate !== "string" || typeof workspaceRoot !== "string") return true;
  const driveRe = /^[a-zA-Z]:[\\/]/;
  const candDrive = (candidate.match(driveRe) ?? [null])[0];
  const rootDrive = (workspaceRoot.match(driveRe) ?? [null])[0];
  if (candDrive || rootDrive) {
    if (!candDrive || !rootDrive) return true;
    if (candDrive.toLowerCase() !== rootDrive.toLowerCase()) return true;
  }
  return false;
}

/**
 * Pure lexical containment check (no fs access — main adds realpath/symlink
 * resolution on top). Returns { ok, reason }.
 */
export function checkPathContainedLexical(workspaceRoot, candidatePath) {
  if (typeof workspaceRoot !== "string" || !workspaceRoot.trim()) {
    return { ok: false, reason: "invalid workspace" };
  }
  if (typeof candidatePath !== "string" || !candidatePath.trim()) {
    return { ok: false, reason: "invalid path" };
  }
  const t = candidatePath.trim();
  if (t.includes("\0")) return { ok: false, reason: "null byte" };
  if (isUncPath(t) && !isUncPath(workspaceRoot)) {
    return { ok: false, reason: "UNC path escape" };
  }
  if (hasDriveEscape(t, workspaceRoot)) return { ok: false, reason: "drive escape" };
  // Normalize separators for comparison (Windows-insensitive drive handled above).
  const norm = (s) => s.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
  const root = norm(workspaceRoot);
  const cand = norm(t);
  // Absolute escape: candidate absolute and not under root.
  const candAbs = cand.startsWith("/") || /^[a-zA-Z]:\//.test(cand);
  if (candAbs && cand !== root && !cand.startsWith(root + "/")) {
    return { ok: false, reason: "absolute path escape" };
  }
  // Resolve `.` / `..` lexically relative to root for relative candidates.
  const base = candAbs ? "" : `${root}/`;
  const parts = `${base}${candAbs ? cand : cand}`.split("/");
  const stack = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!stack.length) return { ok: false, reason: "path traversal" };
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  const resolved = `/${stack.join("/")}`;
  const rootParts = root.replace(/^[a-zA-Z]:/, "").split("/").filter(Boolean);
  const resolvedParts = resolved.split("/").filter(Boolean);
  // Re-attach drive comparison: compare after root prefix.
  const rootNorm = `/${rootParts.join("/")}`;
  if (resolved !== rootNorm && !resolved.startsWith(rootNorm + "/")) {
    return { ok: false, reason: "path traversal" };
  }
  return { ok: true, reason: "contained" };
}

/**
 * Detect prompt-injection directives in untrusted content. Conservative
 * keyword scan — the harness treats matches as data, never instructions.
 */
const INJECTION_PATTERNS = [
  /ignore (all |all previous |previous |above ).*instructions/i,
  /\bignore\b.{0,40}\b(permissions?|polic(y|ies)|guardrails|restrictions|rules|instructions?)\b/i,
  /disregard .*(instructions|policy|permissions)/i,
  /bypass .*(permission|approval|policy|security)/i,
  /execute (this|the following) command/i,
  /run .* without (asking|approval|permission|confirmation)/i,
  /you are now (in|in unrestricted|without)/i,
  /developer mode|jailbreak|DAN mode/i,
];

export function scanForPromptInjection(text) {
  const t = typeof text === "string" ? text : "";
  for (const re of INJECTION_PATTERNS) {
    const m = t.match(re);
    if (m) return { clean: false, matched: m[0].slice(0, 120) };
  }
  return { clean: true, matched: null };
}

/* ---------------- event normalization ---------------- */

let eventCounter = 0;

export function newAgentEventId(prefix = "aevt") {
  eventCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${eventCounter.toString(36)}`;
}

export function normalizeOpenCodeEvent(raw, binding = {}) {
  const taskId = typeof binding.taskId === "string" ? binding.taskId : "unknown";
  const sessionId = typeof binding.sessionId === "string" ? binding.sessionId : "unknown";
  const timestamp = new Date().toISOString();
  const eventId = newAgentEventId();
  if (!raw || typeof raw !== "object") {
    return {
      eventId, taskId, sessionId, timestamp,
      type: "agent.error",
      payload: { message: "malformed event from engine" },
    };
  }
  const type = typeof raw.type === "string" ? raw.type : "";
  if (!OPENCODE_EVENT_TYPES.includes(type)) {
    return {
      eventId, taskId, sessionId, timestamp,
      type: "agent.error",
      payload: { message: `unknown event type: ${type.slice(0, 64)}` },
    };
  }
  const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
  // Redact + bound every payload that crosses into React.
  const safe = {};
  for (const [k, v] of Object.entries(payload).slice(0, 32)) {
    if (typeof v === "string") safe[k] = redactSecretsFromText(v).slice(0, 4000);
    else if (typeof v === "number" || typeof v === "boolean") safe[k] = v;
    else {
      try {
        safe[k] = JSON.parse(redactSecretsFromText(JSON.stringify(v)).slice(0, 8000));
      } catch {
        safe[k] = "[unserializable]";
      }
    }
  }
  return { eventId, taskId, sessionId, timestamp, type, payload: safe };
}

/* ---------------- permission request ---------------- */

export function buildPermissionRequest({ taskId, sessionId, capability, risk, description, workspace, target, preview }) {
  if (!isKnownCapability(capability)) throw new Error("Unknown capability");
  if (typeof taskId !== "string" || !taskId) throw new Error("Invalid task id");
  return {
    requestId: newAgentEventId("aperm"),
    taskId,
    sessionId: sessionId ?? "unknown",
    capability,
    risk: risk ?? "MEDIUM",
    description: String(description ?? "").slice(0, 2000),
    workspace: String(workspace ?? "").slice(0, 1024),
    target: String(target ?? "").slice(0, 2048),
    preview: Array.isArray(preview) ? preview.slice(0, 16) : [],
    expiresAt: new Date(Date.now() + OPENCODE_LIMITS.approvalTtlMs).toISOString(),
  };
}

/* ---------------- task helpers ---------------- */

export function newTaskId(prefix = "otask") {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff).toString(36)}`.slice(0, 64);
}

export function newSessionId(prefix = "osess") {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff).toString(36)}`.slice(0, 64);
}

export function isValidTaskStatus(s) {
  return TASK_STATUSES.includes(s);
}

export function sanitizeTaskTitle(raw) {
  if (typeof raw !== "string") return "Untitled task";
  const t = raw.trim().slice(0, OPENCODE_LIMITS.maxTaskTitleChars);
  return t || "Untitled task";
}

/* ---------------- Phase 2: OmniRoute pure helpers ---------------- */

export const OMNIROUTE_DEFAULT_PORT = 20128;
export const OMNIROUTE_LOOPBACK_HOST = "127.0.0.1";
export const OMNIROUTE_MIN_VERSION = "0.1.0";

export const OMNIROUTE_STATES = [
  "NOT_INSTALLED",
  "DETECTED",
  "STARTING",
  "READY",
  "DEGRADED",
  "STOPPING",
  "STOPPED",
  "CRASHED",
];

const OMNIROUTE_TRANSITIONS = {
  NOT_INSTALLED: ["DETECTED", "NOT_INSTALLED", "DEGRADED"],
  DETECTED: ["STARTING", "NOT_INSTALLED", "STOPPED"],
  STARTING: ["READY", "DEGRADED", "CRASHED", "STOPPED"],
  READY: ["DEGRADED", "STOPPING", "CRASHED", "READY"],
  DEGRADED: ["STARTING", "STOPPING", "READY", "CRASHED"],
  STOPPING: ["STOPPED", "CRASHED"],
  STOPPED: ["STARTING", "DETECTED"],
  CRASHED: ["STARTING", "STOPPED"],
};

export function isValidOmniRouteTransition(from, to) {
  if (!OMNIROUTE_STATES.includes(from) || !OMNIROUTE_STATES.includes(to)) return false;
  return (OMNIROUTE_TRANSITIONS[from] ?? []).includes(to);
}

export function omniRouteBaseUrl(port = OMNIROUTE_DEFAULT_PORT) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error("Invalid OmniRoute port");
  return `http://${OMNIROUTE_LOOPBACK_HOST}:${p}/v1`;
}

export function assertLoopbackUrl(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 256) throw new Error("Invalid endpoint");
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("Invalid endpoint");
  }
  if (u.protocol !== "http:") throw new Error("Endpoint must be http loopback");
  const host = u.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Endpoint must be loopback");
  if (u.username || u.password) throw new Error("Invalid endpoint");
  return u;
}

export const RUNTIME_MODEL_LIMITS = {
  maxModels: 200,
  maxIdChars: 256,
  maxProviderChars: 128,
  maxDisplayChars: 256,
  maxResponseBytes: 2 * 1024 * 1024,
  maxMetadataKeys: 16,
  maxMetadataValueChars: 1024,
  maxMetadataDepth: 2,
};

function truncateStr(s, max) {
  return typeof s === "string" ? s.slice(0, max) : undefined;
}

function sanitizeMetadata(value, depth = 0) {
  if (depth > RUNTIME_MODEL_LIMITS.maxMetadataDepth) return "[truncated]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return redactSecretsFromText(value).slice(0, RUNTIME_MODEL_LIMITS.maxMetadataValueChars);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((v) => sanitizeMetadata(v, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, RUNTIME_MODEL_LIMITS.maxMetadataKeys)) {
      const key = String(k).slice(0, 64);
      // Secret-bearing keys: never retain the value (structured or not).
      if (/api[_-]?key|token|password|secret|cookie|private[_-]?key|credential|authorization/i.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      // Never let provider metadata inject instructions: keep as data, drop
      // instruction-like keys from structured surface (still counted).
      if (/^(system|instruction|prompt|policy|permission|workspace|task)/i.test(key)) {
        out[key] = "[withheld:metadata]";
        continue;
      }
      out[key] = sanitizeMetadata(v, depth + 1);
    }
    return out;
  }
  return "[withheld]";
}

/**
 * Normalize one /v1/models entry into RuntimeModel. Untrusted input → bounded,
 * redacted, instruction-neutral output. Returns null when unusable.
 */
export function normalizeRuntimeModel(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = typeof entry.id === "string" ? entry.id.trim().slice(0, RUNTIME_MODEL_LIMITS.maxIdChars) : "";
  if (!id || /[\0\n\r]/.test(id)) return null;
  const provider =
    truncateStr(typeof entry.owned_by === "string" ? entry.owned_by : entry.provider, RUNTIME_MODEL_LIMITS.maxProviderChars);
  const displayName = truncateStr(
    typeof entry.display_name === "string" ? entry.display_name : typeof entry.name === "string" ? entry.name : id,
    RUNTIME_MODEL_LIMITS.maxDisplayChars,
  );
  return {
    id,
    provider,
    displayName,
    available: true,
    metadata: entry.metadata && typeof entry.metadata === "object"
      ? sanitizeMetadata(entry.metadata)
      : undefined,
  };
}

/**
 * Validate + normalize a /v1/models response body (already parsed JSON).
 * Fails closed on wrong shape; bounds count/size; never throws secrets.
 */
export function normalizeModelsResponse(json) {
  if (!json || typeof json !== "object") throw new Error("Invalid models response");
  const data = Array.isArray(json.data) ? json.data : null;
  if (!data) throw new Error("Invalid models response: missing data[]");
  const models = [];
  for (const entry of data.slice(0, RUNTIME_MODEL_LIMITS.maxModels)) {
    const m = normalizeRuntimeModel(entry);
    if (m) models.push(m);
  }
  return { models, count: models.length, truncated: data.length > models.length };
}

export function isValidPort(n) {
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}
