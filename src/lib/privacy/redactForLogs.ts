/** Redact secrets and long payloads before logging (dev-safe). */
const SECRET_KEYS = /api[_-]?key|token|secret|password|authorization/i;

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
