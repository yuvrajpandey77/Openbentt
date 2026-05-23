import { stripDocumentPromptMarkers } from "@/lib/security/documentPromptGuard";

type PaperLike = {
  fileName: string;
  metadata?: { title?: string };
};

/** Human-readable paper label for tree, preview chrome, and toasts. */
export function displayPaperTitle(paper: PaperLike): string {
  const candidate = stripDocumentPromptMarkers(paper.metadata?.title ?? "").trim();
  if (candidate.length >= 3 && !candidate.includes("[UNTRUSTED_DOCUMENT")) {
    return candidate;
  }
  return paper.fileName;
}

/** True when stored title looks like a security marker leak from older builds. */
export function isCorruptedPaperTitle(title: string | undefined): boolean {
  if (!title?.trim()) return false;
  return title.includes("[UNTRUSTED_DOCUMENT") || title.startsWith("--- PDF PAGE");
}
