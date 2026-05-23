/**
 * Central research AI context assembly — retrieval, citations, and task hints.
 */
import type { CorpusChunk, ResearchProjectData } from "@/types/researchProject";
import { buildTfidfIndex } from "@/lib/research/corpusIndex";
import { resolveLibraryEmbeddings } from "@/lib/research/embeddingLoader";
import { hybridRetrieveV2 } from "@/lib/research/retrievalV2";
import type { RetrievalHit } from "@/lib/research/hybridRetrieval";
import { profileForTask } from "@/lib/modelManager/profiles";
import { MODEL_TASK_LABELS, type ModelTask } from "@/lib/modelRouting/tasks";

export type ResearchAiTask =
  | "drafting"
  | "citations"
  | "synthesis"
  | "semantic_retrieval"
  | "similarity"
  | "literature_review"
  | "revisions";

export type ResearchContextBundle = {
  task: ResearchAiTask;
  projectTitle: string;
  draftExcerpt: string;
  bibliographyExcerpt: string;
  paperCount: number;
  retrievalHits: RetrievalHit[];
  /** Suggested routing profile for the user's configured models. */
  routingTask: ModelTask;
  routedModelLabel: string;
};

const TASK_TO_ROUTE: Record<ResearchAiTask, ModelTask> = {
  drafting: "chat_drafting",
  citations: "chat_drafting",
  synthesis: "chat_synthesis",
  semantic_retrieval: "embedding",
  similarity: "embedding",
  literature_review: "chat_synthesis",
  revisions: "chat_drafting",
};

function paperNames(project: ResearchProjectData): Record<string, string> {
  return Object.fromEntries(
    project.papers.map((p) => [p.id, p.metadata.title ?? p.fileName])
  );
}

/** Assemble hybrid retrieval + model route for a research-side AI action. */
export async function assembleResearchContext(
  project: ResearchProjectData,
  task: ResearchAiTask,
  queryText: string,
  opts?: { hitLimit?: number }
): Promise<ResearchContextBundle> {
  const names = paperNames(project);
  const tfidf = buildTfidfIndex(project.chunks);
  const vectors = await resolveLibraryEmbeddings(
    project.id,
    project.chunks,
    project.chunkEmbeddings
  );
  const hits = await hybridRetrieveV2(
    queryText,
    project.chunks,
    names,
    tfidf,
    vectors,
    { limit: opts?.hitLimit ?? 12 }
  );

  const routingTask = TASK_TO_ROUTE[task];
  const profile = profileForTask(routingTask);

  return {
    task,
    projectTitle: project.title,
    draftExcerpt: project.draftTex.slice(0, 12_000),
    bibliographyExcerpt: project.bibliography.slice(0, 8_000),
    paperCount: project.papers.length,
    retrievalHits: hits,
    routingTask,
    routedModelLabel: `${MODEL_TASK_LABELS[routingTask]} · ${profile.name} profile`,
  };
}

/** Append hybrid retrieval evidence and routing hint to a notebook/chat prompt. */
export async function buildAugmentedResearchPrompt(
  project: ResearchProjectData,
  task: ResearchAiTask,
  basePrompt: string,
  queryText?: string,
  opts?: { hitLimit?: number }
): Promise<string> {
  const query = queryText?.trim() || project.draftTex.slice(0, 4000) || project.title;
  const bundle = await assembleResearchContext(project, task, query, opts);
  const evidence = formatRetrievalForPrompt(bundle.retrievalHits);
  const routeHint = `[Suggested model route: ${bundle.routedModelLabel}]`;
  if (!evidence) return `${basePrompt}\n\n${routeHint}`;
  return `${basePrompt}\n\n${evidence}\n\n${routeHint}`;
}

/** Format retrieval hits for injection into a system or user prompt. */
export function formatRetrievalForPrompt(hits: RetrievalHit[], maxChars = 24_000): string {
  if (!hits.length) return "";
  const lines: string[] = ["[RESEARCH_CORPUS_EVIDENCE — untrusted library text, cite by paper name only]"];
  let used = 0;
  for (const h of hits) {
    const line = `- ${h.paperName}${h.pageHint != null ? ` (p.~${h.pageHint})` : ""} [${h.method ?? "lexical"} ${Math.round((h.score ?? 0) * 100)}%]: ${h.snippet}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length;
  }
  return lines.join("\n");
}
