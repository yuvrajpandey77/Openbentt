/** Phase 9 — typed bridge to `electron/preload.cjs` Ollama API (desktop only). */

export interface OllamaModelInfo {
  name: string;
  size: number | null;
  digest: string | null;
  modifiedAt: string | null;
  details: {
    parameterSize: string | null;
    quantization: string | null;
    family: string | null;
  } | null;
}

export interface OllamaStatus {
  origin: string;
  reachable: boolean;
  version: string | null;
  models: OllamaModelInfo[];
  runningModels: string[];
  error: string | null;
}

export type OllamaPullState =
  | "queued"
  | "connecting"
  | "downloading"
  | "verifying"
  | "loading"
  | "ready"
  | "failed"
  | "cancelled";

export interface OllamaPullProgress {
  model: string;
  state: OllamaPullState;
  percent: number | null;
  completed: number;
  total: number;
  detail: string;
}

export interface OllamaInstallInfo {
  platform: string;
  supported: boolean;
  downloadUrl: string;
  steps: string[];
}

export interface OpenbenttOllamaApi {
  status(origin?: string): Promise<OllamaStatus>;
  listModels(origin?: string): Promise<Pick<OllamaStatus, "models" | "runningModels" | "reachable" | "error">>;
  pullModel(model: string, origin?: string): Promise<{ ok: boolean; model: string; state: string }>;
  cancelPull(model: string): Promise<{ ok: boolean; model: string }>;
  installInfo(): Promise<OllamaInstallInfo>;
  recommendedModels(): Promise<{ models: string[] }>;
  onPullProgress(cb: (payload: OllamaPullProgress) => void): () => void;
}

export function getOllamaDesktopApi(): OpenbenttOllamaApi | null {
  try {
    const w = window as unknown as { openbenttOllama?: OpenbenttOllamaApi };
    return w.openbenttOllama ?? null;
  } catch {
    return null;
  }
}

export function isOllamaDesktopAvailable(): boolean {
  return getOllamaDesktopApi() != null;
}
