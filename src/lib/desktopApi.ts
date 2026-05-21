/** Typed bridge to `electron/preload.cjs` desktop shell APIs. */

export interface DesktopUpdateStatus {
  phase:
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  version?: string;
  message?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  releaseNotes?: string;
}

export type DesktopEditRole = "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";

export interface OpenbenttDesktopApi {
  platform: NodeJS.Platform;
  isElectron: true;
  framelessTitleBar?: boolean;
  windowMinimize?(): Promise<void>;
  windowToggleMaximize?(): Promise<boolean>;
  windowClose?(): Promise<void>;
  windowIsMaximized?(): Promise<boolean>;
  editRole?(role: DesktopEditRole): Promise<void>;
  reloadPage?(): Promise<void>;
  toggleDevTools?(): Promise<void>;
  quitApp?(): Promise<void>;
  showAbout?(): Promise<void>;
  openExternal?(url: string): Promise<{ ok: boolean }>;
  onMenuNavigate?(cb: (path: string) => void): () => void;
  getAppVersion(): Promise<string>;
  checkForUpdates(): Promise<{ ok: boolean; updateInfo?: string | null; message?: string }>;
  downloadUpdate(): Promise<{ ok: boolean; message?: string }>;
  installUpdate(): Promise<{ ok: boolean }>;
  onUpdateStatus(cb: (status: DesktopUpdateStatus) => void): () => void;
}

declare global {
  interface Window {
    openbenttDesktop?: OpenbenttDesktopApi;
  }
}

export function getDesktopApi(): OpenbenttDesktopApi | undefined {
  return typeof window !== "undefined" ? window.openbenttDesktop : undefined;
}
