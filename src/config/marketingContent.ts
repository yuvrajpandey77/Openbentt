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

/** ChatGPT-overview–style hero copy */
export const hero = {
  brand: "Openbentt",
  headlineBefore: "Now you can write papers, run agents & local models ",
  headlineEmphasis: "in one desktop lab",
  headlineAfter: ".",
  /** Used by HeroHeadline when present */
  subhead: "",
  terminalLine: "> openbentt · notebook · paper · agents · gguf",
  primaryCta: { label: "Download desktop", to: "/download" },
  secondaryCta: { label: "All platforms", to: "/download" },
};

export type OverviewMode = {
  id: string;
  tab: string;
  title: string;
  blurb: string;
  body: string;
  visual: string;
  cta: { label: string; to: string };
};

/** Mode switcher — mirrors ChatGPT chat / work / code */
export const overviewModes: OverviewMode[] = [
  {
    id: "write",
    tab: "write",
    title: "Notebook",
    blurb: "For LaTeX, live PDF, and Meridian writing.",
    body: "Edit main.tex beside a compiled preview. BusyTeX or desktop tectonic/pdflatex. Meridian prompts apply straight into source. Import Prism/Overleaf ZIPs in one click.",
    visual: "notebook",
    cta: { label: "Open Notebook", to: "/notebook" },
  },
  {
    id: "paper",
    tab: "paper",
    title: "Paper Orchestra",
    blurb: "For multi-stage research papers end to end.",
    body: "Run a staged paper graph — materials, drafts, artifacts — then land results in Notebook. Engine logs survive when you leave for Chat and come back.",
    visual: "research",
    cta: { label: "Download for Paper", to: "/download" },
  },
  {
    id: "agents",
    tab: "agents",
    title: "Agents",
    blurb: "For OpenCode, multi-CLI agents, and Model Arena.",
    body: "Hand work to OpenCode with approvals and an activity terminal. Auto-detect Claude, Codex, Cursor, Aider, Gemini. Compare 2–4 models on one prompt with latency and tokens/s.",
    visual: "model-arena",
    cta: { label: "Get desktop agents", to: "/download" },
  },
  {
    id: "local",
    tab: "local",
    title: "Local",
    blurb: "For GGUF, Research Labs, and on-disk libraries.",
    body: "Pull Hugging Face quants and chat through bundled llama-server. Labs keep PDFs, Zotero, BibTeX, and local theme synthesis on your machine — not a hosted RAG SaaS.",
    visual: "desktop-gguf",
    cta: { label: "Install desktop", to: "/download" },
  },
];

export type UseCase = {
  id: string;
  title: string;
  description: string;
};

export const overviewUseCases: UseCase[] = [
  {
    id: "latex",
    title: "LaTeX & PDF",
    description: "Compile, preview, and apply AI into source without leaving Notebook.",
  },
  {
    id: "papers",
    title: "Paper writing",
    description: "Paper Orchestra stages a full draft pipeline into your project files.",
  },
  {
    id: "compare",
    title: "Model compare",
    description: "Arena tiles multiple providers so you see speed and quality, not vibes.",
  },
  {
    id: "agents",
    title: "Local agents",
    description: "OpenCode and detected CLIs run with approvals beside Chat.",
  },
  {
    id: "offline",
    title: "Offline GGUF",
    description: "Bundled llama-server — no manual llama.cpp install.",
  },
  {
    id: "labs",
    title: "Research library",
    description: "PDFs, Zotero, BibTeX, and local cross-paper themes on disk.",
  },
];

export type ProductCapability = {
  id: string;
  name: string;
  route: string;
  line: string;
  detail: string;
  icon: LucideIcon;
};

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

export const productStories: ProductStory[] = overviewModes.map((m, i) => ({
  id: m.id,
  kicker: m.tab,
  title: `${m.title}: ${m.blurb}`,
  body: [m.body],
  proof: [],
  visual: m.visual,
  cta: m.cta,
  reverse: i % 2 === 1,
}));

export const localBoundary = {
  eyebrow: "Local by design",
  title: "Prompts, papers, and weights stay on your machine.",
  body: "No account wall. No prompt retention on our servers.",
  lines: [
    "chat history on disk",
    "GGUF via bundled llama-server",
    "Notebook compile without shipping source",
    "OS-backed secrets for provider tokens",
  ],
} as const;

export const workspaceStages = overviewModes.map((m, i) => ({
  id: m.id,
  kicker: `${String(i + 1).padStart(2, "0")} · ${m.tab}`,
  title: m.title,
  lead: m.blurb,
  bullets: [m.body],
  visual: m.visual,
  cta: m.cta,
}));

export const heroPrinciples: HeroPrinciple[] = productCapabilities.slice(0, 5).map((c) => ({
  title: c.name,
  description: c.line,
  icon: c.icon,
  iconClassName: "bg-primary/10 text-primary",
}));

export const meridianAnnouncement = {
  eyebrow: "v2.6.4",
  title: "Overview landing · ChatGPT-style dark minimal desktop lab",
  href: "/news",
} as const;

export const latestNews: NewsItem[] = [
  {
    title: "v2.6.4: ChatGPT-overview landing — dark minimal write/paper/agents/local",
    date: "Nov 27, 2026",
    to: "/news",
  },
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
  { headline: "Notebook", subline: "LaTeX + live PDF + Meridian" },
  { headline: "Paper Orchestra", subline: "Multi-stage paper graph" },
  { headline: "OpenCode", subline: "Local agents + multi-CLI detect" },
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
      "Offline GGUF, Research Labs, Paper Orchestra, tiled Model Arena, and long PDF sessions.",
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
  eyebrow: "Try Openbentt",
  title: "Install the desktop lab today",
  body: "Windows, Linux, and macOS — Notebook, Paper Orchestra, agents, Arena, Labs, and offline GGUF.",
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
      { label: "v2.6.4 notes", to: "/news#v2-6-4" },
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
