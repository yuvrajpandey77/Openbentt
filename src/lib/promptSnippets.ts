import { v4 as uuidv4 } from "uuid";

export interface PromptSnippet {
  id: string;
  title: string;
  body: string;
}

const KEY = "openbentt-prompt-snippets-v1";

const BUILT_IN: PromptSnippet[] = [
  {
    id: "builtin-summarize",
    title: "Summarize",
    body: "Summarize the following in clear bullet points. If I paste sources, extract the main claims only.",
  },
  {
    id: "builtin-latex-minimal",
    title: "Minimal LaTeX article",
    body: 'Write a complete minimal LaTeX article starting with \\documentclass{article}, with title, one section, and \\end{document}. Use a ```latex fenced block.',
  },
  {
    id: "builtin-debug",
    title: "Debug steps",
    body: "List hypotheses, the smallest change that could fix it, and what to log or test next. Be concise.",
  },
  {
    id: "builtin-compare",
    title: "Compare options",
    body: "Compare the options in a markdown table: criterion, option A, option B, notes. End with a one-line recommendation.",
  },
];

function readCustom(): PromptSnippet[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j
      .filter((x): x is PromptSnippet => x && typeof x === "object" && typeof (x as PromptSnippet).body === "string")
      .map((x) => ({
        id: typeof x.id === "string" ? x.id : uuidv4(),
        title: typeof x.title === "string" ? x.title : "Snippet",
        body: x.body,
      }));
  } catch {
    return [];
  }
}

export function loadAllSnippets(): PromptSnippet[] {
  const custom = readCustom();
  const builtInIds = new Set(BUILT_IN.map((b) => b.id));
  const merged = [...BUILT_IN];
  for (const c of custom) {
    if (!builtInIds.has(c.id)) merged.push(c);
  }
  return merged;
}

export function saveCustomSnippets(snippets: PromptSnippet[]): void {
  const builtInIds = new Set(BUILT_IN.map((b) => b.id));
  const onlyCustom = snippets.filter((s) => !builtInIds.has(s.id));
  try {
    localStorage.setItem(KEY, JSON.stringify(onlyCustom));
  } catch {
    /* quota */
  }
}

export function addCustomSnippet(title: string, body: string): PromptSnippet {
  const s: PromptSnippet = { id: uuidv4(), title: title.trim() || "Snippet", body };
  const next = [...readCustom(), s];
  saveCustomSnippets(next);
  return s;
}

export function deleteCustomSnippet(id: string): void {
  const builtInIds = new Set(BUILT_IN.map((b) => b.id));
  if (builtInIds.has(id)) return;
  saveCustomSnippets(readCustom().filter((s) => s.id !== id));
}
