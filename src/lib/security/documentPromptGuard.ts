/**
 * Bound PDF / document text before it enters model prompts (prompt-injection hygiene).
 */

function stripControlChars(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    if (code === 0x7f) continue;
    out += text[i];
  }
  return out;
}

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

/** Strip prompt-injection boundary markers from stored or displayed document text. */
export function stripDocumentPromptMarkers(text: string): string {
  return text
    .replace(/\[UNTRUSTED_DOCUMENT_START\]\n?/g, "")
    .replace(/\n?\[UNTRUSTED_DOCUMENT_END\]/g, "")
    .trim();
}

/** Strip control chars and wrap extracted PDF text in explicit document boundaries. */
export function sanitizeDocumentTextForPrompt(text: string): DocumentSanitizeResult {
  const cleaned = stripControlChars(stripDocumentPromptMarkers(text));
  const warnings = detectDocumentInjectionWarnings(cleaned);
  const bounded =
    cleaned.length > 0
      ? `[UNTRUSTED_DOCUMENT_START]\n${cleaned}\n[UNTRUSTED_DOCUMENT_END]`
      : "";
  return { text: bounded, warnings };
}
