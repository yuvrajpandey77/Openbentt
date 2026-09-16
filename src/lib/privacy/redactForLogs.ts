/** Redact secrets and long payloads before logging (dev-safe). */
const SECRET_KEYS = /api[_-]?key|token|secret|password|authorization/i;

/**
 * Secret-looking *values* that may appear embedded in free text (provider error
 * messages, URLs, toasts). Conservative patterns for known provider key shapes
 * plus generic `Bearer <token>`. Applied to user-facing error strings and log
 * lines — never to request construction.
 */
const SECRET_VALUE_RE =
  /(sk-(or-v1-|ant-|proj-)?[A-Za-z0-9-_]{8,}|AIza[A-Za-z0-9-_]{10,}|xox[bpas]-[A-Za-z0-9-]+|hf_[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9\-._~+/=]{8,})/g;

/** Scrub embedded secret values from free text; safe on arbitrary strings. */
export function redactSecretsInText(text: string): string {
  SECRET_VALUE_RE.lastIndex = 0;
  return text.replace(SECRET_VALUE_RE, "[redacted-secret]");
}

export function redactForLogs(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[max depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 200) return `${value.slice(0, 80)}…[${value.length} chars]`;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactForLogs(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.test(k) && typeof v === "string" && v.length > 0) {
        out[k] = "[redacted]";
      } else {
        out[k] = redactForLogs(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}
