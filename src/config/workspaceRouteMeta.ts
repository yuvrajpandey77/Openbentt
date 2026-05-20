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
  "/notebook": {
    tag: "Notebook",
    title: "Notebook",
    subtitle: "Chat can drive LaTeX: ask in the composer, then Apply reply to compile and open Preview.",
    composerPlaceholder:
      "Example: “Write a complete book.tex with title page, TOC, and three chapters about …”. Then use Notebook → Apply reply to put it in Source, compile, and preview.",
    systemAssist: `The user is in the **Notebook** workspace.

**Chat-driven workflow (tell them this when relevant)**  
They can **describe the document in the main composer** (the chat input). You should respond with **complete, valid .tex** (TeX source) when they want a PDF book or paper—ideally in **one markdown fenced code block** whose language tag is **latex** (triple backticks + latex on the opening fence) so the app can unwrap it. They do **not** need to paste by hand: after your reply, they click **Apply reply** in the Notebook panel to copy that output into **Source**, **run Compile**, and switch to **Preview** automatically. **Last reply** + **Review** is optional for line-by-line merge before compile.

**Source modes**
- **Full LaTeX** (starts with \\documentclass or a standard preamble + \\begin{document}): output is a **real PDF** via **pdflatex** (run npm run latex-compile locally with TeX Live, or set VITE_LATEX_COMPILE_URL in production). Use valid book/article LaTeX: \\chapter, \\section, lists, titlepage, \\tableofcontents, etc. The compile step sends **only the .tex string** (no project folder). **\\includegraphics{...}** is rewritten to a framed placeholder so the PDF still builds; for real images use a full TeX setup with files on disk. Prefer **TikZ/tikz-cd** for diagrams when possible.
- **Plain / extracted text** with --- PDF PAGE i / n --- markers: **Compile** builds a simple multi-page text PDF (jsPDF). **Original** preview keeps the uploaded PDF (images, layout); **Compiled** is never pixel-identical to a complex PDF.

When the user wants a proper book or **research paper** (arXiv-style or PDF), still respond with a **full** \`latex\` fenced block: use a standard preamble (e.g. \\documentclass[11pt,a4paper]{article}), **abstract**, **sections** (\\section{Introduction}, Related work, Method, …), theorems, algorithms, and **\\bibliography** or a manual **thebibliography** with real-looking entries (no fake DOIs; cite only from user/fetched context when applicable). The small on-device model may be brief, but the **skeleton and LaTeX must be valid and complete** so the user can compile.

When the user wants a proper book or paper, prefer **complete .tex** (fenced) and remind them that LaTeX **Compile** needs the pdflatex service when applicable.`,
  },
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
  "/webgpu": {
    tag: "WebGPU",
    title: "WebGPU probe",
    subtitle: "Browser GPU limits — ask about SLMs, VRAM heuristics, or transformers.js.",
    composerPlaceholder: "Ask about WebGPU limits, SLM sizing, or in-browser ML on this device…",
    systemAssist: `The user is on **WebGPU**: browser GPU adapter/limits and heuristics for small models. Distinguish browser WebGPU from server/OpenRouter LLM calls. Help with realistic expectations for local SLMs and Transformers.js.`,
  },
};

export function getWorkspaceRouteMeta(pathname: string): WorkspaceRouteMeta | undefined {
  return WORKSPACE_ROUTE_META[pathname];
}
