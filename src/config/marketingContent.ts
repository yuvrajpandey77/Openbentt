import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CloudOff,
  Cpu,
  FileText,
  GitCompare,
  HardDrive,
  Search,
  Shield,
  Sparkles,
} from "lucide-react";

export type NewsItem = {
  title: string;
  date: string;
  href?: string;
  /** In-app route for the updates list */
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
  alt: "Openbentt workspace with LaTeX editor, PDF preview, and model comparison table",
  width: 1024,
  height: 560,
};

export const hero = {
  headlineBefore: "Your research should ",
  headlineEmphasis: "not",
  headlineAfter: " leave your machine.",
  subhead:
    "Openbentt is a desktop-first, local-first AI workspace for LaTeX, PDFs, benchmarking, and on-device GGUF. A lighter web build covers chat and Notebook when you cannot install.",
  terminalLine: "> openbentt · local · private · yours",
};

export const heroPrinciples: HeroPrinciple[] = [
  {
    title: "Local by default",
    description: "Inference and chat history stay on your machine.",
    icon: Shield,
    iconClassName: "bg-primary/10 text-primary",
  },
  {
    title: "No cloud layer",
    description: "No accounts required. No prompt retention on our servers.",
    icon: CloudOff,
    iconClassName: "bg-primary/10 text-primary dark:text-primary",
  },
  {
    title: "Runs on your hardware",
    description: "GGUF, WebGPU, CPU, and GPU. You choose the runtime.",
    icon: Cpu,
    iconClassName: "bg-primary/10 text-primary",
  },
  {
    title: "Compare models",
    description: "Side-by-side replies with latency and token metrics.",
    icon: GitCompare,
    iconClassName: "bg-primary/10 text-primary dark:text-primary",
  },
  {
    title: "Your local models",
    description: "Run GGUF via llama-server on desktop, or small SLMs in-browser with WebGPU/WASM.",
    icon: Sparkles,
    iconClassName: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
  },
];

export const meridianAnnouncement = {
  eyebrow: "New",
  title: "Meridian 0.1 LaTeX writing prompts in Notebook — uses your chat model",
  href: "/notebook",
} as const;

export const latestNews: NewsItem[] = [
  {
    title: "Meridian 0.1: LaTeX writing prompts for Notebook (your model in Settings)",
    date: "May 2026",
    to: "/notebook",
  },
  { title: "Phase 1 desktop builds with bundled llama-server for offline GGUF", date: "May 2026" },
  { title: "Notebook: LaTeX source, live PDF preview, Apply reply from chat", date: "May 2026" },
  { title: "Model arena with TTFT and tokens/s in tiled comparison", date: "Apr 2026" },
  { title: "Research labs: BibTeX, citation graph, Hugging Face model hub", date: "Mar 2026" },
];

export type ExploreItem = {
  id: string;
  title: string;
  summary: string;
  href: string;
  icon: LucideIcon;
  iconClassName: string;
};

/** Text-only explore cards (no screenshots — avoids duplicate placeholder PNGs). */
export const exploreItems: ExploreItem[] = [
  {
    id: "meridian",
    title: "Meridian 0.1",
    summary: "LaTeX writing prompts and apply-to-source in Notebook.",
    href: "#meridian",
    icon: FileText,
    iconClassName: "bg-primary/10 text-primary dark:text-primary",
  },
  {
    id: "notebook",
    title: "Notebook",
    summary: "LaTeX source, live PDF preview, and document uploads.",
    href: "#notebook",
    icon: BookOpen,
    iconClassName: "bg-primary/10 text-primary dark:text-primary",
  },
  {
    id: "model-arena",
    title: "Model arena",
    summary: "Compare models on one prompt with latency and tokens/s.",
    href: "#model-arena",
    icon: GitCompare,
    iconClassName: "bg-primary/10 text-primary",
  },
  {
    id: "desktop-gguf",
    title: "Local GGUF",
    summary: "Offline weights and bundled llama-server on desktop.",
    href: "#desktop-gguf",
    icon: HardDrive,
    iconClassName: "bg-primary/10 text-primary",
  },
  {
    id: "research",
    title: "Research labs",
    summary: "BibTeX, citations, datasets, and the local model hub.",
    href: "#research",
    icon: Search,
    iconClassName: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
  },
  {
    id: "compare",
    title: "Desktop vs web",
    summary: "Full install or browser chat when you cannot download.",
    href: "#compare",
    icon: Cpu,
    iconClassName: "bg-primary/10 text-primary",
  },
];

