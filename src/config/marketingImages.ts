/**
 * Marketing image manifest — assets in `public/marketing/`.
 */

export type MarketingImageSlot = {
  file: string;
  alt: string;
  aspect?: "video" | "square" | "portrait";
};

const base = "/marketing";

export function marketingImageUrl(file: string): string {
  return `${base}/${file}`;
}

export function isMarketingSvg(file: string): boolean {
  return file.endsWith(".svg");
}

export const heroImage: MarketingImageSlot = {
  file: "hero-workspace.png",
  alt: "Openbentt workspace showing chat sidebar and model comparison",
  aspect: "video",
};

export const showcaseImages: Record<string, MarketingImageSlot> = {
  meridian: {
    file: "meridian-latex.png",
    alt: "Meridian LaTeX writing prompts in Openbentt Notebook with live PDF preview",
  },
  notebook: {
    file: "notebook.png",
    alt: "Notebook workspace with LaTeX source and PDF preview",
  },
  "model-arena": {
    file: "model-arena.png",
    alt: "Side-by-side comparison of AI model responses in Openbentt",
  },
  "desktop-gguf": {
    file: "desktop-gguf.png",
    alt: "Desktop local GGUF model hub and offline chat",
  },
  research: {
    file: "research.png",
    alt: "Research labs with BibTeX, citations, and model hub",
  },
  "run-locally": {
    file: "run-locally.png",
    alt: "Openbentt chat with streaming reply and model selector",
  },
  "hero-workspace": heroImage,
};

/** Unique tiles for bento gallery — one file per tile, no repeats */
export const galleryTiles: Array<MarketingImageSlot & { id: string; label: string; href: string }> = [
  { id: "meridian", file: "meridian-latex.png", label: "Meridian LaTeX", href: "#meridian", alt: showcaseImages.meridian.alt },
  { id: "notebook", file: "notebook.png", label: "Notebook", href: "#notebook", alt: showcaseImages.notebook.alt },
  { id: "arena", file: "model-arena.png", label: "Model arena", href: "#model-arena", alt: showcaseImages["model-arena"].alt },
  { id: "gguf", file: "desktop-gguf.png", label: "Local GGUF", href: "#desktop-gguf", alt: showcaseImages["desktop-gguf"].alt },
  { id: "research", file: "research.png", label: "Research labs", href: "#research", alt: showcaseImages.research.alt },
  { id: "chat", file: "run-locally.png", label: "Private chat", href: "#run-locally", alt: showcaseImages["run-locally"].alt },
];
