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
  // Fallback label for engine-native actions with no Openbentt equivalent.
  // Policy is DENY by default (evaluateCapabilityPolicy) — the engine still
  // pauses and the user still decides per request; nothing is auto-allowed.
  "UNKNOWN",
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
  "agent.permission.replied",
  "agent.question.requested",
  "agent.question.answered",
  "agent.question.rejected",
  "agent.tool.started",
  "agent.tool.progress",
  "agent.tool.output",
  "agent.tool.completed",
  "agent.tool.failed",
  "agent.step.started",
  "agent.step.completed",
  "agent.step.failed",
  "agent.file.changed",
  "agent.diff.updated",
  "agent.command.requested",
  "agent.command.output",
  "agent.terminal.started",
  "agent.terminal.output",
  "agent.terminal.completed",
  "agent.message.delta",
  "agent.message.completed",
  "agent.reasoning.delta",
  "agent.todo.updated",
  "agent.context.updated",
  "agent.session.status",
  "agent.session.idle",
  "agent.subagent.started",
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
  /\b(summarize|summarise).{0,30}(pdf|document|doc|paper|report)/i,
  /\b(pdf|docx)\b/i,
];

/**
 * Document-edit intent: the user wants the PROJECT DOCUMENT changed
 * (rewrite a chapter, fix/add citations, update bibliography). This must
 * reach OpenCode (CODE) — NOT the read-only research/chat path — so edits
 * can be written, compiled, and verified. Pure "find/survey" requests have
 * no edit verb and still route RESEARCH.
 */
