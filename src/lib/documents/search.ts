/**
 * Phase 2 — Minimal global document search over the local registry.
 * Uses the existing TF-IDF-free approach (substring + ranked term overlap) to
 * avoid new backends; corpus RAG remains the ranking authority for chat.
 * Filters: project, type, author, date. No Elasticsearch/Meilisearch.
 */
import { getChunks, listDocuments } from "@/lib/documents/service";
import type { OpenbenttDocument } from "@/lib/documents/types";

export interface DocumentSearchFilters {
  projectId?: string;
  sourceType?: OpenbenttDocument["sourceType"];
  author?: string;
  fromDate?: string;
  toDate?: string;
}

export interface DocumentSearchHit {
  document: OpenbenttDocument;
  snippet: string;
  page?: number;
  sectionId?: string;
  score: number;
}

export function searchDocuments(query: string, filters: DocumentSearchFilters = {}, limit = 20): DocumentSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter((t) => t.length > 1);
  const docs = listDocuments(filters.projectId).filter((d) => {
    if (filters.sourceType && d.sourceType !== filters.sourceType) return false;
    if (filters.author && !(d.metadata.authors?.value ?? "").toLowerCase().includes(filters.author.toLowerCase())) return false;
    if (filters.fromDate && d.createdAt < filters.fromDate) return false;
    if (filters.toDate && d.createdAt > filters.toDate) return false;
    return true;
  });
  const hits: DocumentSearchHit[] = [];
  for (const document of docs) {
    const titleHit = document.title.toLowerCase().includes(q) ? 2 : 0;
    const chunks = getChunks(document.id);
    let best: DocumentSearchHit | null = null;
    for (const c of chunks) {
      const text = c.text.toLowerCase();
      let overlap = 0;
      for (const t of terms) if (text.includes(t)) overlap++;
      if (overlap === 0 && titleHit === 0) continue;
      const idx = text.indexOf(terms[0] ?? q);
      const score = overlap / Math.max(terms.length, 1) + titleHit;
      const snippet = idx >= 0
        ? c.text.slice(Math.max(0, idx - 60), idx + 160)
        : c.text.slice(0, 200);
      if (!best || score > best.score) {
        best = { document, snippet, page: c.page, sectionId: c.sectionId, score };
      }
    }
    if (best) hits.push(best);
    else if (titleHit > 0) hits.push({ document, snippet: document.title, score: titleHit });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
