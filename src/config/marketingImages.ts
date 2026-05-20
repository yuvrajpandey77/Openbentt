/**
 * Marketing image manifest.
 *
 * Drop files into `public/marketing/` using these filenames (WebP or PNG recommended).
 * Until a file exists, the UI shows a branded SVG placeholder from the same basename.
 *
 * Full AI prompts and art direction: docs/MARKETING_IMAGES.md
 */

export type MarketingImageSlot = {
  /** Filename under /marketing/ e.g. run-locally.webp */
  file: string;
  alt: string;
  /** 16:10 works well for showcase panels; hero can be 16:9 */
  aspect?: "video" | "square" | "portrait";
};

const base = "/marketing";

export function marketingImageUrl(file: string): string {
  return `${base}/${file}`;
}

/** Hero — optional wide shot above or below headline */
export const heroImage: MarketingImageSlot = {
  file: "hero-workspace.webp",
  alt: "Openbentt workspace showing chat sidebar and model comparison",
  aspect: "video",
};

export const showcaseImages: Record<string, MarketingImageSlot> = {
  "run-locally": {
    file: "run-locally.svg",
    alt: "Openbentt chat with streaming reply and model selector",
  },
  "model-arena": {
    file: "model-arena.svg",
    alt: "Side-by-side comparison of four AI model responses",
  },
  notebook: {
    file: "notebook.svg",
    alt: "Notebook workspace with LaTeX source and PDF preview",
  },
  research: {
    file: "research.svg",
    alt: "Research mode with sources and assistant reply",
  },
  "desktop-gguf": {
    file: "desktop-gguf.svg",
    alt: "Desktop local GGUF model download and chat",
  },
};

/** SVG fallback when .webp/.png not present — same basename, .svg extension */
export function marketingPlaceholderSvg(file: string): string {
  const name = file.replace(/\.(webp|png|jpe?g)$/i, "");
  return `${base}/${name}.svg`;
}