const DOC_EDIT_SIGNALS = [
  /\b(add|insert|update|edit|rewrite|revise|fix|delete|remove)\b.{0,40}\b(citation|cite|citations|reference|references|bibliography|chapter|section|thesis|latex|document)\b/i,
  /\b(citation|cite|citations|reference|references|bibliography)\b.{0,20}\b(in|to|for|of)\b.{0,30}\b(chapter|section|thesis|paper|document|main\.tex)\b/i,
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
 * Creation intent: a build verb plus a software-artifact noun in the same
 * request (e.g. "create an app", "add a login page", "write a script",
 * "make me a dashboard"). Both halves are required so plain chat such as
 * "write me a poem" or "make it better" never routes to execution.
 */
const CODE_CREATE_VERBS = /\b(create|add|write|make|build|implement|scaffold|generate)\b/i;
const CODE_ARTIFACTS = /\b(apps?|applications?|pages?|components?|dashboards?|features?|endpoints?|apis?|websites?|sites?|landing.?pages?|services?|tools?|scripts?|functions?|files?|tests?|projects?|programs?|software|uis?|buttons?|forms?|logins?|auth|databases?|schemas?|migrations?)\b/i;

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
  if (DOC_EDIT_SIGNALS.some((r) => r.test(t))) return "CODE";
  if (RESEARCH_SIGNALS.some((r) => r.test(t))) return "RESEARCH";
  if (SYSTEM_SIGNALS.some((r) => r.test(t))) return "SYSTEM_TASK";
  if (CODE_SIGNALS.some((r) => r.test(t))) return "CODE";
  if (CODE_CREATE_VERBS.test(t) && CODE_ARTIFACTS.test(t)) return "CODE";
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

/**
 * Normalize one engine tool part ({ tool, callID, state }) into canonical
 * events. The same part id is re-emitted as pending → running → completed;
 * each emission is a distinct server event with a distinct evt id, so every
 * transition becomes exactly one canonical event.
 *
 * status mapping: pending → tool.started (+terminal.started for bash);
 * running → tool.progress (+terminal heartbeat stays implicit); completed →
 * tool.completed (+terminal.completed for bash, +file.changed for
 * write/edit); error → tool.failed (+terminal.completed nonzero for bash).
 */
function toolPartEvents(mk, part, messageId, partId) {
  const tool = String(part.tool ?? "tool").slice(0, 120);
  const callId = String(part.callID ?? part.callId ?? "").slice(0, 120);
  const st = part.state && typeof part.state === "object" ? part.state : {};
  const status = typeof st.status === "string" ? st.status : "pending";
  const input = st.input && typeof st.input === "object" ? st.input : {};
  const title = typeof part.title === "string" ? part.title.slice(0, 300) : typeof st.title === "string" ? st.title.slice(0, 300) : undefined;
  const time = st.time && typeof st.time === "object" ? st.time : {};
  const durationMs =
    Number.isFinite(Number(time.end)) && Number.isFinite(Number(time.start))
      ? Math.max(0, Number(time.end) - Number(time.start))
      : undefined;
  const base = { tool, callId, messageId, partId, input, title, durationMs };
  const isBash = tool === "bash";
  const command = isBash && typeof input.command === "string" ? input.command.slice(0, 2000) : undefined;
  const workdir = typeof input.workdir === "string" ? input.workdir.slice(0, 1024) : undefined;

  if (status === "pending") {
    const out = [mk("agent.tool.started", { ...base, message: title ?? `Starting ${tool}.` }, "tool")];
    if (isBash && command) out.push(mk("agent.terminal.started", { callId, command, cwd: workdir }, "term"));
    return out;
  }
  if (status === "running") {
    const runningOut = typeof st?.metadata?.output === "string" ? st.metadata.output : "";
    return [mk("agent.tool.progress", {
      ...base,
      message: runningOut ? runningOut.slice(-2000) : (title ?? `Running ${tool}…`),
    }, "tool")];
  }
  if (status === "completed" || status === "success") {
    const output =
      (typeof st.output === "string" && st.output ? st.output : null) ??
      (typeof st?.metadata?.output === "string" && st.metadata.output ? st.metadata.output : null) ??
      "[completed]";
    const exit = Number(st?.metadata?.exit);
    const out = [mk("agent.tool.completed", {
      ...base,
      output: String(output).slice(0, 8000),
      exitCode: Number.isFinite(exit) ? exit : undefined,
    }, "tool")];
    if (isBash) {
      out.push(mk("agent.terminal.completed", {
        callId,
        command,
        cwd: workdir,
        exitCode: Number.isFinite(exit) ? exit : 0,
        output: String(output).slice(0, 8000),
        durationMs,
      }, "term"));
    }
    const filePath =
      (tool === "write" || tool === "edit") && typeof input.filePath === "string" && input.filePath
        ? input.filePath.slice(0, 1024)
        : null;
    if (filePath) out.push(mk("agent.file.changed", { file: filePath, change: tool === "write" ? "written" : "edited", callId }, "file"));
    return out;
  }
  const errMsg =
    (typeof st.error === "string" && st.error ? st.error : null) ??
    (typeof st?.metadata?.error === "string" ? st.metadata.error : null) ??
    (typeof st.output === "string" && st.output ? st.output : null) ??
    "Tool failed.";
  const out = [mk("agent.tool.failed", { ...base, message: String(errMsg).slice(0, 2000) }, "tool")];
  if (isBash) {
    out.push(mk("agent.terminal.completed", {
      callId, command, cwd: workdir, exitCode: -1,
      output: String(errMsg).slice(0, 8000), durationMs,
    }, "term"));
  }
  return out;
}

/* ---------------- permission request ---------------- */export function buildPermissionRequest({ taskId, sessionId, capability, risk, description, workspace, target, preview }) {
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

/**
 * Map an OpenCode server permission event (permission.asked /
 * permission.v2.asked) to an Openbentt permission request shape.
 * Pure + fail-closed: unknown shapes throw, never fabricate approvals.
 * Returns { serverRequestId, sessionID, kind, action, resources, description }.
 */
export function describeServerPermission(properties) {
  if (!properties || typeof properties !== "object") throw new Error("Invalid permission event");
  const id = properties.id;
  const sessionID = properties.sessionID;
  if (typeof id !== "string" || !/^per/.test(id)) throw new Error("Invalid permission id");
  if (typeof sessionID !== "string" || !sessionID) throw new Error("Invalid session id");
  if (typeof properties.action === "string" && Array.isArray(properties.resources)) {
    // v2 shape: { action, resources[], save?, metadata?, source? }
    return {
      serverRequestId: id,
      sessionID,
      kind: "v2",
      action: String(properties.action).slice(0, 200),
      resources: properties.resources.map((r) => String(r).slice(0, 1024)).slice(0, 32),
      save: Array.isArray(properties.save) ? properties.save.map((s) => String(s).slice(0, 200)).slice(0, 8) : [],
      metadata: properties.metadata && typeof properties.metadata === "object" ? properties.metadata : {},
      description: `${properties.action}: ${properties.resources.slice(0, 4).join(", ")}`,
    };
  }
  if (typeof properties.permission === "string" && Array.isArray(properties.patterns)) {
    // v1 shape: { permission, patterns[], metadata?, always?, tool? }
    return {
      serverRequestId: id,
      sessionID,
      kind: "v1",
      action: String(properties.permission).slice(0, 200),
      resources: properties.patterns.map((r) => String(r).slice(0, 1024)).slice(0, 32),
      save: Array.isArray(properties.always) ? properties.always.map((s) => String(s).slice(0, 200)).slice(0, 8) : [],
      metadata: properties.metadata && typeof properties.metadata === "object" ? properties.metadata : {},
      tool: properties.tool && typeof properties.tool === "object" ? properties.tool : undefined,
      description: `${properties.permission}: ${properties.patterns.slice(0, 4).join(", ")}`,
    };
  }
  throw new Error("Unrecognized permission event shape");
}

/**
 * Map an OpenCode server question event (question.asked /
 * question.v2.asked) to an Openbentt question shape. Pure + fail-closed.
 * Returns { serverRequestId, sessionID, questions: [{ header, question, options[], multi? }] }.
 */
export function describeServerQuestion(properties) {
  if (!properties || typeof properties !== "object") throw new Error("Invalid question event");
  const id = properties.id;
  const sessionID = properties.sessionID;
  if (typeof id !== "string" || !/^que/.test(id)) throw new Error("Invalid question id");
  if (typeof sessionID !== "string" || !sessionID) throw new Error("Invalid session id");
  if (!Array.isArray(properties.questions) || !properties.questions.length) {
    throw new Error("Question event has no questions");
  }
  const questions = properties.questions.slice(0, 8).map((q) => {
    if (!q || typeof q !== "object") throw new Error("Invalid question entry");
    const options = Array.isArray(q.options)
      ? q.options.slice(0, 12).map((o) => ({
        label: String(o?.label ?? o ?? "").slice(0, 200),
        description: typeof o?.description === "string" ? o.description.slice(0, 500) : undefined,
      })).filter((o) => o.label)
      : [];
    return {
      header: typeof q.header === "string" ? q.header.slice(0, 200) : "Question",
      question: typeof q.question === "string" ? q.question.slice(0, 2000) : "",
      options,
      multi: q.multi === true,
    };
  });
  return { serverRequestId: id, sessionID, questions };
}

/**
 * Validate user answers for a question reply. Each answer corresponds to one
 * question in order; each answer is an array of selected option labels.
 * Pure + fail-closed.
 */
export function validateQuestionAnswers(questions, answers) {
  if (!Array.isArray(questions) || !Array.isArray(answers)) throw new Error("Invalid answers");
  if (answers.length !== questions.length) throw new Error("Answer count must match question count");
  return answers.map((ans, i) => {
    const q = questions[i];
    const labels = new Set((q.options ?? []).map((o) => o.label));
    const arr = Array.isArray(ans) ? ans : [ans];
    if (!arr.length) throw new Error(`Question ${i + 1} needs at least one answer`);
    if (!q.multi && arr.length > 1) throw new Error(`Question ${i + 1} accepts a single answer`);
    for (const a of arr) {
      if (typeof a !== "string" || !labels.has(a)) throw new Error(`Invalid option for question ${i + 1}`);
    }
    return arr.slice(0, 12);
  });
}

/**
 * Normalize one OpenCode server SSE event ({ id, type, properties }) into a
 * list of canonical Openbentt agent events bound to a task. Pure:
 * no I/O, no secrets retained beyond redacted payloads. Unknown server types
 * return [] (ignored) — never fabricated, never thrown.
 *
 * Server `id` (evt_*) is preserved as the canonical eventId so reconnect
 * resync can deduplicate exactly.
 */
export function normalizeServerEvents(serverEvent, binding = {}) {
  const taskId = typeof binding.taskId === "string" ? binding.taskId : "unknown";
  const sessionId =
    typeof binding.sessionId === "string"
      ? binding.sessionId
      : typeof serverEvent?.properties?.sessionID === "string"
        ? serverEvent.properties.sessionID
        : "unknown";
  const at = (ms) => {
    const n = Number(ms);
    return Number.isFinite(n) ? new Date(n).toISOString() : new Date().toISOString();
  };
  const mk = (type, payload, tag) => {
    const base = normalizeOpenCodeEvent({ type, payload }, { taskId, sessionId });
    // Server event ids (evt_*) are unique per server event — use them verbatim
    // so reconnect resync deduplicates exactly. When ONE server event yields
    // SEVERAL canonical events (tool + terminal + file), each takes a stable
    // `#tag` discriminator so dedupe keeps all of them, on every reconnect.
    // IDs are capped deterministically in pushCanonicalEvents (taskStore
    // truncates at 64 chars).
    const serverId = typeof serverEvent?.id === "string" ? serverEvent.id : null;
    if (serverId) base.eventId = tag ? `${serverId}#${tag}` : serverId;
    if (serverEvent?.properties?.timestamp !== undefined) base.timestamp = at(serverEvent.properties.timestamp);
    return base;
  };
  if (!serverEvent || typeof serverEvent.type !== "string") return [];
  const p = serverEvent.properties && typeof serverEvent.properties === "object" ? serverEvent.properties : {};
  const ts = p.timestamp;
  void ts;
  switch (serverEvent.type) {
    case "server.connected":
      return [mk("agent.status", { message: "Connected to the OpenCode engine.", connection: "live" })];
    case "session.created":
    case "session.updated":
      return [];
    case "session.status": {
      const st = p.status && typeof p.status === "object" ? p.status.type : p.status;
      if (st === "busy") return [mk("agent.session.status", { status: "busy", message: "OpenCode is working." })];
      if (st === "idle") return [mk("agent.session.idle", { message: "OpenCode finished this turn." })];
      if (st === "retry") return [mk("agent.session.status", { status: "retry", message: String(p.status?.message ?? "Retrying.").slice(0, 500) })];
      return [];
    }
    case "session.idle":
      return [mk("agent.session.idle", { message: "OpenCode is idle." })];
    case "session.error": {
      const err = p.error && typeof p.error === "object" ? p.error : {};
      const name = typeof err.name === "string" ? err.name : typeof err.type === "string" ? err.type : "error";
      const msg = typeof err.message === "string" ? err.message : typeof err.data?.message === "string" ? err.data.message : "The engine reported an error.";
      return [mk("agent.error", { message: `${name}: ${msg}`.slice(0, 2000), code: String(name).slice(0, 120) })];
    }
    case "session.next.prompted":
      return [mk("agent.status", { message: "Prompt accepted — OpenCode started working." })];
    case "session.next.step.started":
      return [mk("agent.step.started", { message: "Step started." })];
    case "session.next.step.ended":
      return [mk("agent.step.completed", { message: "Step finished." })];
    case "session.next.step.failed":
      return [mk("agent.step.failed", { message: "Step failed." })];
    case "session.next.text.started":
      return [];
    case "session.next.text.delta":
      return typeof p.delta === "string" && p.delta
        ? [mk("agent.message.delta", { delta: p.delta.slice(0, 8000), messageId: String(p.assistantMessageID ?? "").slice(0, 120) })]
        : [];
    case "session.next.text.ended":
      return [mk("agent.message.completed", { messageId: String(p.assistantMessageID ?? "").slice(0, 120) })];
    case "session.next.reasoning.delta":
      return typeof p.delta === "string" && p.delta
        ? [mk("agent.reasoning.delta", { delta: p.delta.slice(0, 8000) })]
        : [];
    case "session.next.reasoning.started":
    case "session.next.reasoning.ended":
      return [];
    case "session.next.tool.called":
      return [mk("agent.tool.started", {
        tool: String(p.tool ?? "tool").slice(0, 120),
        callId: String(p.callID ?? "").slice(0, 120),
        input: p.input && typeof p.input === "object" ? p.input : {},
        messageId: String(p.assistantMessageID ?? "").slice(0, 120),
      })];
    case "session.next.tool.input.delta":
    case "session.next.tool.input.started":
    case "session.next.tool.input.ended":
      return [];
    case "session.next.tool.progress":
      return [mk("agent.tool.progress", {
        callId: String(p.callID ?? "").slice(0, 120),
        message: typeof p.message === "string" ? p.message.slice(0, 2000) : typeof p.output === "string" ? p.output.slice(0, 2000) : "Working…",
      })];
    case "session.next.tool.success": {
      const content = Array.isArray(p.content) ? p.content : [];
      const text = content.map((c) => (c && typeof c.text === "string" ? c.text : "")).filter(Boolean).join("\n").slice(0, 8000);
      return [mk("agent.tool.completed", {
        callId: String(p.callID ?? "").slice(0, 120),
        output: text || "[completed]",
        outputPaths: Array.isArray(p.outputPaths) ? p.outputPaths.map((x) => String(x).slice(0, 1024)).slice(0, 32) : [],
      })];
    }
    case "session.next.tool.failed": {
      const msg = typeof p.error === "string" ? p.error : p.error?.message ?? "Tool failed.";
      return [mk("agent.tool.failed", { callId: String(p.callID ?? "").slice(0, 120), message: String(msg).slice(0, 2000) })];
    }
    case "session.next.shell.started":
      return [mk("agent.terminal.started", { command: String(p.command ?? "").slice(0, 2000) })];
    case "session.next.shell.ended": {
      const code = Number.isFinite(Number(p.exit)) ? Number(p.exit) : Number.isFinite(Number(p.exitCode)) ? Number(p.exitCode) : undefined;
      return [mk("agent.terminal.completed", { command: String(p.command ?? "").slice(0, 2000), exitCode: code ?? -1, output: typeof p.output === "string" ? p.output.slice(0, 8000) : undefined })];
    }
    case "session.next.shell.output":
      return typeof p.output === "string" && p.output
        ? [mk("agent.terminal.output", { output: p.output.slice(0, 8000) })]
        : [];
    case "session.next.compaction.started":
    case "session.next.compaction.delta":
    case "session.next.compaction.ended":
      return [mk("agent.status", { message: "Compacting session context." })];
    case "session.next.context.updated": {
      const u = p.usage ?? p.context ?? {};
      return [mk("agent.context.updated", {
        input: Number(u.input ?? u.inputTokens ?? 0) || 0,
        output: Number(u.output ?? u.outputTokens ?? 0) || 0,
        reasoning: Number(u.reasoning ?? 0) || 0,
        cacheRead: Number(u?.cache?.read ?? 0) || 0,
        cacheWrite: Number(u?.cache?.write ?? 0) || 0,
        cost: typeof p.cost === "number" ? p.cost : undefined,
      })];
    }
    case "session.next.synthetic":
      return typeof p.message === "string" && p.message
        ? [mk("agent.status", { message: p.message.slice(0, 2000) })]
        : [];
    case "session.next.agent.switched":
      return [mk("agent.subagent.started", { agent: String(p.agent ?? p.name ?? "subagent").slice(0, 200) })];
    case "session.next.model.switched":
      return [mk("agent.status", { message: `Model: ${String(p.model ?? p.modelID ?? "?").slice(0, 200)}` })];
    case "session.next.retried":
      return [mk("agent.status", { message: "Retrying." })];
    case "session.next.revert.staged":
    case "session.next.revert.committed":
    case "session.next.revert.cleared":
      return [];
    case "permission.asked":
    case "permission.v2.asked":
      // Bridged with approval metadata by opencodeServer.mjs (needs
      // actionStore) — marker only; the server module emits the full
      // agent.permission.requested event itself.
      return [{ __permissionMarker: true, properties: p, serverId: serverEvent.id, sessionId }];
    case "permission.replied":
    case "permission.v2.replied":
      return [mk("agent.permission.replied", { requestId: String(p.requestID ?? p.id ?? "").slice(0, 120) })];
    case "question.asked":
    case "question.v2.asked":
      return [{ __questionMarker: true, properties: p, serverId: serverEvent.id, sessionId }];
    case "question.replied":
    case "question.v2.replied":
      return [mk("agent.question.answered", { requestId: String(p.requestID ?? p.id ?? "").slice(0, 120) })];
    case "question.rejected":
    case "question.v2.rejected":
      return [mk("agent.question.rejected", { requestId: String(p.requestID ?? p.id ?? "").slice(0, 120) })];
    case "todo.updated":
      return [mk("agent.todo.updated", { todos: Array.isArray(p.todos) ? p.todos.slice(0, 50) : [] })];
    case "session.diff": {
      const diff = Array.isArray(p.diff) ? p.diff : [];
      return [mk("agent.diff.updated", {
        files: diff.slice(0, 64).map((d) => ({
          file: String(d?.file ?? d?.path ?? "").slice(0, 1024),
          status: String(d?.status ?? "modified").slice(0, 32),
          additions: Number(d?.additions ?? 0) || 0,
          deletions: Number(d?.deletions ?? 0) || 0,
          patch: typeof d?.patch === "string" ? d.patch.slice(0, 20000) : undefined,
        })),
      })];
    }
    case "file.edited":
      return [mk("agent.file.changed", { file: String(p.file ?? p.path ?? "").slice(0, 1024), change: "edited" })];
    case "file.watcher.updated":
      return [];
    case "message.updated": {
      const info = p.info && typeof p.info === "object" ? p.info : {};
      const role = info.role;
      if (role === "assistant") {
        const tokens = info.tokens && typeof info.tokens === "object" ? info.tokens : {};
        const out = [mk("agent.message.completed", {
          messageId: String(info.id ?? "").slice(0, 120),
          model: typeof info.modelID === "string" ? info.modelID.slice(0, 200) : undefined,
          provider: typeof info.providerID === "string" ? info.providerID.slice(0, 120) : undefined,
        }, "msg")];
        const input = Number(tokens.input ?? 0) || 0;
        const output = Number(tokens.output ?? 0) || 0;
        if (input || output) {
          out.push(mk("agent.context.updated", {
            input,
            output,
            reasoning: Number(tokens.reasoning ?? 0) || 0,
            cacheRead: Number(tokens?.cache?.read ?? 0) || 0,
            cacheWrite: Number(tokens?.cache?.write ?? 0) || 0,
            cost: typeof info.cost === "number" ? info.cost : undefined,
          }, "ctx"));
        }
        return out;
      }
      // User echoes carry no new information (the prompt is already in chat).
      return [];
    }
    case "message.part.updated": {
      const part = p.part && typeof p.part === "object" ? p.part : null;
      if (!part || typeof part.type !== "string") return [];
      const messageId = String(part.messageID ?? p.messageID ?? "").slice(0, 120);
      const partId = String(part.id ?? part.partID ?? "").slice(0, 120);
      // User-message echoes (our own prompt coming back) are dropped — the
      // caller passes binding.messageRole; unknown defaults to visible.
      if (binding.messageRole === "user" && (part.type === "text" || part.type === "reasoning")) return [];
      switch (part.type) {
        case "text": {
          const text = typeof part.text === "string" ? part.text : "";
          if (!text) return [];
          return [mk("agent.message.completed", { messageId, partId, text: text.slice(0, 8000) }, "text")];
        }
        case "reasoning": {
          const text = typeof part.text === "string" ? part.text : "";
          if (!text) return [];
          return [mk("agent.reasoning.delta", { messageId, partId, delta: text.slice(0, 8000) }, "reason")];
        }
        case "tool":
          return toolPartEvents(mk, part, messageId, partId);
        case "step-start":
          return [mk("agent.step.started", { messageId, partId }, "step")];
        case "step-finish": {
          const tokens = part.tokens && typeof part.tokens === "object" ? part.tokens : {};
          const out = [mk("agent.step.completed", {
            messageId,
            partId,
            reason: typeof part.reason === "string" ? part.reason.slice(0, 120) : undefined,
          }, "step")];
          const input = Number(tokens.input ?? 0) || 0;
          const output = Number(tokens.output ?? 0) || 0;
          if (input || output) {
            out.push(mk("agent.context.updated", {
              input,
              output,
              reasoning: Number(tokens.reasoning ?? 0) || 0,
              cacheRead: Number(tokens?.cache?.read ?? 0) || 0,
              cacheWrite: Number(tokens?.cache?.write ?? 0) || 0,
              cost: typeof part.cost === "number" ? part.cost : undefined,
            }, "ctx"));
          }
          return out;
        }
        default:
          return [];
      }
    }
    case "message.part.delta": {
      if (typeof p.delta !== "string" || !p.delta) return [];
      const messageId = String(p.messageID ?? "").slice(0, 120);
      const partId = String(p.partID ?? "").slice(0, 120);
      if (binding.messageRole === "user") return [];
      if (p.field === "reasoning") {
        return [mk("agent.reasoning.delta", { messageId, partId, delta: p.delta.slice(0, 8000) })];
      }
      return [mk("agent.message.delta", { messageId, partId, delta: p.delta.slice(0, 8000) })];
    }
    case "message.part.removed":
    case "message.removed":
      return [];
    case "pty.created":
      return [mk("agent.terminal.started", { terminalId: String(p.id ?? p.ptyID ?? "").slice(0, 120) })];
    case "pty.updated":
      return typeof p.output === "string" && p.output
        ? [mk("agent.terminal.output", { terminalId: String(p.id ?? p.ptyID ?? "").slice(0, 120), output: p.output.slice(0, 8000) })]
        : [];
    case "pty.exited":
    case "pty.deleted":
      return [mk("agent.terminal.completed", { terminalId: String(p.id ?? p.ptyID ?? "").slice(0, 120), exitCode: Number(p.exit ?? p.code ?? -1) || 0 })];
    default:
      return [];
  }
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
