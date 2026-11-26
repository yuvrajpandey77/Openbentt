import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Bot,
  FileStack,
  GitCompare,
  HardDrive,
  Library,
  Sparkles,
  Workflow,
} from "lucide-react";

export type NewsItem = {
  title: string;
  date: string;
  href?: string;
  to?: string;
};

export type ShowcaseBlock = {
  id: string;
  title: string;
  paragraphs: string[];
  primaryCta: { label: string; to: string };
  secondaryCta?: { label: string; to: string };
  icon: LucideIcon;
  reverse?: boolean;
};

export type PunchStat = {
  headline: string;
  subline: string;
};

export type HeroPrinciple = {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
};

export const appCardHero = {
  src: "/marketing/openbentt-app-card.png",
  alt: "Openbentt Notebook — dark editor with main.tex and compiled Attention Is All You Need PDF preview",
  width: 1440,
  height: 755,
};

export const launchHero = appCardHero;

export const hero = {
  brand: "Openbentt",
  headlineBefore: "The desktop lab for ",
  headlineEmphasis: "papers, agents, and local models",
  headlineAfter: ".",
  subhead:
    "Notebook with live PDF. Paper Orchestra. OpenCode agents. Model Arena. Research Labs. Bundled llama-server GGUF. All on your machine.",
  moduleStrip: [
    "Notebook",
    "Paper Orchestra",
    "Meridian",
    "OpenCode",
    "Model Arena",
    "Research Labs",
    "Local GGUF",
    "Task Center",
  ] as const,
  terminalLine: "> openbentt · notebook · paper · agents · gguf",
};

export type ProductCapability = {
  id: string;
  name: string;
  route: string;
  line: string;
  detail: string;
  icon: LucideIcon;
};

/** Named product surfaces — concrete, not slogan cards. */
export const productCapabilities: ProductCapability[] = [
  {
    id: "notebook",
    name: "Notebook",
    route: "/notebook",
    line: "LaTeX ↔ live PDF in one split",
    detail: "BusyTeX WASM or desktop tectonic/pdflatex. Apply AI into main.tex.",
    icon: BookOpen,
  },
  {
    id: "paper",
    name: "Paper Orchestra",
    route: "/notebook",
    line: "Multi-stage paper pipeline",
    detail: "Materials → staged graph → artifacts into Notebook. Logs survive Chat.",
    icon: Workflow,
  },
  {
    id: "meridian",
    name: "Meridian 0.1",
    route: "/notebook",
    line: "Writing prompts that land in source",
    detail: "Abstracts, outlines, captions, \\cite{} hygiene — your chat model.",
    icon: Sparkles,
  },
  {
    id: "opencode",
    name: "OpenCode + agents",
    route: "/agent",
    line: "Local agents with approvals",
    detail: "Detect OpenCode, Claude, Codex, Cursor, Aider, Gemini. Activity terminal.",
    icon: Bot,
  },
  {
    id: "arena",
    name: "Model Arena",
    route: "/download",
    line: "2–4 models, one prompt",
    detail: "Tiled streams with latency and tokens/s. Cloud + local side by side.",
    icon: GitCompare,
  },
  {
    id: "labs",
    name: "Research Labs",
    route: "/labs",
    line: "PDFs, BibTeX, Zotero, themes",
    detail: "Local TF-IDF synthesis and hybrid retrieval — no cloud paper dump.",
    icon: Library,
  },
  {
    id: "gguf",
    name: "Local GGUF",
    route: "/download",
    line: "HF quants + bundled llama-server",
    detail: "Offline chat without installing llama.cpp yourself.",
    icon: HardDrive,
  },
  {
    id: "tasks",
    name: "Task Center",
    route: "/tasks",
    line: "Compile, paper, agent jobs",
    detail: "Global job strip, Thinking-on-wait, Answer ready when you’re elsewhere.",
    icon: FileStack,
  },
];

export type ProductStory = {
  id: string;
  kicker: string;
  title: string;
  body: string[];
  proof: string[];
  visual: string;
  cta: { label: string; to: string };
  reverse?: boolean;
};

