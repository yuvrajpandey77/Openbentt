/** Routes that get an extra system “workspace” block + composer hints (see AppLayout + ChatInput). */
export interface WorkspaceRouteMeta {
  tag: string;
  title: string;
  subtitle: string;
  composerPlaceholder: string;
  /** Merged into system prompts for messages sent while this route is active */
  systemAssist: string;
}

export const WORKSPACE_ROUTE_META: Record<string, WorkspaceRouteMeta> = {
  "/labs": {
    tag: "Library",
    title: "Research library",
    subtitle: "Upload PDFs, manage bibliography, run cross-paper synthesis; desktop adds GGUF hub and finetune export.",
    composerPlaceholder:
      "Ask about papers in the library, BibTeX, synthesis themes, or local models…",
    systemAssist: `The user is in the **Library**: project papers (PDF text extracted locally), bibliography, cross-paper synthesis, and on desktop local GGUF. Help with literature summaries, BibTeX, and corpus-aware suggestions. Be precise about what is in the loaded project vs inferred.`,
  },
  "/write": {
    tag: "LaTeX",
    title: "LaTeX preview",
    subtitle: "KaTeX in the browser — ask for math help tied to expressions on this page.",
    composerPlaceholder: "Explain, derive, or fix LaTeX / math for the expression you are editing…",
    systemAssist: `The user is in the **LaTeX** workspace with KaTeX preview (not a full TeX engine). Help with algebra, derivations, notation, and step-by-step explanations. Use LaTeX in fenced blocks when useful.`,
  },
  "/benchmark": {
    tag: "Benchmark",
    title: "Latency benchmark",
    subtitle: "Repeated TTFT/total runs — ask about methodology or results you see here.",
    composerPlaceholder: "Ask about TTFT, latency, how to read runs, or benchmark methodology…",
    systemAssist: `The user is in **Benchmark**: repeated timing runs (TTFT, total ms, tokens) for the same prompt via the raw API path. Help interpret results, variance, and methodology. Note this is not the same as multi-model tiled chat.`,
  },
  "/documents": {
    tag: "Documents",
    title: "Documents",
    subtitle: "Project papers and artifacts — ask chat to cite, convert, or summarize.",
    composerPlaceholder: "Ask about a document in this project…",
    systemAssist: `The user is viewing **Documents** for the active research project. Help locate, summarize, and cite uploaded sources. Prefer corpus RAG over inventing content.`,
  },
  "/files": {
    tag: "Files",
    title: "Files",
    subtitle: "Workspace files for the active project or OpenCode folder.",
    composerPlaceholder: "Ask to inspect, edit, or explain a file…",
    systemAssist: `The user is in **Files**. Help with workspace paths, reading/editing files via agent tools when available, and staying inside the project root.`,
  },
  "/tasks": {
    tag: "Tasks",
    title: "Tasks",
    subtitle: "Background jobs and agent task history.",
    composerPlaceholder: "Ask about a task or propose a new action…",
    systemAssist: `The user is viewing **Tasks**. Summarize status clearly; suggest next steps without inventing completed work.`,
  },
  "/settings": {
    tag: "Settings",
    title: "Settings",
    subtitle: "Models, providers, privacy, and local AI.",
    composerPlaceholder: "Ask how to configure a provider or local model…",
    systemAssist: `The user is in **Settings**. Help with provider keys, Ollama, WebGPU/GGUF, and privacy options. Do not ask them to paste secrets into chat.`,
  },
  "/agent": {
    tag: "Agent",
    title: "Agent",
    subtitle: "OpenCode execution, voice, and computer-use controls.",
    composerPlaceholder: "Describe a task for the agent to run…",
    systemAssist: `The user is on the **Agent** page. Prefer actionable plans with approvals; never invent tool results.`,
  },
  "/diagnostics": {
    tag: "Diagnostics",
    title: "Diagnostics",
    subtitle: "Health checks and advanced troubleshooting.",
    composerPlaceholder: "Ask what a diagnostic finding means…",
    systemAssist: `The user is in **Diagnostics**. Explain findings clearly and suggest safe next steps.`,
  },
};

export function getWorkspaceRouteMeta(pathname: string): WorkspaceRouteMeta | undefined {
  if (WORKSPACE_ROUTE_META[pathname]) return WORKSPACE_ROUTE_META[pathname];
  if (pathname.startsWith("/projects/") && pathname !== "/projects") {
    return {
      tag: "Project",
      title: "Project chat",
      subtitle: "Conversation scoped to this research project.",
      composerPlaceholder: "Ask anything about this project’s papers, draft, or files…",
      systemAssist: `The user is in a **project workspace** chat. Use project corpus RAG and stay grounded in uploaded sources.`,
    };
  }
  return undefined;
}
