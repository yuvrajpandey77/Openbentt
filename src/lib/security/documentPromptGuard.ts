/**
 * Bound PDF / document text before it enters model prompts (prompt-injection hygiene).
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(your\s+)?(system|safety)\s+(prompt|instructions)/i,
  /you\s+are\s+now\s+(in\s+)?(developer|admin|god)\s+mode/i,
  /<\s*\/?\s*system\s*>/i,
  /\[INST\]|\[\/INST\]/i,
  /###\s*instruction/i,
  /BEGIN\s+SYSTEM\s+PROMPT/i,
];

export interface DocumentSanitizeResult {
  text: string;
  warnings: string[];
}

export function detectDocumentInjectionWarnings(text: string): string[] {
  const warnings: string[] = [];
  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) {
      warnings.push("Document text matches a common prompt-injection pattern — treat as untrusted source material.");
      break;
    }
  }
  return warnings;
}

/** Strip control chars and wrap extracted PDF text in explicit document boundaries. */
export function sanitizeDocumentTextForPrompt(text: string): DocumentSanitizeResult {
  const cleaned = text.replace(CONTROL_CHARS, "");
  const warnings = detectDocumentInjectionWarnings(cleaned);
  const bounded =
    cleaned.length > 0
      ? `[UNTRUSTED_DOCUMENT_START]\n${cleaned}\n[UNTRUSTED_DOCUMENT_END]`
      : "";
  return { text: bounded, warnings };
}
