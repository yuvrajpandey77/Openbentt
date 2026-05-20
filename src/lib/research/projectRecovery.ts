import type { ResearchProjectData } from "@/types/researchProject";
import { buildCorpusChunks } from "@/lib/research/corpusIndex";

const REQUIRED_STRING_FIELDS = ["id", "title", "createdAt", "updatedAt", "draftTex", "bibliography"] as const;

/** Parse project JSON with minimal repair for truncated/corrupt saves. */
export function parseProjectJsonSafe(raw: string): ResearchProjectData | null {
  try {
    return normalizeProject(JSON.parse(raw) as Partial<ResearchProjectData>);
  } catch {
    return parseProjectJsonRecover(raw);
  }
}

function normalizeProject(data: Partial<ResearchProjectData>): ResearchProjectData | null {
  if (!data?.id || typeof data.id !== "string") return null;
  for (const k of REQUIRED_STRING_FIELDS) {
    if (typeof data[k] !== "string") {
      if (k === "draftTex" || k === "bibliography") (data as ResearchProjectData)[k] = "";
      else if (k === "title") data.title = "Recovered project";
      else if (k === "createdAt" || k === "updatedAt") {
        const t = new Date().toISOString();
        data.createdAt = data.createdAt ?? t;
        data.updatedAt = data.updatedAt ?? t;
      } else return null;
    }
  }

  const papers = Array.isArray(data.papers) ? data.papers.filter((p) => p?.id && p.fileName) : [];
  const draftTex = data.draftTex ?? "";
  const chunks =
    Array.isArray(data.chunks) && data.chunks.length > 0
      ? data.chunks.filter((c) => c?.id && c.text)
      : buildCorpusChunks(
          papers.map((p) => ({ id: p.id, fileName: p.fileName, extractedText: p.extractedText ?? "" })),
          draftTex
        );

  return {
    id: data.id,
    title: data.title ?? "Recovered project",
    createdAt: data.createdAt!,
    updatedAt: data.updatedAt!,
    targetVenue: data.targetVenue ?? "generic",
    linkedThreadIds: Array.isArray(data.linkedThreadIds) ? data.linkedThreadIds : [],
    draftTex,
    bibliography: data.bibliography ?? "",
    bibEntries: Array.isArray(data.bibEntries) ? data.bibEntries : [],
    papers,
    chunks,
    chunkEmbeddings:
      data.chunkEmbeddings && typeof data.chunkEmbeddings === "object" ? data.chunkEmbeddings : undefined,
    revisionSuggestions: Array.isArray(data.revisionSuggestions) ? data.revisionSuggestions : [],
    modelAttributions: Array.isArray(data.modelAttributions) ? data.modelAttributions : [],
    abstractVariants: Array.isArray(data.abstractVariants) ? data.abstractVariants : [],
    keywordSuggestions: Array.isArray(data.keywordSuggestions) ? data.keywordSuggestions : [],
    captionSuggestions: Array.isArray(data.captionSuggestions) ? data.captionSuggestions : [],
  };
}

/** Best-effort salvage when JSON.parse fails (e.g. truncated write). */
function parseProjectJsonRecover(raw: string): ResearchProjectData | null {
  const idMatch = raw.match(/"id"\s*:\s*"([^"]+)"/);
  if (!idMatch) return null;
  const titleMatch = raw.match(/"title"\s*:\s*"([^"]*)"/);
  const now = new Date().toISOString();
  const draftMatch = raw.match(/"draftTex"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  let draftTex = "";
  if (draftMatch) {
    try {
      draftTex = JSON.parse(`"${draftMatch[1]}"`) as string;
    } catch {
      draftTex = draftMatch[1].replace(/\\n/g, "\n");
    }
  }

  return normalizeProject({
    id: idMatch[1],
    title: titleMatch?.[1] ?? "Recovered project",
    createdAt: now,
    updatedAt: now,
    draftTex,
    bibliography: "",
    papers: [],
    chunks: [],
  });
}

export function stripEmbeddingsForWebPersist(data: ResearchProjectData): ResearchProjectData {
  const { chunkEmbeddings: _e, ...rest } = data;
  return rest;
}
