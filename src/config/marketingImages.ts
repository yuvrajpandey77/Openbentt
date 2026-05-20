/**
 * Marketing image manifest — raster screenshots only (no SVG placeholders).
 * Assets live in `public/marketing/`.
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

export const heroImage: MarketingImageSlot = {
  file: "hero-workspace.png",
  alt: "Openbentt workspace showing chat sidebar and model comparison",
  aspect: "video",
};

export const meridianShowcaseImage: MarketingImageSlot = {
  file: "meridian-latex.png",
  alt: "Meridian 0.1 editing LaTeX in Openbentt Notebook with live PDF preview",
};

export const showcaseImages: Record<string, MarketingImageSlot> = {
  meridian: meridianShowcaseImage,
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
};
