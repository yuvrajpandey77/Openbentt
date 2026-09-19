/**
 * Phase 7 — MCP security boundary.
 *
 * - Remote transports: HTTPS only + explicit operator allowlist
 *   (no arbitrary URLs → SSRF protection).
 * - Request/response size caps + timeouts.
 * - MCP resources/tools are UNTRUSTED DATA: wrapped for the model with the
 *   same [BEGIN/END UNTRUSTED TOOL DATA] framing as agent tool observations.
 * - Prompt-injection scan: control phrases that attempt privilege escalation
 *   cause fail-closed denial of that resource/tool result.
 */
import type { McpServerConfig } from "@/lib/mcp/mcpTypes";

export const MCP_TIMEOUT_MS = 30000;
export const MCP_MAX_RESPONSE_BYTES = 1024 * 1024;
export const MCP_MAX_TOOLS = 128;
export const MCP_MAX_RESOURCES = 256;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /disregard\s+(all\s+)?(system|prior)\s+(prompts?|instructions?)/i,
  /you\s+are\s+now\s+(in|an?)\s+\w+\s+mode/i,
  /grant\s+(yourself|me)\s+(admin|root|permission)/i,
  /bypass\s+(polic|permis|confirm|secur)/i,
  /send\s+\w+\s+to\s+(https?:|external|attacker)/i,
  /\[system\]/i,
  /<\s*system\s*>/i,
];

export function assertMcpEndpointAllowed(config: McpServerConfig, allowlist: string[]): void {
  if (config.transport === "stdio-local") return; // spawned by main process only
  let host: string;
  try {
    host = new URL(config.endpoint).hostname.toLowerCase();
  } catch {
    throw new Error("mcp-endpoint-blocked");
  }
  const allowed = allowlist.map((a) => String(a).toLowerCase().replace(/\.$/, ""));
  if (!allowed.includes(host)) throw new Error("mcp-endpoint-not-allowlisted");
}

/** Fail-closed prompt-injection scan over untrusted MCP content. */
export function scanMcpContentForInjection(text: string): { clean: boolean; matched?: string } {
  const s = String(text ?? "");
  for (const re of INJECTION_PATTERNS) {
    const m = s.match(re);
    if (m) return { clean: false, matched: m[0].slice(0, 120) };
  }
  return { clean: true };
}

/** Wrap untrusted MCP content for model consumption (agent DATA framing). */
export function wrapMcpContentForModel(source: string, text: string, maxChars = 4000): string {
  const clean = String(text ?? "").slice(0, maxChars);
  return `[BEGIN UNTRUSTED TOOL DATA: mcp:${source}]\n${clean}\n[END UNTRUSTED TOOL DATA]`;
}

/** Redact credential-shaped strings from MCP logs/audit (never full payloads). */
export function redactMcpSecrets(text: string): string {
  return String(text ?? "")
    .replace(/([A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password|authorization)[A-Za-z0-9_-]*\s*[:=]\s*)([^\s&;,"'}]+)/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[^\s;,"'}]+/gi, "$1[redacted]")
    .slice(0, 500);
}
