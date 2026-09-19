/**
 * Phase 8 — Shared action core (single source of truth).
 * Plain JS so the renderer (via TS facades) and Electron (actionStore.mjs,
 * toolStore.mjs) share action identity, approval binding, target validation,
 * and idempotency with zero divergence. Mirrors the toolCore.mjs precedent.
 *
 * Deterministic only. No network, no LLM, no secrets, no Node APIs here.
 *
 * Model: PROPOSE → VALIDATE → POLICY → CONFIRM (bound) → EXECUTE → VERIFY → AUDIT.
 * The model never grants itself permission; confirmation enters only through
 * trusted UI/application state and is bound to the exact action fingerprint.
 */

/* ---------------- action tool inventory ---------------- */

export const ACTION_TOOL_IDS = [
  "gmail.create_draft",
  "gmail.send",
  "calendar.create_event",
  "slack.send_message",
  "github.create_issue",
  "github.create_pull_request",
  "notion.create_page",
];

export const ACTION_CAPABILITIES = [
  "gmail.draft",
  "gmail.send",
  "calendar.create",
  "slack.send",
  "github.issue",
  "github.pr",
  "notion.create",
];

/** High-risk actions: fail closed, never auto-approved, never MCP-exposed. */
export const HIGH_RISK_ACTION_IDS = ["gmail.send", "github.create_pull_request"];

export const ACTION_APPROVAL_TTL_MS = 15 * 60 * 1000;
export const ACTION_IDEMPOTENCY_RE_SRC = "^[a-zA-Z0-9_-]{8,128}$";

export function isActionTool(toolId) {
  return ACTION_TOOL_IDS.includes(toolId);
}

export function isHighRiskAction(toolId) {
  return HIGH_RISK_ACTION_IDS.includes(toolId);
}

/* ---------------- canonicalization + fingerprint ---------------- */

/**
 * Canonical JSON: sorted keys, recursive, no whitespace. Two inputs with the
 * same material meaning produce the same string; any material change produces
 * a different string (which invalidates a prior confirmation).
 */
export function canonicalizeInput(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalizeInput).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeInput(value[k])}`).join(",")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  return "null";
}

export function fnv1aHex(input) {
  let h = 0x811c9dc5;
  const s = String(input ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (`0000000${(h >>> 0).toString(16)}`).slice(-8);
}

/**
 * Action fingerprint binds: tool + project + canonical MATERIAL input.
 * Confirmation approval records this fingerprint; execution re-computes it
 * and refuses to run when it differs (parameter substitution defense).
 * `idempotencyKey` is transport, not material, and is excluded so retries
 * with a fresh key still match the approval.
 */
export function actionFingerprint(toolId, projectId, input) {
  const { idempotencyKey, ...material } = (input ?? {});
  void idempotencyKey;
  const canon = canonicalizeInput(material);
  return `afp_${fnv1aHex(`${toolId}|${projectId ?? ""}|${canon}`)}`;
}

export function newActionId(prefix = "act") {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff).toString(36)}`.slice(0, 64);
}

export function newIdempotencyKey() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "idem_";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function isValidIdempotencyKey(key) {
  return typeof key === "string" && new RegExp(ACTION_IDEMPOTENCY_RE_SRC).test(key);
}

/* ---------------- approval lifecycle (pure checks) ---------------- */

export const APPROVAL_STATUSES = ["proposed", "approved", "rejected", "expired", "consumed"];

export function approvalExpired(approval, now = Date.now()) {
  const created = Date.parse(approval?.createdAt ?? "");
  if (!Number.isFinite(created)) return true;
  return now - created > ACTION_APPROVAL_TTL_MS;
}

/**
 * Verify a stored approval authorizes an execution attempt.
 * Returns { ok:true } or { ok:false, reason }.
 * Checks: status, expiry, tool, project, fingerprint, run binding.
 */
export function verifyApprovalForExecution(approval, attempt) {
  if (!approval || typeof approval !== "object") return { ok: false, reason: "unknown approval" };
  if (approval.status !== "approved") return { ok: false, reason: `approval is ${approval.status ?? "missing"}` };
  if (approvalExpired(approval, attempt?.now)) return { ok: false, reason: "approval expired" };
  if (approval.toolId !== attempt.toolId) return { ok: false, reason: "tool mismatch" };
  if ((approval.projectId ?? null) !== (attempt.projectId ?? null)) {
    return { ok: false, reason: "project mismatch" };
  }
  const fp = actionFingerprint(attempt.toolId, attempt.projectId, attempt.input);
  if (fp !== approval.fingerprint) return { ok: false, reason: "action changed since approval" };
  if (approval.runId && attempt.runId && approval.runId !== attempt.runId) {
    return { ok: false, reason: "run mismatch" };
  }
  return { ok: true };
}

/* ---------------- target-scope validation ---------------- */

