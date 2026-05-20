/**
 * Marketing image manifest — assets in `public/marketing/`.
 * Feature sections use distinct SVG previews; hero uses one app card PNG only.
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

/** One raster for the hero — do not reuse elsewhere on the landing page. */
export const heroAppCard = {
  src: `${base}/openbentt-app-card.png`,
  alt: "Openbentt workspace with LaTeX editor, PDF preview, and model comparison table",
  width: 1024,
  height: 560,
} as const;

/** Unique SVG per feature block (visually distinct illustrations). */
export const showcaseImages: Record<string, MarketingImageSlot> = {
  meridian: {
    file: "meridian-latex.svg",
    alt: "Meridian LaTeX writing prompts in Notebook with live PDF preview",
  },
  notebook: {
    file: "notebook.svg",
    alt: "Notebook workspace with LaTeX source and PDF preview",
  },
  "model-arena": {
    file: "model-arena.svg",
    alt: "Side-by-side comparison of AI model responses",
  },
  "desktop-gguf": {
    file: "desktop-gguf.svg",
    alt: "Desktop local GGUF model hub and offline chat",
  },
  research: {
    file: "research.svg",
    alt: "Research labs with BibTeX, citations, and model hub",
  },
};
