/**
 * Minimal structured logging boundary for the renderer (Phase 1 foundation).
 *
 * - Levels with timestamps, component/source tags, and safe metadata.
 * - Every message passes through secret redaction; every meta object passes
 *   through key redaction + truncation (shared redactForLogs utilities).
 * - Development (import.meta.env.DEV): debug and above go to console.
 * - Production: info and above; debug is dropped. No external sinks —
 *   enterprise observability is a later phase, and telemetry of document/chat
 *   contents remains prohibited without explicit opt-in (see privacy prefs).
 *
 * This does not replace existing console.* call sites; new and touched code
 * should use this boundary instead of raw console calls.
 */
import { redactForLogs, redactSecretsInText } from "@/lib/privacy/redactForLogs";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function minLevel(): LogLevel {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) return "debug";
  } catch {
    /* non-Vite runtimes (tests): fall through */
  }
  if (typeof process !== "undefined" && process.env?.OPENBENTT_VERBOSE === "1") return "debug";
  return "info";
}

export interface LogFields {
  component: string;
  message: string;
  meta?: Record<string, unknown>;
}

function emit(level: LogLevel, component: string, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    message: redactSecretsInText(String(message)),
    ...(meta !== undefined ? { meta: redactForLogs(meta) } : {}),
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

export const logger = {
  debug: (component: string, message: string, meta?: Record<string, unknown>) =>
    emit("debug", component, message, meta),
  info: (component: string, message: string, meta?: Record<string, unknown>) =>
    emit("info", component, message, meta),
  warn: (component: string, message: string, meta?: Record<string, unknown>) =>
    emit("warn", component, message, meta),
  error: (component: string, message: string, meta?: Record<string, unknown>) =>
    emit("error", component, message, meta),
};
