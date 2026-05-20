import type { BibEntry } from "@/lib/bibtex";
import { parseBibtex } from "@/lib/bibtex";
import type { CitationIssue, CitationStyle } from "@/types/researchProject";
import { formatWithCsl, type ExtendedCitationStyle } from "@/lib/research/cslEngine";
import {
  isValidDoiFormat,
  lookupDoi,
  normalizeDoi,
  mergeCrossrefIntoEntry,
  type CrossrefWork,
} from "@/lib/research/crossrefClient";

export function extractCiteKeysFromTex(tex: string): string[] {
  const keys = new Set<string>();
  const re = /\\cite[a-z*]*\{([^}]+)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tex)) !== null) {
    m[1].split(",").forEach((k) => {
      const t = k.trim();
      if (t) keys.add(t);
    });
  }
  return [...keys];
}

const REQUIRED_FIELDS: Record<string, string[]> = {
  article: ["title", "author", "year"],
  inproceedings: ["title", "author", "year", "booktitle"],
  book: ["title", "author", "year"],
  misc: ["title"],
};

function missingFields(entry: BibEntry): string[] {
  const req = REQUIRED_FIELDS[entry.type] ?? REQUIRED_FIELDS.article;
  const missing: string[] = [];
  for (const f of req) {
    const val = entry[f as keyof BibEntry];
    if (!val || (typeof val === "string" && !val.trim())) missing.push(f);
  }
  return missing;
}

export function lintBibliographyHealth(bibRaw: string): CitationIssue[] {
  const issues: CitationIssue[] = [];
  const entries = parseBibtex(bibRaw);
  const keysSeen = new Map<string, number>();
  const doisSeen = new Map<string, string>();

  for (const e of entries) {
    keysSeen.set(e.key, (keysSeen.get(e.key) ?? 0) + 1);
    const missing = missingFields(e);
    if (missing.length > 0) {
      issues.push({
        kind: "missing_cite",
        key: e.key,
        message: `"${e.key}" missing fields: ${missing.join(", ")}.`,
      });
    }
    const doi = normalizeDoi(e.doi);
    if (doi) {
      if (!isValidDoiFormat(doi)) {
        issues.push({
          kind: "style_hint",
          key: e.key,
          message: `"${e.key}" has malformed DOI: ${doi}`,
        });
      } else if (doisSeen.has(doi)) {
        issues.push({
          kind: "style_hint",
          key: e.key,
          message: `Duplicate DOI ${doi} (also in "${doisSeen.get(doi)}").`,
        });
      } else {
        doisSeen.set(doi, e.key);
      }
    }
  }

  for (const [key, count] of keysSeen) {
    if (count > 1) {
      issues.push({
        kind: "style_hint",
        key,
        message: `Duplicate cite key "${key}" appears ${count} times.`,
      });
    }
  }

  if (entries.length === 0 && bibRaw.trim()) {
    issues.push({ kind: "style_hint", message: "Bibliography text present but no valid @entries parsed." });
  }

  return issues;
}

export function lintCitations(tex: string, bibRaw: string): CitationIssue[] {
  const issues: CitationIssue[] = lintBibliographyHealth(bibRaw);
  const entries = parseBibtex(bibRaw);
  const bibKeys = new Set(entries.map((e) => e.key));
  const citeKeys = extractCiteKeysFromTex(tex);

  for (const k of citeKeys) {
    if (!bibKeys.has(k)) {
      issues.push({ kind: "missing_bib", key: k, message: `\\cite{${k}} has no matching BibTeX entry.` });
    }
  }
  for (const e of entries) {
    if (!citeKeys.includes(e.key)) {
      issues.push({
        kind: "unused_bib",
        key: e.key,
        message: `Bibliography entry "${e.key}" is never cited in the draft.`,
      });
    }
  }
  if (!tex.includes("\\bibliography") && !tex.includes("\\begin{thebibliography}")) {
    issues.push({
      kind: "style_hint",
      message: "No \\bibliography or thebibliography block found — add one before compiling references.",
    });
  }
  return issues;
}

/** Format citation via CSL/citeproc (citation-js). Falls back to raw BibTeX. */
export function formatCitation(entry: BibEntry, style: CitationStyle | ExtendedCitationStyle): string {
  return formatWithCsl(entry, style);
}

/** Async DOI validation against Crossref for entries with DOI fields. */
export async function validateDoiEntries(
  entries: BibEntry[],
  signal?: AbortSignal
): Promise<CitationIssue[]> {
  const issues: CitationIssue[] = [];
  const withDoi = entries.filter((e) => normalizeDoi(e.doi));
  for (const e of withDoi.slice(0, 12)) {
    const doi = normalizeDoi(e.doi)!;
    const result = await lookupDoi(doi, signal);
    if (!result.found) {
      issues.push({
        kind: "style_hint",
        key: e.key,
        message: `DOI for "${e.key}" not found: ${result.error ?? doi}`,
      });
    }
  }
  return issues;
}

