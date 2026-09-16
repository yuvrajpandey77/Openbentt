/**
 * Minimal structured logging boundary for the Electron main process (Phase 1).
 * Mirrors src/lib/log.ts: levels, timestamps, component tags, secret redaction.
 * Debug output is gated behind OPENBENTT_VERBOSE=1; info and above always emit.
 * Logging must never throw and must never emit secret values.
 */

const SECRET_VALUE_RE =
  /(sk-(or-v1-|ant-|proj-)?[A-Za-z0-9-_]{8,}|AIza[A-Za-z0-9-_]{10,}|xox[bpas]-[A-Za-z0-9-]+|hf_[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9\-._~+/=]{8,})/g;

const SECRET_KEY_RE = /api[_-]?key|token|secret|password|authorization/i;

function scrubText(text) {
  SECRET_VALUE_RE.lastIndex = 0;
  return String(text).replace(SECRET_VALUE_RE, "[redacted-secret]");
}

function scrubMeta(value, depth = 0) {
  if (depth > 4) return "[max depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    const t = scrubText(value);
    return t.length > 200 ? `${t.slice(0, 80)}…[${t.length} chars]` : t;
  }
  if (Array.isArray(value)) return value.map((v) => scrubMeta(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_RE.test(k) && typeof v === "string" && v.length > 0 ? "[redacted]" : scrubMeta(v, depth + 1);
    }
    return out;
  }
  return value;
}

const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };

function minLevel() {
  return process.env.OPENBENTT_VERBOSE === "1" ? "debug" : "info";
}

function emit(level, component, message, meta) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    message: scrubText(message),
    ...(meta !== undefined ? { meta: scrubMeta(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  try {
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else if (level === "info") console.info(line);
    else console.debug(line);
  } catch {
    /* logging must never throw */
  }
}

/** @param {string} component */
export function createLogger(component) {
  return {
    debug: (message, meta) => emit("debug", component, message, meta),
    info: (message, meta) => emit("info", component, message, meta),
    warn: (message, meta) => emit("warn", component, message, meta),
    error: (message, meta) => emit("error", component, message, meta),
  };
}

export const log = createLogger("electron");
