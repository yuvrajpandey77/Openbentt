import type { ApiKeyConfig, ResearchDepth } from "@/types/chat";

const CHART_HINT = `When you compare numbers or categories, include one or more fenced blocks:

\`\`\`openbentt-chart
{"kind":"bar","title":"Title","xKey":"label","series":[{"key":"v","name":"Value"}],"rows":[{"label":"A","v":1}]}
\`\`\`

Kinds: bar | line | area. Keep JSON valid.`;

const MATH_MODE = `You are helping with mathematics. Show clear step-by-step reasoning. State assumptions. Prefer exact forms when appropriate. If you use [[calc:expression]] style helpers in user text, those were pre-computed in the client; still verify reasoning.`;

const DEBUG_MODE = `You are in debugging / engineering mode. For code: ask for a minimal repro if missing, list hypotheses, propose the smallest fix, and mention tests or logs to add. Prefer concrete snippets and file-level pointers.`;

const RED_TEAM_MODE = `You are assisting with authorized red-team / safety evaluation only. The operator tests model boundaries in a controlled setting. Refuse to help with real-world harm, illegal activity, or non-consensual attacks. When asked to simulate adversarial prompts, analyze failure modes, refusal quality, and safe completions. Prefer structured output: risk category, model behavior, suggested policy fix.`;

const RESPONSE_FORMAT = `Format every answer in clear GitHub-Flavored Markdown: use ## and ### headings, short paragraphs, bullet or numbered lists, and markdown tables when comparing items. Use fenced code blocks for code. Avoid dumping unstructured pipe-separated text; use real table syntax with header rows.`;

const RESEARCH_BASE = `You may receive a "Fetched context" section from Wikipedia, web search, or fetched HTTPS pages. Treat it as supplementary: it may be incomplete or outdated. Prefer it for recent facts when relevant. Clearly say when you rely on that context vs general knowledge.

Do not invent paper titles, DOIs, or URLs. Only cite links that appear in the fetched context below or in the structured sources the app attaches. If you are unsure, omit the link.`;

const RESEARCH_REFERENCES_SECTION = `At the end of your answer, add a section with the heading exactly "## References". List only sources you actually used from the fetched context (title + URL on one line each). If no web context was available or you relied only on general knowledge, write one line under that heading stating that no live web sources were used for this reply.`;

const RESEARCH_ENABLED_BUT_NO_FETCH = `Web research is enabled for this app, but no fetched context was retrieved for this turn (missing keys, proxy down, or no results). Do not fabricate URLs or arXiv IDs. State briefly that live sources were unavailable if relevant.`;

const EXTENDED_REASONING = `Take additional time to structure your reasoning: outline assumptions, consider alternatives, and state confidence when evidence is thin. For multi-step problems, show intermediate steps clearly.`;

function researchDepthSynthesisHint(depth: ResearchDepth, hasContext: boolean): string | null {
  if (!hasContext) return null;
  switch (depth) {
    case "quick":
      return "The user chose quick research: answer succinctly; cite only the most relevant fetched items.";
    case "deep":
      return "The user chose deep context gathering: synthesize across sources, note tensions or gaps, and suggest concrete follow-ups (papers, queries, or experiments).";
    default:
      return null;
  }
}

export function buildSystemPrompts(
  cfg: ApiKeyConfig,
  opts: { researchContextBlock?: string; includeChartHint: boolean; workspaceAssistBlock?: string }
): string[] {
  const out: string[] = [];

  out.push(RESPONSE_FORMAT);

  if (opts.workspaceAssistBlock?.trim()) {
    out.push(
      `## Current workspace (this turn)\n\n${opts.workspaceAssistBlock.trim()}\n\nUse this context when answering; the user is working in this tool while chatting.`
    );
  }

  if (opts.researchContextBlock?.trim()) {
    out.push(
      `${RESEARCH_BASE}\n\n${RESEARCH_REFERENCES_SECTION}\n\n## Fetched context (use when relevant)\n\n${opts.researchContextBlock.trim()}`
    );
    const dHint = researchDepthSynthesisHint(cfg.researchDepth, true);
    if (dHint) out.push(dHint);
  } else if (cfg.researchEnabled) {
    out.push(`${RESEARCH_BASE}\n\n${RESEARCH_REFERENCES_SECTION}\n\n${RESEARCH_ENABLED_BUT_NO_FETCH}`);
  }

  if (cfg.reasoningPreference === "more") {
    out.push(EXTENDED_REASONING);
  }

  if (cfg.mathModeEnabled) {
    out.push(MATH_MODE);
  }

  if (cfg.debugModeEnabled) {
    out.push(DEBUG_MODE);
  }

  if (cfg.redTeamModeEnabled) {
    out.push(RED_TEAM_MODE);
  }

  if (opts.includeChartHint) {
    out.push(CHART_HINT);
  }

  return out;
}
