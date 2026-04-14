/**
 * Single explicit linear workflow (retrieve → compress → answer) used for traces and future orchestration.
 * Not a separate agent runtime — the main chat model still performs generation.
 */
export const LINEAR_RESEARCH_WORKFLOW = [
  { id: "parse_query", label: "Parse user query" },
  { id: "gather_sources", label: "Gather sources (Wikipedia, S2, URLs, optional Brave / proxy)" },
  { id: "compress_context", label: "Fit context to model window" },
  { id: "generate", label: "Generate answer with system + tools policy" },
] as const;
