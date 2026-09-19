/**
 * Phase 9 — Ollama model auto-selection (pure logic, renderer-safe).
 *
 * Rules (spec §34):
 * 1. Explicit user preference always wins — never silently overridden.
 * 2. Otherwise rank installed, usable chat models; embedding-only models
 *    are never selected as the chat default.
 * 3. Never trigger a download: selection returns null when nothing usable
 *    is installed so the caller can offer guided setup instead.
 */

export interface SelectableOllamaModel {
  name: string;
  parameterSize?: string | null;
}

const EMBED_RE = /embed|minilm|nomic-embed|bge-|e5-|gte-/i;
const INSTRUCT_RE = /instruct|chat|-it(:|$)|reflex|uncensored/i;
const FAMILY_BONUS_RE = /qwen3|smollm2|gemma-?3|llama-?3|phi-?4|mistral|qwen2\.5/i;

function paramBillions(name: string): number | null {
  const m = name.toLowerCase().match(/(\d+(?:\.\d+)?)\s*b\b/);
  if (m) return parseFloat(m[1]);
  if (/mini|0\.5b/i.test(name)) return 0.5;
  if (/1b/i.test(name)) return 1;
  return null;
}

export function isChatUsableModel(name: string): boolean {
  if (!name || !name.trim()) return false;
  return !EMBED_RE.test(name);
}

function scoreModel(name: string): number {
  let s = 0;
  if (INSTRUCT_RE.test(name)) s -= 500;
  if (FAMILY_BONUS_RE.test(name)) s -= 50;
  const pb = paramBillions(name);
  if (pb != null) s += pb <= 4 ? pb * 20 : pb * 100;
  else s += 400;
  return s;
}

export interface AutoSelectResult {
  /** Usable installed model to use, or null when setup is required. */
  selected: string | null;
  /** Why this outcome — surfaced in UI copy. */
  reason: "explicit-preference" | "auto-discovered" | "no-usable-model";
}

/**
 * @param installed names reported by the real Ollama API.
 * @param explicitPreference previously chosen by the user (may no longer exist).
 */
export function autoSelectOllamaModel(
  installed: SelectableOllamaModel[] | string[],
  explicitPreference?: string | null
): AutoSelectResult {
  const names = installed.map((m) => (typeof m === "string" ? m : m.name)).filter(Boolean);
  if (explicitPreference && names.includes(explicitPreference)) {
    return { selected: explicitPreference, reason: "explicit-preference" };
  }
  const usable = names.filter(isChatUsableModel).sort((a, b) => scoreModel(a) - scoreModel(b));
  if (usable.length === 0) return { selected: null, reason: "no-usable-model" };
  return { selected: usable[0], reason: "auto-discovered" };
}

/** Human short label, e.g. "qwen3:1.7b" → "Qwen3 1.7B". Pure display helper. */
export function friendlyModelLabel(name: string): string {
  const base = name.split("/").pop() ?? name;
  return base.replace(/:/g, " ").replace(/\b(\d+(?:\.\d+)?)b\b/gi, "$1B");
}
