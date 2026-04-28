/**
 * Hugging Face repo id: `namespace/name` (letters, numbers, `-`, `_`, `.`).
 */
const REPO_ID_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export function assertSafeRepoId(repoId: string): string {
  const t = repoId.trim();
  if (!REPO_ID_RE.test(t)) {
    throw new Error("Invalid Hugging Face repo id (expected namespace/name).");
  }
  return t;
}

/** Single path segment, typically `model-Q4_K_M.gguf`. */
export function assertSafeGgufFileName(fileName: string): string {
  const t = fileName.trim();
  if (!t.toLowerCase().endsWith(".gguf")) {
    throw new Error("Only .gguf files are supported.");
  }
  if (t.includes("/") || t.includes("\\") || t.includes("..") || t.startsWith(".")) {
    throw new Error("Invalid file name.");
  }
  return t;
}

export function assertRevision(revision: string | undefined): string {
  const r = (revision ?? "main").trim();
  if (!r || r.includes("..") || r.includes("/") || r.includes("\\")) {
    throw new Error("Invalid revision.");
  }
  return r;
}
