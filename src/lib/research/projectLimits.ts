import type { ResearchProjectData } from "@/types/researchProject";
import { MAX_CHUNKS_INDEX_DESKTOP, MAX_CHUNKS_INDEX_WEB } from "@/lib/research/embedCore.mjs";

/** Hard caps — indexing and UI degrade gracefully beyond soft limits. */
export const LIMITS = {
  maxPapers: 500,
  /** Semantic embed soft warn — desktop can index far more in SQLite. */
  maxChunksIndexed: MAX_CHUNKS_INDEX_WEB,
  maxChunksIndexedDesktop: MAX_CHUNKS_INDEX_DESKTOP,
  maxDraftChars: 2_000_000,
  maxBibliographyChars: 500_000,
  maxChatMessagesVirtualize: 40,
  maxLocalStorageProjectBytes: 4_500_000,
  softWarnPapers: 80,
  softWarnChunks: 400,
  softWarnDraftChars: 400_000,
  /** ~1000 pages ≈ 2–3M chars of extracted text across papers. */
  softWarnExtractedChars: 2_500_000,
} as const;

export type ProjectPressureLevel = "ok" | "warn" | "critical";

export type ProjectPressure = {
  level: ProjectPressureLevel;
  messages: string[];
};

export function assessProjectPressure(project: ResearchProjectData): ProjectPressure {
  const messages: string[] = [];
  let level: ProjectPressureLevel = "ok";

  const bump = (msg: string, next: ProjectPressureLevel) => {
    messages.push(msg);
    if (next === "critical") level = "critical";
    else if (next === "warn" && level === "ok") level = "warn";
  };

  if (project.papers.length >= LIMITS.maxPapers) {
    bump(`Paper library at limit (${LIMITS.maxPapers}). Remove papers before adding more.`, "critical");
  } else if (project.papers.length >= LIMITS.softWarnPapers) {
    bump(
      `${project.papers.length} papers — large libraries slow indexing and similarity scans.`,
      "warn"
    );
  }

  const libChunks = project.chunks.filter((c) => c.paperId !== "draft").length;
  const embedCap = LIMITS.maxChunksIndexedDesktop;
  if (libChunks >= embedCap) {
    bump(
      `Corpus has ${libChunks} chunks; semantic index caps at ${embedCap} passages (fair sample across papers).`,
      "warn"
    );
  } else if (libChunks >= LIMITS.softWarnChunks) {
    bump(
      `Large corpus (${libChunks} chunks). Desktop stores embeddings in SQLite; retrieval uses hybrid TF-IDF + MiniLM.`,
      "warn"
    );
  }

  const extractedChars = project.papers.reduce((n, p) => n + (p.extractedText?.length ?? 0), 0);
  if (extractedChars >= LIMITS.softWarnExtractedChars) {
    bump(
      `~${Math.round(extractedChars / 1000)}k characters of source text — prefer desktop app for full semantic indexing.`,
      "warn"
    );
  }

  if (project.draftTex.length >= LIMITS.maxDraftChars) {
    bump("Draft exceeds maximum size; trim before continuing.", "critical");
  } else if (project.draftTex.length >= LIMITS.softWarnDraftChars) {
    bump(
      `Draft is ${(project.draftTex.length / 1000).toFixed(0)}k characters — autosave and compile may slow down.`,
      "warn"
    );
  }

  if (project.bibliography.length > LIMITS.maxBibliographyChars) {
    bump("Bibliography is very large; citation lint may be slow.", "warn");
  }

  return { level, messages };
}

export function estimateJsonBytes(data: unknown): number {
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch {
    return 0;
  }
}