export const productStories: ProductStory[] = [
  {
    id: "notebook",
    kicker: "Write & compile",
    title: "Notebook: source on the left, paper on the right",
    body: [
      "Open a project, edit main.tex, hit Compile. Preview updates in the same window — BusyTeX in the browser path, tectonic/pdflatex on desktop.",
      "Meridian 0.1 drops structured writing prompts into your thread and Apply pushes text into source. Prism/Overleaf ZIP import brings whole papers in one click.",
    ],
    proof: ["LaTeX cascade", "Live PDF", "Template gallery", "ZIP / folder import"],
    visual: "notebook",
    cta: { label: "Open Notebook", to: "/notebook" },
  },
  {
    id: "paper",
    kicker: "Paper Orchestra",
    title: "A research-paper engine, not a chat tab",
    body: [
      "Paper Orchestra runs a multi-stage graph: gather materials, draft sections, emit artifacts back into Notebook.",
      "Live engine logs and stage state sit in the desktop process — leave for Chat, come back, the run console is still there.",
    ],
    proof: ["Staged pipeline", "Persistent logs", "Notebook handoff", "Task Center chip"],
    visual: "research",
    cta: { label: "Download for Paper Orchestra", to: "/download" },
    reverse: true,
  },
  {
    id: "agents",
    kicker: "Agents & arena",
    title: "OpenCode in Chat. Arena when you need receipts.",
    body: [
      "Composer can hand work to OpenCode with approvals and an activity terminal. Settings auto-detects OpenCode, Claude Code, Codex, Cursor Agent, Aider, and Gemini CLI.",
      "Model Arena tiles 2–4 providers on one prompt so you see latency and tokens/s — not vibes.",
    ],
    proof: ["OpenCode ask", "Multi-agent detect", "Tiled compare", "Thinking-on-wait"],
    visual: "model-arena",
    cta: { label: "Get desktop agents", to: "/download" },
  },
  {
    id: "local",
    kicker: "Labs & GGUF",
    title: "Library on disk. Weights on disk. Keys on disk.",
    body: [
      "Research Labs ingest PDFs, sync Zotero/Better BibTeX, and cluster themes locally. Similarity scan can use on-device MiniLM — not a hosted RAG SaaS.",
      "Pull GGUF quants from Hugging Face and chat through the bundled llama-server. BYOK for OpenRouter, OpenAI, Anthropic, Google when you want the cloud.",
    ],
    proof: ["GGUF hub", "llama-server", "Zotero", "Local synthesis"],
    visual: "desktop-gguf",
    cta: { label: "Install desktop", to: "/download" },
    reverse: true,
  },
];

/** Kept for older imports / download page snippets */
export const localBoundary = {
  eyebrow: "Local by design",
  title: "Prompts, papers, and weights stay on your machine.",
  body: "No account wall. No prompt retention on our servers. OpenRouter when you want it; GGUF when you don’t.",
  lines: [
    "chat history on disk",
    "GGUF via bundled llama-server",
    "Notebook compile without shipping source",
    "OS-backed secrets for provider tokens",
  ],
} as const;

export const workspaceStages = productStories.map((s, i) => ({
  id: s.id,
  kicker: `${String(i + 1).padStart(2, "0")} · ${s.kicker}`,
  title: s.title.split(":")[0] ?? s.title,
  lead: s.body[0] ?? "",
  bullets: s.proof,
  visual: s.visual,
  cta: s.cta,
}));

export const heroPrinciples: HeroPrinciple[] = productCapabilities.slice(0, 5).map((c) => ({
  title: c.name,
  description: c.line,
  icon: c.icon,
  iconClassName: "bg-primary/10 text-primary",
}));

export const meridianAnnouncement = {
  eyebrow: "v2.6.3",
  title: "Landing shows the real desktop lab · Notebook hero with compiled paper",
  href: "/news",
} as const;

