import type { BibEntry } from "@/lib/bibtex";
import { parseBibtex } from "@/lib/bibtex";

export interface CrossrefWork {
  doi?: string;
  title?: string;
  authors?: string;
  year?: string;
  journal?: string;
  publisher?: string;
  url?: string;
  type?: string;
  volume?: string;
  issue?: string;
  page?: string;
  issn?: string;
  isValid: boolean;
  source: "crossref";
}

export interface DoiLookupResult {
  doi: string;
  found: boolean;
  work?: CrossrefWork;
  error?: string;
}

const DOI_RE = /^10\.\d{4,9}\/[^\s"<>]+$/i;

export function normalizeDoi(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let d = raw.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  d = d.replace(/[.,;)\]}>]+$/, "");
  return d || undefined;
}

export function isValidDoiFormat(doi: string): boolean {
  return DOI_RE.test(doi.trim());
}

function formatAuthors(authors?: Array<{ given?: string; family?: string; name?: string }>): string | undefined {
  if (!authors?.length) return undefined;
  return authors
    .map((a) => {
      if (a.name) return a.name;
      const parts = [a.family, a.given].filter(Boolean);
      return parts.join(", ");
    })
    .join(" and ");
}

function crossrefTypeToBib(type?: string): string {
  switch (type) {
    case "journal-article":
      return "article";
    case "proceedings-article":
      return "inproceedings";
    case "book":
      return "book";
    case "book-chapter":
      return "incollection";
    default:
      return "misc";
  }
}

/** Fetch metadata from Crossref REST API (no API key required for polite pool). */
export async function lookupDoi(doi: string, signal?: AbortSignal): Promise<DoiLookupResult> {
  const normalized = normalizeDoi(doi);
  if (!normalized) return { doi: doi, found: false, error: "Empty DOI" };
  if (!isValidDoiFormat(normalized)) return { doi: normalized, found: false, error: "Invalid DOI format" };

  try {
    const apiUrl = `https://api.crossref.org/works/${encodeURIComponent(normalized)}`;
    const res = await fetch(apiUrl, {
      signal,
      headers: { Accept: "application/json", "User-Agent": "OpenBenTT/2.0 (mailto:openbentt-contributors@users.noreply.github.com)" },
    });
    if (res.status === 404) return { doi: normalized, found: false, error: "DOI not found in Crossref" };
    if (!res.ok) return { doi: normalized, found: false, error: `Crossref HTTP ${res.status}` };

    const json = (await res.json()) as { message?: Record<string, unknown> };
    const msg = json.message ?? {};
    const titleArr = msg.title as string[] | undefined;
    const title = titleArr?.[0];
    const authors = formatAuthors(msg.author as Array<{ given?: string; family?: string; name?: string }>);
    const issued = msg.issued as { "date-parts"?: number[][] } | undefined;
    const year = issued?.["date-parts"]?.[0]?.[0]?.toString();
    const container = msg["container-title"] as string[] | undefined;
    const journal = container?.[0];
    const publisher = msg.publisher as string | undefined;
    const workUrl = msg.URL as string | undefined;
    const type = msg.type as string | undefined;

    const work: CrossrefWork = {
      doi: normalized,
      title,
      authors,
      year,
      journal,
      publisher,
      url: workUrl,
      type,
      volume: (msg.volume as string) ?? undefined,
      issue: (msg.issue as string) ?? undefined,
      page: (msg.page as string) ?? undefined,
      isValid: true,
      source: "crossref",
    };
    return { doi: normalized, found: true, work };
  } catch (e) {
    return {
      doi: normalized,
      found: false,
      error: e instanceof Error ? e.message : "Crossref lookup failed",
    };
  }
}

/** Build BibTeX entry from Crossref metadata. */
export function bibEntryFromCrossref(key: string, work: CrossrefWork): BibEntry {
  const type = crossrefTypeToBib(work.type);
  const lines = [
    `@${type}{${key},`,
    work.title ? `  title={${work.title}},` : "",
    work.authors ? `  author={${work.authors}},` : "",
    work.year ? `  year={${work.year}},` : "",
    work.journal ? `  journal={${work.journal}},` : "",
    work.doi ? `  doi={${work.doi}},` : "",
    work.url ? `  url={${work.url}},` : "",
    work.volume ? `  volume={${work.volume}},` : "",
    work.issue ? `  number={${work.issue}},` : "",
    work.page ? `  pages={${work.page}},` : "",
    "}",
  ].filter(Boolean);
  const raw = lines.join("\n");
  return parseBibtex(raw)[0] ?? {
    key,
    type,
    title: work.title,
    author: work.authors,
    year: work.year,
    doi: work.doi,
    url: work.url,
    journal: work.journal,
    raw,
  };
}

/** Merge Crossref metadata into an existing entry (fills missing fields only). */
export function mergeCrossrefIntoEntry(entry: BibEntry, work: CrossrefWork): BibEntry {
  const merged = {
    ...entry,
    title: entry.title || work.title,
    author: entry.author || work.authors,
    year: entry.year || work.year,
    doi: entry.doi || work.doi,
    url: entry.url || work.url,
    journal: entry.journal || work.journal,
  };
  const raw = `@${merged.type}{${merged.key},
  title={${merged.title ?? ""}},
  author={${merged.author ?? ""}},
  year={${merged.year ?? ""}},
  ${merged.journal ? `journal={${merged.journal}},` : ""}
  ${merged.doi ? `doi={${merged.doi}},` : ""}
  ${merged.url ? `url={${merged.url}},` : ""}
}`;
  return parseBibtex(raw)[0] ?? { ...merged, raw };
}
