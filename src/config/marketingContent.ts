import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CloudOff,
  Cpu,
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
    "Openbentt is a local-first AI workspace for LaTeX, PDFs, benchmarking, and fine-tuned small models. Built for researchers, by researchers.",
  terminalLine: "> openbentt · local · private · yours",
};

export const heroPrinciples: HeroPrinciple[] = [
  {
    title: "Local by default",
    description: "Inference and chat history stay on your machine.",
    icon: Shield,
    iconClassName: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    title: "No cloud layer",
    description: "No accounts required. No prompt retention on our servers.",
    icon: CloudOff,
    iconClassName: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    title: "Runs on your hardware",
    description: "GGUF, WebGPU, CPU, and GPU. You choose the runtime.",
    icon: Cpu,
    iconClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    title: "Compare models",
    description: "Side-by-side replies with latency and token metrics.",
    icon: GitCompare,
    iconClassName: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  {
    title: "Fine-tuned SLMs",
    description: "Small language models that are faster and cheaper to run locally.",
    icon: Sparkles,
    iconClassName: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
  },
];

export const latestNews: NewsItem[] = [
  { title: "Phase 1 desktop builds with bundled llama-server for offline GGUF", date: "May 2026" },
  { title: "Notebook: LaTeX source, live PDF preview, Apply reply from chat", date: "May 2026" },
  { title: "Model arena with TTFT and tokens/s in tiled comparison", date: "Apr 2026" },
  { title: "Research labs: BibTeX, citation graph, Hugging Face model hub", date: "Mar 2026" },
];

export const showcaseBlocks: ShowcaseBlock[] = [
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
      "BibTeX libraries, citation graphs, dataset cards, and the local model hub. The full stack for literature-heavy work.",
      "Optional research mode in chat still pulls Wikipedia, Scholar, and URLs when you need quick context.",
    ],
    primaryCta: { label: "Download desktop", to: "/download" },
    secondaryCta: { label: "Web chat", to: "/chat" },
    icon: Search,
    reverse: true,
  },
];

export const punchStats: PunchStat[] = [
  { headline: "Local-first", subline: "Keys, threads, and GGUF weights on your device" },
  { headline: "LaTeX + PDF", subline: "Source, compile, and live preview in Notebook" },
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

export const mission = {
  eyebrow: "Built for researchers",
  title: "Plain tools. Your machine. Your data.",
  body: "Openbentt is not another chat tab that phones home. It is a desktop workspace where LaTeX, PDFs, benchmarking, and small fine-tuned models live together, with an optional browser build when you only need OpenRouter in a pinch.",
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
    title: "Community",
    links: [
      { label: "GitHub", external: "https://github.com/yuvrajpandey77/SecuredChatCogerphere" },
      { label: "Notebook", to: "/notebook" },
    ],
  },
] as const;
