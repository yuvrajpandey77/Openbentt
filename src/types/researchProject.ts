import type { BibEntry } from "@/lib/bibtex";
import type { ResearchMemory } from "@/lib/research/researchMemory";

export type CitationStyle = "apa" | "ieee" | "mla" | "chicago" | "bibtex" | "acm" | "nature";

export type TargetVenue = "generic" | "ieee" | "acm" | "nature" | "arxiv";

export type PaperReviewStatus = "unread" | "reviewing" | "reviewed";

/** Forensic PDF markup stored per paper (normalized page coords 0–1). */
export type PdfAnnotationKind = "highlight" | "note" | "redaction";

export interface PdfAnnotation {
  id: string;
  page: number;
  /** Normalized rect relative to page viewport at creation time. */
  rect: { x: number; y: number; w: number; h: number };
  kind: PdfAnnotationKind;
  color?: string;
  text?: string;
  createdAt: string;
}

export type ProjectFileKind = "tex" | "bib" | "sty" | "asset" | "other";

/** Custom folder taxonomy for the project file tree (desktop). */
export type ProjectFolderKind = "system" | "custom";

export interface ProjectFolder {
  id: string;
  label: string;
  /** Parent folder id; omit for root-level folders. */
  parentId?: string;
  kind: ProjectFolderKind;
  /** Sort order among siblings. */
  order: number;
  /** When set, folder holds papers with matching tag or path prefix. */
  pathPrefix?: string;
}

/** Extra LaTeX/support files in the project tree (desktop). */
export interface ProjectFile {
  id: string;
  /** Virtual path, e.g. `chapters/intro.tex` or `figures/README.md` */
  path: string;
  kind: ProjectFileKind;
  content: string;
  addedAt: string;
  updatedAt: string;
}

export interface ResearchPaper {
  id: string;
  fileName: string;
  addedAt: string;
  extractedText: string;
  pageCount?: number;
  metadata: {
    title?: string;
    authors?: string;
    year?: string;
    doi?: string;
  };
  /** PDF review annotations extracted at upload (local parse). */
  reviewNotes?: string[];
  /** Proofreading queue state (desktop notebook). */
  reviewStatus?: PaperReviewStatus;
  lastReviewedPage?: number;
  reviewedAt?: string;
  /** Page number → note text */
  pageNotes?: Record<number, string>;
  /** Forensic highlights / notes on PDF pages */
  annotations?: PdfAnnotation[];
}

export interface CaptionSuggestion {
  label: string;
  caption: string;
  kind?: "figure" | "table";
}

export interface CorpusChunk {
  id: string;
  paperId: string | "draft";
  text: string;
  pageHint?: number;
}

export interface SimilarityHit {
  chunkId: string;
  paperId: string;
  paperName: string;
  snippet: string;
  score: number;
  pageHint?: number;
  /** lexical TF-IDF | semantic MiniLM | hybrid fusion */
  method?: "lexical" | "semantic" | "hybrid" | "tfidf";
  lexicalScore?: number;
  semanticScore?: number;
  fusedScore?: number;
  confidence?: "high" | "medium" | "low";
  provenance?: string;
}

export interface CitationIssue {
  kind: "missing_bib" | "unused_bib" | "missing_cite" | "style_hint" | "duplicate" | "invalid_doi";
  key?: string;
  message: string;
  severity?: "error" | "warning" | "info";
}

export interface RevisionSuggestion {
  id: string;
  source: "reviewer" | "ai";
  original: string;
  suggested: string;
  status: "pending" | "accepted" | "rejected";
  lineHint?: number;
  createdAt?: string;
}

export interface RevisionHistoryEntry {
  id: string;
  suggestionId: string;
  action: "created" | "accepted" | "rejected";
  summary: string;
  at: string;
}

export interface ModelAttribution {
  id: string;
  model: string;
  section: string;
  appliedAt: string;
}

export interface SubmissionCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ResearchProjectData {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  targetVenue: TargetVenue;
  linkedThreadIds: string[];
  draftTex: string;
  bibliography: string;
  bibEntries: BibEntry[];
  papers: ResearchPaper[];
  chunks: CorpusChunk[];
  /** MiniLM vectors keyed by corpus chunk id (built in Notebook → Similarity). */
  chunkEmbeddings?: Record<string, number[]>;
  /** Long-term semantic memory: papers, citations, terms, thesis structure. */
  researchMemory?: ResearchMemory;
  revisionSuggestions: RevisionSuggestion[];
  revisionHistory?: RevisionHistoryEntry[];
  modelAttributions: ModelAttribution[];
  abstractVariants: string[];
  keywordSuggestions: string[];
  captionSuggestions: CaptionSuggestion[];
  /** Additional .tex / support files in project tree */
  projectFiles?: ProjectFile[];
  /** Custom folder taxonomy; migrated from defaults when absent. */
  folders?: ProjectFolder[];
}

export interface ResearchProjectSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  paperCount: number;
}
