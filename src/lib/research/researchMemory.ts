import type { BibEntry } from "@/lib/bibtex";
import type { ResearchPaper, RevisionSuggestion } from "@/types/researchProject";

export type MemoryEntityKind =
  | "paper"
  | "author"
  | "term"
  | "section"
  | "citation"
  | "claim"
  | "feedback";

export interface MemoryEntity {
  id: string;
  kind: MemoryEntityKind;
  label: string;
  /** Source paper id, bib key, or section name */
  sourceId?: string;
  metadata?: Record<string, string | number | boolean>;
  embeddingHint?: string;
  updatedAt: string;
}

export interface MemoryEdge {
  id: string;
  from: string;
  to: string;
  relation:
    | "cites"
    | "authored_by"
    | "mentions"
    | "related_to"
    | "contradicts"
    | "supports"
    | "draft_section"
    | "feedback_on";
  weight: number;
  provenance: string;
}

export interface MemoryEvent {
  id: string;
  at: string;
  type: "paper_added" | "bib_updated" | "draft_saved" | "feedback" | "synthesis" | "citation_inserted";
  summary: string;
  entityIds?: string[];
}

export interface ThesisStructure {
  title?: string;
  sections: Array<{ name: string; citeKeys: string[]; terms: string[] }>;
  researchQuestions: string[];
  updatedAt: string;
}

export interface ResearchMemory {
  version: 1;
  updatedAt: string;
  entities: MemoryEntity[];
  edges: MemoryEdge[];
  events: MemoryEvent[];
  thesis: ThesisStructure;
}