/** Complete metadata for an entry via Crossref DOI lookup. */
export async function completeMetadataFromDoi(
  entry: BibEntry,
  signal?: AbortSignal
): Promise<{ entry: BibEntry; work?: CrossrefWork; error?: string }> {
  const doi = normalizeDoi(entry.doi);
  if (!doi) return { entry, error: "No DOI on entry" };
  const result = await lookupDoi(doi, signal);
  if (!result.found || !result.work) return { entry, error: result.error ?? "Not found" };
  const merged = mergeCrossrefIntoEntry(entry, result.work);
  return { entry: merged, work: result.work };
}

/** Heuristic metadata from first ~4k chars of PDF extract (fallback when Crossref unavailable). */
export function inferPdfMetadata(extractedText: string): {
  title?: string;
  authors?: string;
  year?: string;
  doi?: string;
} {
  const head = extractedText.slice(0, 4000);
  const doi = head.match(/10\.\d{4,9}\/[^\s"<>]+/)?.[0];
  const year = head.match(/\b(19|20)\d{2}\b/)?.[0];
  const lines = head
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8 && l.length < 200);
  const title = lines[0];
  const authors = lines[1]?.includes(",") || lines[1]?.includes(" and ") ? lines[1] : undefined;
  return { title, authors, year, doi: doi ? normalizeDoi(doi) : undefined };
}

export function bibEntryFromMetadata(
  key: string,
  meta: { title?: string; authors?: string; year?: string; doi?: string },
  type = "article"
): BibEntry {
  const raw = `@${type}{${key},
  title={${meta.title ?? "Untitled"}},
  author={${meta.authors ?? "Unknown"}},
  year={${meta.year ?? ""}},
  ${meta.doi ? `doi={${meta.doi}},` : ""}
}`;
  return parseBibtex(raw)[0] ?? {
    key,
    type,
    title: meta.title,
    author: meta.authors,
    year: meta.year,
    doi: meta.doi,
    raw,
  };
}

export function appendBibEntry(bibRaw: string, entry: BibEntry): string {
  const trimmed = bibRaw.trim();
  return trimmed ? `${trimmed}\n\n${entry.raw}` : entry.raw;
}

/** Suggest cite keys from draft↔bib title overlap and corpus titles. */
export function suggestRelatedKeys(
  tex: string,
  entries: BibEntry[],
  corpusTitles: string[]
): Array<{ key: string; reason: string; confidence: "high" | "medium" | "low" }> {
  const cited = new Set(extractCiteKeysFromTex(tex));
  const lower = tex.toLowerCase();
  const suggestions: Array<{ key: string; reason: string; confidence: "high" | "medium" | "low" }> = [];

  for (const e of entries) {
    if (cited.has(e.key)) continue;
    const title = (e.title ?? "").toLowerCase();
    if (title.length > 10 && lower.includes(title.slice(0, Math.min(24, title.length)))) {
      suggestions.push({
        key: e.key,
        reason: `Draft mentions "${e.title?.slice(0, 40) ?? e.key}"`,
        confidence: "high",
      });
    }
  }
  for (const t of corpusTitles) {
    const tl = t.toLowerCase();
    if (tl.length > 12 && lower.includes(tl.slice(0, 20))) {
      const match = entries.find((e) => (e.title ?? "").toLowerCase().includes(tl.slice(0, 16)));
      if (match && !cited.has(match.key)) {
        suggestions.push({
          key: match.key,
          reason: `Library paper "${t.slice(0, 40)}" referenced in draft text`,
          confidence: "medium",
        });
      }
    }
  }
  const seen = new Set<string>();
  return suggestions
    .filter((s) => {
      if (seen.has(s.key)) return false;
      seen.add(s.key);
      return true;
    })
    .slice(0, 8);
}

export interface BibliographyHealthReport {
  entryCount: number;
  issues: CitationIssue[];
  completenessScore: number;
  duplicateKeys: string[];
  duplicateDois: string[];
  missingFieldCount: number;
}

export function bibliographyHealthReport(bibRaw: string): BibliographyHealthReport {
  const issues = lintBibliographyHealth(bibRaw);
  const entries = parseBibtex(bibRaw);
  const duplicateKeys = issues.filter((i) => i.message.includes("Duplicate cite key")).map((i) => i.key!);
  const duplicateDois = issues.filter((i) => i.message.includes("Duplicate DOI")).map((i) => i.key!);
  const missingFieldCount = issues.filter((i) => i.message.includes("missing fields")).length;
  const maxIssues = Math.max(1, entries.length * 2);
  const completenessScore = Math.max(0, Math.min(1, 1 - issues.length / maxIssues));
  return {
    entryCount: entries.length,
    issues,
    completenessScore,
    duplicateKeys,
    duplicateDois,
    missingFieldCount,
  };
}
