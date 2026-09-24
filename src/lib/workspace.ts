/**
 * Canonical ProjectWorkspace — the ONE workspace authority.
 *
 * A project is a workspace context, not a separate world. Every filesystem
 * operation resolves through this abstraction; no UI component constructs
 * arbitrary paths. The real filesystem is authoritative for project files.
 */

export type DetectedProjectType = "latex" | "code" | "data" | "mixed" | "empty" | "unknown";

export interface ProjectWorkspace {
  projectId: string;
  /** Canonical absolute root (realpath, validated). */
  rootPath: string;
  displayName: string;
  linkedFolders: string[];
  allowedPaths: string[];
  activeFile?: string | null;
  /** { startLine, endLine } 1-based inclusive, when an editor selection exists. */
  activeSelection?: { startLine: number; endLine: number } | null;
  activeConversationId?: string | null;
  projectInstructions?: string | null;
  detectedProjectType: DetectedProjectType;
  latex?: {
    mainTex: string;
    buildDir: string;
    /** Other .tex files in the workspace (editable chapters). */
    chapters?: string[];
    /** .bib files in the workspace (editable bibliography). */
    bibliography?: string[];
  } | null;
  /** Present when root is inside a git work tree. */
  git?: { branch: string; modified: string[]; untracked: string[] } | null;
}

export interface FileVerification {
  path: string;
  exists: boolean;
  size: number;
  /** sha256 hex of current content (empty when missing). */
  hash: string;
  mtimeMs: number;
}

const LATEX_FILES = [".tex", ".bib", ".cls", ".sty"];
const CODE_FILES = [".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".c", ".cpp"];
const DATA_FILES = [".csv", ".tsv", ".json", ".jsonl", ".xlsx", ".parquet"];

export function detectProjectType(fileNames: string[]): DetectedProjectType {
  const names = fileNames.map((f) => f.toLowerCase());
  if (names.length === 0) return "empty";
  const has = (exts: string[]) => names.some((n) => exts.some((e) => n.endsWith(e)));
  const latex = has(LATEX_FILES);
  const code = has(CODE_FILES);
  const data = has(DATA_FILES);
  const kinds = [latex, code, data].filter(Boolean).length;
  if (kinds > 1) return "mixed";
  if (latex) return "latex";
  if (code) return "code";
  if (data) return "data";
  return "unknown";
}

/** Lexical containment (renderer-side pre-check; main re-validates with realpath). */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const r = norm(root);
  const c = norm(candidate);
  return c === r || c.startsWith(`${r}/`);
}

export function toWorkspaceRel(root: string, absPath: string): string | null {
  if (!isPathWithinRoot(root, absPath)) return null;
  const rel = absPath.slice(root.replace(/\/+$/, "").length + 1);
  if (!rel || rel.includes("..")) return null;
  return rel.replace(/\\/g, "/");
}

export const PROJECT_INSTRUCTIONS_FILES = ["project.md", ".openbentt/project.md"] as const;
