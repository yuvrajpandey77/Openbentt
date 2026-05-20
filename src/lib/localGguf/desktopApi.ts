/** Typed bridge to `electron/preload.cjs` local GGUF API (desktop only). */

export interface LocalGgufRegistryEntry {
  id: string;
  repoId: string;
  revision: string;
  fileName: string;
  bytes: number;
  relativePath: string;
  displayName: string;
  sha256: string | null;
  createdAt: string;
}

export interface LocalGgufSearchHit {
  id: string;
  downloads?: number;
  pipeline_tag?: string;
}

export interface LocalGgufBinaryInfo {
  path: string | null;
  source: string | null;
}

export interface EnsureServerResult {
  baseUrl: string;
  port: number;
  chatModelId: string;
}

export interface DownloadProgressEvent {
  repoId?: string;
  fileName?: string;
  registryId?: string | null;
  received: number;
  total: number;
}

export interface HfSecretStatus {
  stored: boolean;
  encryptionAvailable: boolean;
}

export interface OpenbenttLocalGgufApi {
  listRegistry(): Promise<{ entries: LocalGgufRegistryEntry[] }>;
  diskFree(): Promise<{ bytes: number | null }>;
  resolveBinary(configuredPath?: string): Promise<LocalGgufBinaryInfo>;
  searchHf(query: string): Promise<LocalGgufSearchHit[]>;
  listGgufFiles(repoId: string): Promise<{
    gguf: string[];
    gated?: boolean;
    /** When Hub returns `blobs=true` metadata — bytes per `rfilename`. */
    fileSizes?: Record<string, number>;
  }>;
  addFromHf(opts: {
    repoId: string;
    fileName: string;
    revision?: string;
    token?: string;
    /** Safety cap (billions of parameters); clamped to 8–16 in main process. */
    maxParamB?: 8 | 16;
  }): Promise<LocalGgufRegistryEntry>;
  deleteEntry(entryId: string): Promise<{ ok: boolean }>;
  ensureServer(opts: { registryId: string; binaryOverride?: string }): Promise<EnsureServerResult>;
  stopServer(): Promise<{ ok: boolean }>;
  whoami(token: string): Promise<{ valid: boolean; name?: string; message?: string }>;
  /** OS-backed HF token when available (Electron). */
  hfSecretStatus(): Promise<HfSecretStatus>;
  hfSecretSet(token: string): Promise<{ ok: boolean }>;
  hfSecretClear(): Promise<{ ok: boolean }>;
  onDownloadProgress(cb: (e: DownloadProgressEvent) => void): () => void;
}

declare global {
  interface Window {
    openbenttLocalGguf?: OpenbenttLocalGgufApi;
  }
}

export function getLocalGgufApi(): OpenbenttLocalGgufApi | undefined {
  return typeof window !== "undefined" ? window.openbenttLocalGguf : undefined;
}

export function isLocalGgufDesktopAvailable(): boolean {
  return Boolean(getLocalGgufApi());
}