export const latestNews: NewsItem[] = [
  {
    title: "v2.6.3: Product landing rewrite — Notebook, Paper Orchestra, agents, GGUF",
    date: "Nov 27, 2026",
    to: "/news",
  },
  {
    title: "v2.6.2: Live Thinking, Paper log persistence, job strip polish",
    date: "Nov 26, 2026",
    to: "/news",
  },
  {
    title: "v2.6.1: OpenCode standalone ask/models + title bar no longer covered by sidebar",
    date: "Nov 26, 2026",
    to: "/news",
  },
  {
    title: "v2.6.0: Center status pill, lean composer, workspace recent folders",
    date: "Nov 26, 2026",
    to: "/news",
  },
  {
    title: "v2.5.9: Unified window chrome, composer agent picker, clearer approvals",
    date: "Nov 26, 2026",
    to: "/news",
  },
  {
    title: "v2.5.3: Desktop UX overhaul — ChatGPT-style empty chat & design system",
    date: "Nov 23, 2026",
    to: "/news",
  },
  {
    title: "v2.5.0: Prism migration, multi-agent detect, one-click ZIP/folder import",
    date: "Nov 2026",
    to: "/news",
  },
];

export type ExploreItem = {
  id: string;
  title: string;
  summary: string;
  href: string;
  icon: LucideIcon;
  iconClassName: string;
};

export const exploreItems: ExploreItem[] = productCapabilities.map((c) => ({
  id: c.id,
  title: c.name,
  summary: c.line,
  href: c.route,
  icon: c.icon,
  iconClassName: "bg-primary/10 text-primary",
}));

export const showcaseBlocks: ShowcaseBlock[] = productStories.map((s) => ({
  id: s.id,
  title: s.title,
  paragraphs: s.body,
  primaryCta: s.cta,
  icon: BookOpen,
  reverse: s.reverse,
}));

export const punchStats: PunchStat[] = [
  { headline: "Notebook", subline: "LaTeX + live PDF + Meridian apply-to-source" },
  { headline: "Paper Orchestra", subline: "Multi-stage paper graph with persistent logs" },
  { headline: "OpenCode", subline: "Local agents, approvals, multi-CLI detect" },
  { headline: "Local GGUF", subline: "HF hub + bundled llama-server" },
];

export const desktopHighlights = [
  "Notebook: LaTeX, live PDF, Meridian, Prism/Overleaf ZIP import",
  "Paper Orchestra multi-stage paper engine with persistent run logs",
  "OpenCode + Claude/Codex/Cursor/Aider/Gemini detection",
  "Model Arena: compare up to four models per prompt",
  "Research Labs: PDFs, Zotero, local theme synthesis",
  "Bundled llama-server for offline GGUF chat",
];

export const comparePaths = {
  desktop: {
    id: "desktop" as const,
    title: "Full desktop workspace",
    description:
      "Offline GGUF, Research Labs, Paper Orchestra, tiled Model Arena, and long PDF sessions. Everything stays on disk with OS-backed secrets.",
    cta: { label: "Download desktop", to: "/download" },
  },
};

export const providerStrip = [
  "OpenRouter",
  "OpenAI",
  "Anthropic",
  "Google",
  "Hugging Face",
  "Local GGUF",
  "OpenCode",
] as const;

export const cogerphereWebsite = "https://cogerphere.com" as const;

export const mission = {
  eyebrow: "Built for researchers",
  title: "A lab on your machine — not another chat wrapper.",
  body: "Openbentt ships Notebook, Paper Orchestra, agents, Arena, Labs, and local GGUF in one desktop app. Windows, Linux, and macOS.",
  cta: { label: "Download Openbentt", to: "/download" },
};

export const footerColumns = [
  {
    title: "Desktop",
    links: [
      { label: "Download", to: "/download" },
      { label: "News & releases", to: "/news" },
      { label: "GitHub Releases", external: "releases" as const },
      { label: "All platforms", to: "/download" },
    ],
  },
  {
    title: "Also available",
    links: [
      { label: "First-time setup", to: "/setup" },
      { label: "v2.6.3 notes", to: "/news#v2-6-3" },
    ],
  },
  {
    title: "Cogerphere",
    links: [{ label: "About, contact & more", external: cogerphereWebsite }],
  },
  {
    title: "Community",
    links: [
      { label: "GitHub", external: "https://github.com/yuvrajpandey77/Openbentt" },
      { label: "Notebook", to: "/notebook" },
    ],
  },
] as const;
