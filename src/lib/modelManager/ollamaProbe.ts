const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434/v1";
const PROBE_TIMEOUT_MS = 4000;

export interface OllamaProbeResult {
  ok: boolean;
  baseUrl: string;
  modelIds: string[];
  error?: string;
}

function normalizeOllamaBase(baseUrl?: string): string {
  const raw = (baseUrl ?? DEFAULT_OLLAMA_BASE).trim() || DEFAULT_OLLAMA_BASE;
  const u = raw.replace(/\/+$/, "");
  return u.endsWith("/v1") ? u : `${u}/v1`;
}

/**
 * Probe Ollama (or any OpenAI-compatible server) for `/v1/models`.
 * Safe to call from renderer — localhost only.
 */
export async function probeOllamaModels(baseUrl?: string, signal?: AbortSignal): Promise<OllamaProbeResult> {
  const base = normalizeOllamaBase(baseUrl);
  const url = `${base}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const merged = signal
    ? (() => {
        signal.addEventListener("abort", () => controller.abort(), { once: true });
        return controller.signal;
      })()
    : controller.signal;

  try {
    const res = await fetch(url, { signal: merged, headers: { Accept: "application/json" } });
    if (!res.ok) {
      return { ok: false, baseUrl: base, modelIds: [], error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { data?: { id?: string }[]; models?: { name?: string; model?: string }[] };
    const ids: string[] = [];
    if (Array.isArray(json.data)) {
      for (const row of json.data) {
        if (row?.id) ids.push(row.id);
      }
    }
    if (Array.isArray(json.models)) {
      for (const row of json.models) {
        const id = row?.name ?? row?.model;
        if (id) ids.push(id);
      }
    }
    return { ok: true, baseUrl: base, modelIds: [...new Set(ids)] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, baseUrl: base, modelIds: [], error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

export function defaultOllamaBaseUrl(): string {
  return DEFAULT_OLLAMA_BASE;
}