const EMAIL_RE = /^[^\s@<>(),;:\\"[\]]+@[^\s@<>(),;:\\"[\]]+\.[^\s@<>(),;:\\"[\]]+$/;
const REPO_RE = /^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/;
const SLACK_CHANNEL_RE = /^[#]?[a-zA-Z0-9_.-]{1,80}$|^[CG][A-Z0-9]{8,}$/;
const CALENDAR_ID_RE = /^[a-zA-Z0-9_@.\-/#+]{1,256}$/;
const GITHUB_BRANCH_RE = /^[a-zA-Z0-9_./-]{1,255}$/;

function checkEmailList(value, field, max) {
  if (!Array.isArray(value) || value.length === 0) return `${field} requires at least one recipient`;
  if (value.length > max) return `${field} exceeds ${max} recipients`;
  for (const e of value) {
    if (typeof e !== "string" || e.length > 320 || !EMAIL_RE.test(e.trim())) {
      return `${field} contains an invalid email address`;
    }
  }
  return null;
}

/**
 * Validate the external target scope of a write action BEFORE policy/confirm.
 * Returns null when valid, or a short safe error string (no payload echo).
 */
export function validateActionTarget(toolId, input) {
  const v = input ?? {};
  switch (toolId) {
    case "gmail.create_draft":
    case "gmail.send": {
      const err = checkEmailList(v.to, "to", 20);
      if (err) return err;
      if (v.cc !== undefined) {
        const e2 = checkEmailList(v.cc, "cc", 20);
        if (e2) return e2;
      }
      if (v.bcc !== undefined) {
        const e3 = checkEmailList(v.bcc, "bcc", 20);
        if (e3) return e3;
      }
      if (!v.subject || typeof v.subject !== "string") return "subject is required";
      if (!v.body || typeof v.body !== "string") return "body is required";
      return null;
    }
    case "calendar.create_event": {
      if (!v.title || typeof v.title !== "string") return "title is required";
      if (!v.start || typeof v.start !== "string" || Number.isNaN(Date.parse(v.start))) {
        return "valid start datetime is required";
      }
      if (!v.end || typeof v.end !== "string" || Number.isNaN(Date.parse(v.end))) {
        return "valid end datetime is required";
      }
      if (Date.parse(v.end) <= Date.parse(v.start)) return "end must be after start";
      if (v.calendarId !== undefined && (typeof v.calendarId !== "string" || !CALENDAR_ID_RE.test(v.calendarId))) {
        return "invalid calendar";
      }
      if (v.attendees !== undefined) {
        const e = checkEmailList(v.attendees, "attendees", 50);
        if (e) return e;
      }
      return null;
    }
    case "slack.send_message": {
      if (typeof v.channel !== "string" || !SLACK_CHANNEL_RE.test(v.channel.trim())) {
        return "invalid channel";
      }
      if (!v.text || typeof v.text !== "string") return "text is required";
      return null;
    }
    case "github.create_issue": {
      if (typeof v.repository !== "string" || !REPO_RE.test(v.repository.trim())) {
        return "invalid repository (owner/name required)";
      }
      if (!v.title || typeof v.title !== "string") return "title is required";
      return null;
    }
    case "github.create_pull_request": {
      if (typeof v.repository !== "string" || !REPO_RE.test(v.repository.trim())) {
        return "invalid repository (owner/name required)";
      }
      if (typeof v.head !== "string" || !GITHUB_BRANCH_RE.test(v.head.trim())) return "invalid head branch";
      if (typeof v.base !== "string" || !GITHUB_BRANCH_RE.test(v.base.trim())) return "invalid base branch";
      if (v.head.trim() === v.base.trim()) return "head and base must differ";
      return null;
    }
    case "notion.create_page": {
      if (v.parentPageId === undefined && v.parentDatabaseId === undefined) {
        return "parent page or database is required";
      }
      if (!v.title || typeof v.title !== "string") return "title is required";
      return null;
    }
    default:
      return "unknown action";
  }
}

/* ---------------- safe preview (from actual tool arguments) ---------------- */

/**
 * Build an approval preview strictly from validated tool arguments.
 * Never fabricates: every line traces to an input field.
 */
export function buildActionPreview(toolId, input) {
  const v = input ?? {};
  const lines = [];
  const push = (label, value, max = 500) => {
    if (value === undefined || value === null || value === "") return;
    const s = Array.isArray(value) ? value.map(String).join(", ") : String(value);
    lines.push({ label, value: s.slice(0, max) });
  };
  switch (toolId) {
    case "gmail.create_draft":
      push("To", v.to);
      push("Cc", v.cc);
      push("Subject", v.subject, 300);
      push("Message", v.body, 2000);
      push("Provider", "Gmail");
      break;
    case "gmail.send":
      push("To", v.to);
      push("Cc", v.cc);
      push("Subject", v.subject, 300);
      push("Message", v.body, 2000);
      push("Provider", "Gmail");
      break;
    case "calendar.create_event":
      push("Calendar", v.calendarId ?? "primary");
      push("Title", v.title, 300);
      push("Starts", v.start, 64);
      push("Ends", v.end, 64);
      push("Attendees", v.attendees);
      push("Description", v.description, 1000);
      push("Provider", "Google Calendar");
      break;
    case "slack.send_message":
      push("Channel", v.channel, 80);
      push("Message", v.text, 2000);
      push("Provider", "Slack");
      break;
    case "github.create_issue":
      push("Repository", v.repository, 120);
      push("Title", v.title, 300);
      push("Body", v.body, 2000);
      push("Labels", v.labels);
      push("Provider", "GitHub");
      break;
    case "github.create_pull_request":
      push("Repository", v.repository, 120);
      push("Title", v.title, 300);
      push("Head", v.head, 120);
      push("Base", v.base, 120);
      push("Body", v.body, 2000);
      push("Provider", "GitHub");
      break;
    case "notion.create_page":
      push("Parent page", v.parentPageId, 64);
      push("Parent database", v.parentDatabaseId, 64);
      push("Title", v.title, 300);
      push("Content", v.content, 2000);
      push("Provider", "Notion");
      break;
    default:
      push("Tool", toolId, 128);
  }
  return lines;
}