export const showcaseBlocks: ShowcaseBlock[] = [
  {
    id: "meridian",
    title: "Meridian 0.1 for LaTeX",
    paragraphs: [
      "Meridian 0.1 is a writing profile: structured prompts for abstracts, outlines, and \\cite{} hygiene. Replies come from whichever model you pick in Settings — not a separate weights bundle.",
      "Use it with live PDF preview: draft a section, compile, and apply assistant output into Notebook source on your machine.",
    ],
    primaryCta: { label: "Open Notebook", to: "/notebook" },
    secondaryCta: { label: "Download desktop", to: "/download" },
    icon: FileText,
  },
  {
    id: "notebook",
    title: "Notebook & documents",
    paragraphs: [
      "Write LaTeX, upload PDFs, compile, and preview in one split pane. Apply assistant replies directly into your source.",
      "BusyTeX WASM for quick builds; optional self-hosted pdflatex when you need print-ready output.",
    ],
    primaryCta: { label: "Download desktop", to: "/download" },
    secondaryCta: { label: "Notebook in browser", to: "/notebook" },
    icon: BookOpen,
  },
  {
    id: "model-arena",
    title: "Model arena",
    paragraphs: [
      "Benchmark Gemma, Mistral, Phi, and your fine-tunes on the same prompt. See provider, context, tokens/s, and quality at a glance.",
      "Tiled comparison on desktop gives you room for two to four columns without squinting at a browser tab.",
    ],
    primaryCta: { label: "Download & compare", to: "/download" },
    secondaryCta: { label: "Open web workspace", to: "/chat" },
    icon: GitCompare,
    reverse: true,
  },
  {
    id: "desktop-gguf",
    title: "Local GGUF on desktop",
    paragraphs: [
      "Pull quantized weights from Hugging Face, manage them in Research labs, and chat through bundled llama-server. No manual llama.cpp setup.",
      "HF tokens can use OS-backed encryption. Installers for Windows, Linux, and macOS ship from GitHub Releases.",
    ],
    primaryCta: { label: "Get the installer", to: "/download" },
    secondaryCta: { label: "All platforms", to: "/download" },
    icon: HardDrive,
  },
  {
    id: "research",
    title: "Research labs",
    paragraphs: [
      "BibTeX libraries, citation graphs, dataset cards, and the local GGUF hub — desktop only. Cross-paper theme reports use local heuristics, not cloud LLM synthesis.",
      "Optional research mode in chat pulls Wikipedia, Scholar, and URLs when you enable the proxy.",
    ],
    primaryCta: { label: "Download desktop", to: "/download" },
    secondaryCta: { label: "Web chat", to: "/chat" },
    icon: Search,
    reverse: true,
  },
];

export const punchStats: PunchStat[] = [
  { headline: "Local-first", subline: "Keys, threads, and GGUF weights on your device" },
  { headline: "Meridian 0.1", subline: "LaTeX writing prompts in Notebook (your chat model)" },
  { headline: "Benchmark", subline: "Tokens/s, latency, and quality side by side" },
  { headline: "3 platforms", subline: "Windows, macOS, and Linux installers" },
];

export const desktopHighlights = [
  "Bundled llama-server for offline GGUF chat",
  "Notebook, Research labs, Benchmark, and WebGPU lab",
  "Compare up to four models per prompt",
  "OpenRouter, OpenAI, Anthropic, and Google in Settings",
  "Auto-update from GitHub Releases",
  "More headroom for PDFs, vision, and long sessions",
];

export const webOptionalLine = "No install? Use the web app for light chat and Notebook.";

export const comparePaths = {
  desktop: {
    id: "desktop" as const,
    title: "Full desktop workspace",
    description:
      "Offline GGUF, Research labs, tiled model arena, and long PDF sessions. Everything stays on disk with OS-backed secrets.",
    cta: { label: "Download desktop", to: "/download" },
  },
  web: {
    id: "web" as const,
    title: "Lightweight web app",
    description:
      "OpenRouter chat and Notebook in the browser when you cannot install. Same UI patterns, fewer offline features.",
    cta: { label: "Open web app", to: "/chat" },
  },
};

export const providerStrip = [
  "OpenRouter",
  "OpenAI",
  "Anthropic",
  "Google",
  "Hugging Face",
  "Local GGUF",
] as const;

export const cogerphereWebsite = "https://cogerphere.com" as const;

export const mission = {
  eyebrow: "Built for researchers",
  title: "Plain tools. Your machine. Your data.",
  body: "Openbentt is not another chat tab that phones home. The desktop app is the full workspace — LaTeX, PDFs, offline GGUF, Research labs, and benchmarking. The optional web build is for OpenRouter chat and Notebook when you cannot install.",
  cta: { label: "Download Openbentt", to: "/download" },
};

export const footerColumns = [
  {
    title: "Desktop",
    links: [
      { label: "Download", to: "/download" },
      { label: "GitHub Releases", external: "releases" as const },
      { label: "All platforms", to: "/download" },
    ],
  },
  {
    title: "Also available",
    links: [
      { label: "Web app", to: "/chat" },
      { label: "First-time setup", to: "/setup" },
      { label: "Share runs", to: "/share" },
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
