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
  nativeMenuBar?: boolean;
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
  /** Native folder picker (Cursor/VS Code style). Null when cancelled/unavailable. */
  pickWorkspaceFolder?(currentPath?: string): Promise<{ path: string | null }>;
  /* Workspace authority (main-owned fs; renderer never touches paths directly). */
  workspaceResolve?(root: string): Promise<{ root: string }>;
  workspaceList?(root: string, dir?: string, depth?: number): Promise<Array<{ path: string; kind: string }>>;
  workspaceRead?(root: string, path: string, maxBytes?: number): Promise<{ path: string; text: string; truncated: boolean; size: number }>;
  workspaceVerify?(root: string, claims: Array<{ path: string; existedBefore?: boolean }>): Promise<Array<{ path: string; exists: boolean; size: number; hash: string; mtimeMs: number; changed: boolean }>>;
  workspaceInstructions?(root: string): Promise<{ path: string | null; text: string | null }>;
  workspaceGit?(root: string): Promise<{ branch: string; modified: string[]; untracked: string[] } | null>;
  workspaceSnapshot?(root: string, taskKey: string, files: string[]): Promise<{ files: number }>;
  workspaceDiff?(taskKey: string): Promise<Array<{ path: string; added: number; removed: number; binary: boolean; patch: string }>>;
  workspaceUndo?(taskKey: string, files?: string[]): Promise<{ approvalId: string; fingerprint: string; files: string[]; status: string }>;
  workspaceUndoConfirm?(approvalId: string, decision: "allow" | "deny"): Promise<{ status: string; restored?: string[] }>;
  workspaceWatch?(root: string): Promise<{ watching: boolean; root: string }>;
  workspaceUnwatch?(root: string): Promise<{ watching: boolean }>;
  onWorkspaceFilesChanged?(cb: (payload: { root: string; changed: string[]; at: string }) => void): () => void;
  latexDetect?(root: string): Promise<{ isLatex: boolean; mainTex?: string; chapters?: string[]; bibliography?: string[]; buildDir?: string; engines?: Record<string, boolean> }>;
  latexCompile?(root: string, engine?: string): Promise<{ ok: boolean; mainTex: string; pdf: string | null; pdfSize: number; errors: Array<{ file: string; line: number; message: string }>; warnings: string[]; logTail: string }>;
  latexOpenPdf?(root: string, path: string): Promise<{ opened: boolean; path: string }>;
  computerCapabilities?(): Promise<{ screenshot: boolean; act: boolean; open: boolean; platform: string }>;
  computerScreenshot?(): Promise<{ dataUrl: string; displayId: string | null; at: string }>;
  computerAct?(action: string, params?: Record<string, unknown>): Promise<{ result: { message: string; code: number | null }; before: string | null; after: string | null }>;
  computerRequest?(action: string, params?: Record<string, unknown>, taskId?: string): Promise<{ approvalId: string; risk: string; status: string }>;
  computerConfirm?(approvalId: string, decision: "allow" | "deny"): Promise<{ status: string }>;
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