function uuid(): string {
  return crypto.randomUUID?.() ?? `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyResearchMemory(): ResearchMemory {
  const now = new Date().toISOString();
  return {
    version: 1,
    updatedAt: now,
    entities: [],
    edges: [],
    events: [],
    thesis: { sections: [], researchQuestions: [], updatedAt: now },
  };
}

function parseTexSections(tex: string): Array<{ name: string; citeKeys: string[] }> {
  const sections: Array<{ name: string; citeKeys: string[] }> = [];
  const parts = tex.split(/\\section\*?\{/);
  for (let i = 1; i < parts.length; i++) {
    const nameEnd = parts[i].indexOf("}");
    if (nameEnd < 0) continue;
    const name = parts[i].slice(0, nameEnd);
    const body = parts[i].slice(nameEnd + 1);
    const citeKeys: string[] = [];
    const re = /\\cite[a-z*]*\{([^}]+)\}/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      m[1].split(",").forEach((k) => {
        const t = k.trim();
        if (t) citeKeys.push(t);
      });
    }
    sections.push({ name, citeKeys });
  }
  return sections;
}

function extractTerms(text: string, limit = 12): string[] {
  const stop = new Set(["section", "document", "begin", "abstract", "introduction"]);
  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (w.length < 5 || stop.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

/** Rebuild research memory from current project state (deterministic, local). */
export function rebuildResearchMemory(input: {
  papers: ResearchPaper[];
  bibliography: string;
  bibEntries: BibEntry[];
  draftTex: string;
  revisionSuggestions?: RevisionSuggestion[];
  previous?: ResearchMemory;
}): ResearchMemory {
  const now = new Date().toISOString();
  const base = input.previous ?? emptyResearchMemory();
  const entities: MemoryEntity[] = [];
  const edges: MemoryEdge[] = [];
  const events: MemoryEvent[] = [...base.events].slice(-50);

  for (const p of input.papers) {
    entities.push({
      id: `paper:${p.id}`,
      kind: "paper",
      label: p.metadata.title ?? p.fileName,
      sourceId: p.id,
      metadata: {
        year: p.metadata.year ?? "",
        doi: p.metadata.doi ?? "",
        fileName: p.fileName,
      },
      embeddingHint: p.extractedText.slice(0, 512),
      updatedAt: p.addedAt,
    });
    if (p.metadata.authors) {
      for (const author of p.metadata.authors.split(/\band\b|,/)) {
        const name = author.trim();
        if (!name) continue;
        const authorId = `author:${name.toLowerCase().replace(/\s+/g, "-")}`;
        if (!entities.some((e) => e.id === authorId)) {
          entities.push({ id: authorId, kind: "author", label: name, updatedAt: now });
        }
        edges.push({
          id: uuid(),
          from: `paper:${p.id}`,
          to: authorId,
          relation: "authored_by",
          weight: 1,
          provenance: "PDF metadata",
        });
      }
    }
  }

  for (const e of input.bibEntries) {
    entities.push({
      id: `cite:${e.key}`,
      kind: "citation",
      label: e.title ?? e.key,
      sourceId: e.key,
      metadata: { doi: e.doi ?? "", year: e.year ?? "" },
      updatedAt: now,
    });
    if (e.author) {
      for (const author of e.author.split(/\band\b|,/)) {
        const name = author.trim();
        if (!name) continue;
        const authorId = `author:${name.toLowerCase().replace(/\s+/g, "-")}`;
        if (!entities.some((ent) => ent.id === authorId)) {
          entities.push({ id: authorId, kind: "author", label: name, updatedAt: now });
        }
        edges.push({
          id: uuid(),
          from: `cite:${e.key}`,
          to: authorId,
          relation: "authored_by",
          weight: 0.9,
          provenance: "BibTeX",
        });
      }
    }
  }

  const sections = parseTexSections(input.draftTex);
  const thesisSections = sections.map((s) => ({
    name: s.name,
    citeKeys: s.citeKeys,
    terms: extractTerms(s.name),
  }));

  for (const s of thesisSections) {
    const secId = `section:${s.name.toLowerCase().replace(/\s+/g, "-")}`;
    entities.push({
      id: secId,
      kind: "section",
      label: s.name,
      metadata: { citeCount: s.citeKeys.length },
      updatedAt: now,
    });
    for (const key of s.citeKeys) {
      edges.push({
        id: uuid(),
        from: secId,
        to: `cite:${key}`,
        relation: "cites",
        weight: 1,
        provenance: `Draft \\section{${s.name}}`,
      });
    }
  }

  for (const p of input.papers) {
    for (const term of extractTerms(p.extractedText.slice(0, 6000), 6)) {
      const termId = `term:${term}`;
      if (!entities.some((e) => e.id === termId)) {
        entities.push({ id: termId, kind: "term", label: term, updatedAt: now });
      }
      edges.push({
        id: uuid(),
        from: `paper:${p.id}`,
        to: termId,
        relation: "mentions",
        weight: 0.5,
        provenance: "Corpus TF-IDF terms",
      });
    }
  }

  for (const rev of input.revisionSuggestions ?? []) {
    if (rev.status === "rejected") continue;
    entities.push({
      id: `feedback:${rev.id}`,
      kind: "feedback",
      label: rev.suggested.slice(0, 80),
      sourceId: rev.id,
      updatedAt: now,
    });
  }

  for (let i = 0; i < input.papers.length; i++) {
    for (let j = i + 1; j < input.papers.length; j++) {
      const a = input.papers[i];
      const b = input.papers[j];
      const termsA = new Set(extractTerms(a.extractedText.slice(0, 8000), 8));
      const overlap = extractTerms(b.extractedText.slice(0, 8000), 8).filter((t) => termsA.has(t));
      if (overlap.length >= 2) {
        edges.push({
          id: uuid(),
          from: `paper:${a.id}`,
          to: `paper:${b.id}`,
          relation: "related_to",
          weight: overlap.length / 8,
          provenance: `Shared terms: ${overlap.join(", ")}`,
        });
      }
    }
  }

  return {
    version: 1,
    updatedAt: now,
    entities,
    edges,
    events,
    thesis: {
      title: input.draftTex.match(/\\title\{([^}]+)\}/)?.[1],
      sections: thesisSections,
      researchQuestions: base.thesis.researchQuestions,
      updatedAt: now,
    },
  };
}

export function appendMemoryEvent(
  memory: ResearchMemory,
  type: MemoryEvent["type"],
  summary: string,
  entityIds?: string[]
): ResearchMemory {
  const event: MemoryEvent = { id: uuid(), at: new Date().toISOString(), type, summary, entityIds };
  return {
    ...memory,
    updatedAt: event.at,
    events: [...memory.events, event].slice(-100),
  };
}

export function getMemoryNeighbors(
  memory: ResearchMemory,
  entityId: string,
  relation?: MemoryEdge["relation"]
): Array<{ entity: MemoryEntity; edge: MemoryEdge }> {
  const matches = memory.edges.filter(
    (e) => (e.from === entityId || e.to === entityId) && (!relation || e.relation === relation)
  );
  return matches
    .map((edge) => {
      const otherId = edge.from === entityId ? edge.to : edge.from;
      const entity = memory.entities.find((e) => e.id === otherId);
      return entity ? { entity, edge } : null;
    })
    .filter(Boolean) as Array<{ entity: MemoryEntity; edge: MemoryEdge }>;
}

export function memoryGraphSummary(memory: ResearchMemory): {
  entityCount: number;
  edgeCount: number;
  paperCount: number;
  citationCount: number;
  termCount: number;
} {
  return {
    entityCount: memory.entities.length,
    edgeCount: memory.edges.length,
    paperCount: memory.entities.filter((e) => e.kind === "paper").length,
    citationCount: memory.entities.filter((e) => e.kind === "citation").length,
    termCount: memory.entities.filter((e) => e.kind === "term").length,
  };
}
