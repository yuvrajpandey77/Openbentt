import Cite from "citation-js";
import "citation-js/plugin-bibtex";
import "citation-js/plugin-csl";
import type { BibEntry } from "@/lib/bibtex";
import type { CitationStyle } from "@/types/researchProject";

/** CSL template ids resolved by citation-js (citeproc backend). */
export const CSL_STYLE_MAP: Record<CitationStyle, string> = {
  apa: "apa",
  mla: "modern-language-association",
  ieee: "ieee",
  chicago: "chicago-author-date",
  acm: "association-for-computing-machinery",
  nature: "nature",
  bibtex: "bibtex",
};

export const EXTENDED_CSL_STYLES = {} as const;

export type ExtendedCitationStyle = CitationStyle;

export function resolveCslTemplate(style: ExtendedCitationStyle): string {
  if (style === "bibtex") return "apa";
  return CSL_STYLE_MAP[style] ?? "apa";
}

/** Format a single BibTeX entry via CSL/citeproc (citation-js). */
export function formatWithCsl(entry: BibEntry, style: ExtendedCitationStyle): string {
  if (style === "bibtex") return entry.raw;
  try {
    const cite = new Cite(entry.raw);
    return cite.format("bibliography", {
      format: "text",
      template: resolveCslTemplate(style),
      lang: "en-US",
    }).trim();
  } catch {
    return fallbackFormat(entry);
  }
}

/** Format an entire bibliography string. */
export function formatBibliographyWithCsl(bibRaw: string, style: ExtendedCitationStyle): string[] {
  if (!bibRaw.trim()) return [];
  if (style === "bibtex") {
    return bibRaw
      .split(/\n(?=@)/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  try {
    const cite = new Cite(bibRaw);
    const out = cite.format("bibliography", {
      format: "text",
      template: resolveCslTemplate(style),
      lang: "en-US",
    });
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Convert BibEntry to CSL-JSON for external tooling. */
export function bibEntryToCslJson(entry: BibEntry): Record<string, unknown> {
  try {
    const cite = new Cite(entry.raw);
    const data = cite.get({ type: "json" }) as Record<string, unknown>[];
    return data[0] ?? {};
  } catch {
    return { id: entry.key, type: entry.type, title: entry.title, author: entry.author };
  }
}

function fallbackFormat(entry: BibEntry): string {
  const authors = entry.author ?? "Unknown";
  const year = entry.year ?? "n.d.";
  const title = entry.title ?? entry.key;
  return `${authors} (${year}). ${title}.`;
}
