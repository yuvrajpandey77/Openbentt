import type { BibEntry } from "@/lib/bibtex";
import type { CorpusChunk, ResearchPaper } from "@/types/researchProject";
import { buildTfidfIndex, type TfidfIndex } from "@/lib/research/corpusIndex";
import type { GraphEdge, GraphNode } from "@/lib/citationGraph";

const STOP = new Set(
  "research study results method using based paper analysis approach proposed show demonstrate find suggest however therefore thus".split(
    " "
  )
);

const CLAIM_PATTERNS =
  /\b(we (show|demonstrate|find|propose|argue|observe|report|establish|prove)|results (show|indicate|suggest)|findings (suggest|indicate)|significant(ly)?)\b/i;

const METHOD_PATTERNS =
  /\b(experiment|survey|dataset|benchmark|randomized|controlled|regression|classification|neural|transformer|ablation|evaluation|participants|sample size)\b/i;

const NEGATION_PAIRS: Array<[RegExp, RegExp]> = [
  [/\bincrease[sd]?\b/i, /\bdecrease[sd]?\b/i],
  [/\beffective\b/i, /\bineffective\b/i],
  [/\bimprove[sd]?\b/i, /\bworsen[sd]?\b/i],
  [/\bpositive\b/i, /\bnegative\b/i],
  [/\bsignificant\b/i, /\bnot significant\b/i],
];

export interface ExtractedTopic {
  term: string;
  score: number;
  paperIds: string[];
  provenance: string;
}

export interface PaperCluster {
  id: string;
  label: string;
  paperIds: string[];
  topTerms: string[];
  cohesion: number;
}

export interface ExtractedClaim {
  paperId: string;
  paperTitle: string;
  sentence: string;
  confidence: "high" | "medium" | "low";
  source: "pattern" | "position";
}

export interface MethodologyProfile {
  paperId: string;
  paperTitle: string;
  methods: string[];
  sampleSnippets: string[];
}

export interface ContradictionPair {
  topic: string;
  paperA: string;
  paperB: string;
  claimA: string;
  claimB: string;
  confidence: "medium" | "low";
}

export interface ResearchGap {
  description: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
  relatedTerms: string[];
}

export interface TimelineEntry {
  year: string;
  papers: string[];
  themes: string[];
  evolutionNote: string;
}

export interface SemanticAnalysisReport {
  generatedAt: string;
  topics: ExtractedTopic[];
  clusters: PaperCluster[];
  claims: ExtractedClaim[];
  methodologies: MethodologyProfile[];
  contradictions: ContradictionPair[];
  gaps: ResearchGap[];
  timeline: TimelineEntry[];
  relatedPapers: Array<{ paperId: string; relatedTo: string; score: number; reason: string }>;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOP.has(w));
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 500);
}

function paperTitle(p: ResearchPaper): string {
  return p.metadata.title ?? p.fileName;
}

/** TF-IDF topic extraction across paper corpus. */
export function extractTopics(papers: ResearchPaper[], limit = 10): ExtractedTopic[] {
  if (papers.length === 0) return [];
  const chunks: CorpusChunk[] = papers.map((p) => ({
    id: p.id,
    paperId: p.id,
    text: p.extractedText.slice(0, 15000),
  }));
  const index = buildTfidfIndex(chunks);
  const termScores = new Map<string, { score: number; papers: Set<string> }>();

  for (const p of papers) {
    const tokens = tokenize(p.extractedText.slice(0, 15000));
    const freq = new Map<string, number>();
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
    const maxTf = Math.max(1, ...freq.values());
    for (const [term, count] of freq) {
      const idf = index.idf.get(term) ?? 1;
      const tfidf = (count / maxTf) * idf;
      const prev = termScores.get(term) ?? { score: 0, papers: new Set<string>() };
      prev.score += tfidf;
      prev.papers.add(p.id);
      termScores.set(term, prev);
    }
  }

  return [...termScores.entries()]
    .filter(([, v]) => v.papers.size >= 1)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([term, v]) => ({
      term,
      score: v.score / papers.length,
      paperIds: [...v.papers],
      provenance: `TF-IDF weight ${(v.score / papers.length).toFixed(2)} across ${v.papers.size} paper(s)`,
    }));
}

/** Greedy paper clustering by shared top terms. */
export function clusterPapers(papers: ResearchPaper[], k = 4): PaperCluster[] {
  if (papers.length < 2) return [];
  const paperTerms = papers.map((p) => ({
    id: p.id,
    title: paperTitle(p),
    terms: new Set(tokenize(p.extractedText.slice(0, 8000)).slice(0, 40)),
  }));

  const clusters: PaperCluster[] = [];
  const assigned = new Set<string>();
  let clusterIdx = 0;

  for (const seed of paperTerms) {
    if (assigned.has(seed.id)) continue;
    const members = [seed.id];
    assigned.add(seed.id);
    for (const other of paperTerms) {
      if (assigned.has(other.id)) continue;
      let overlap = 0;
      for (const t of seed.terms) if (other.terms.has(t)) overlap++;
      if (overlap >= 3) {
        members.push(other.id);
        assigned.add(other.id);
      }
    }
    const shared = [...seed.terms].filter((t) =>
      members.every((mid) => paperTerms.find((p) => p.id === mid)?.terms.has(t))
    );
    const topTerms = shared.length > 0 ? shared.slice(0, 5) : [...seed.terms].slice(0, 5);
    clusters.push({
      id: `cluster-${clusterIdx++}`,
      label: topTerms.slice(0, 2).join(" · ") || seed.title.slice(0, 30),
      paperIds: members,
      topTerms,
      cohesion: members.length / papers.length,
    });
    if (clusters.length >= k) break;
  }
  return clusters;
}

/** Extract claim-like sentences (pattern-based, no LLM). */
export function extractClaims(papers: ResearchPaper[], limit = 20): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];
  for (const p of papers) {
    const sents = sentences(p.extractedText.slice(0, 20000));
    for (const s of sents) {
      if (CLAIM_PATTERNS.test(s)) {
        claims.push({
          paperId: p.id,
          paperTitle: paperTitle(p),
          sentence: s.slice(0, 320),
          confidence: s.length > 80 ? "high" : "medium",
          source: "pattern",
        });
      }
    }
  }
  return claims.slice(0, limit);
}

/** Extract methodology mentions per paper. */
export function compareMethodologies(papers: ResearchPaper[]): MethodologyProfile[] {
  return papers.map((p) => {
    const sents = sentences(p.extractedText.slice(0, 25000));
    const methodSents = sents.filter((s) => METHOD_PATTERNS.test(s));
    const methods = [...new Set(methodSents.flatMap((s) => {
      const m = s.match(METHOD_PATTERNS);
      return m ? [m[0].toLowerCase()] : [];
    }))];
    return {
      paperId: p.id,
      paperTitle: paperTitle(p),
      methods,
      sampleSnippets: methodSents.slice(0, 3).map((s) => s.slice(0, 200)),
    };
  });
}

/** Detect potential contradictions via opposing term pairs in same topic context. */
export function detectContradictions(papers: ResearchPaper[], topics: ExtractedTopic[]): ContradictionPair[] {
  const pairs: ContradictionPair[] = [];
  for (const topic of topics.slice(0, 5)) {
    const relevant = papers.filter((p) => topic.paperIds.includes(p.id));
    if (relevant.length < 2) continue;
    for (let i = 0; i < relevant.length; i++) {
      for (let j = i + 1; j < relevant.length; j++) {
        const textA = relevant[i].extractedText.toLowerCase();
        const textB = relevant[j].extractedText.toLowerCase();
        for (const [pos, neg] of NEGATION_PAIRS) {
          if ((pos.test(textA) && neg.test(textB)) || (neg.test(textA) && pos.test(textB))) {
            const claimA = sentences(relevant[i].extractedText).find((s) => pos.test(s) || neg.test(s))?.slice(0, 200) ?? "";
            const claimB = sentences(relevant[j].extractedText).find((s) => pos.test(s) || neg.test(s))?.slice(0, 200) ?? "";
            pairs.push({
              topic: topic.term,
              paperA: paperTitle(relevant[i]),
              paperB: paperTitle(relevant[j]),
              claimA,
              claimB,
              confidence: "low",
            });
          }
        }
      }
    }
  }
  return pairs.slice(0, 8);
}

/** Research gaps: terms in corpus but absent from draft, or underrepresented years. */
export function detectResearchGaps(
  papers: ResearchPaper[],
  draftTex: string,
  topics: ExtractedTopic[]
): ResearchGap[] {
  const gaps: ResearchGap[] = [];
  const draftLower = draftTex.toLowerCase();

  for (const t of topics.slice(0, 8)) {
    if (!draftLower.includes(t.term) && t.paperIds.length >= 2) {
      gaps.push({
        description: `Topic "${t.term}" appears in ${t.paperIds.length} library papers but not in your draft.`,
        evidence: t.provenance,
        confidence: "medium",
        relatedTerms: [t.term],
      });
    }
  }

  const years = papers.map((p) => p.metadata.year).filter(Boolean) as string[];
  if (years.length >= 3) {
    const sorted = [...new Set(years)].sort();
    const newest = sorted[sorted.length - 1];
    const draftYear = draftLower.match(/\b(20\d{2})\b/)?.[1];
    if (newest && (!draftYear || parseInt(newest) > parseInt(draftYear) + 1)) {
      gaps.push({
        description: `Library includes work through ${newest}; draft may not cover recent developments.`,
        evidence: `${years.length} papers span ${sorted[0]}–${newest}`,
        confidence: "low",
        relatedTerms: [],
      });
    }
  }

  if (papers.length < 3) {
    gaps.push({
      description: "Small corpus — add more related PDFs for reliable gap detection.",
      evidence: `${papers.length} paper(s) in library`,
      confidence: "high",
      relatedTerms: [],
    });
  }

  return gaps;
}

/** Timeline with per-year themes. */
export function buildTimeline(papers: ResearchPaper[], topics: ExtractedTopic[]): TimelineEntry[] {
  const years = [...new Set(papers.map((p) => p.metadata.year).filter(Boolean) as string[])].sort();
  return years.map((year) => {
    const yearPapers = papers.filter((p) => p.metadata.year === year);
    const titles = yearPapers.map(paperTitle);
    const yearTopics = topics
      .filter((t) => t.paperIds.some((id) => yearPapers.some((p) => p.id === id)))
      .slice(0, 4)
      .map((t) => t.term);
    const prevCount = papers.filter((p) => p.metadata.year && p.metadata.year < year).length;
    const evolutionNote =
      prevCount === 0
        ? "Corpus starts in this year."
        : `${yearPapers.length} paper(s); themes: ${yearTopics.join(", ") || "general"}.`;
    return { year, papers: titles, themes: yearTopics, evolutionNote };
  });
}

/** Related paper discovery via shared topics and title token overlap. */
export function discoverRelatedPapers(
  papers: ResearchPaper[],
  topics: ExtractedTopic[]
): Array<{ paperId: string; relatedTo: string; score: number; reason: string }> {
  const related: Array<{ paperId: string; relatedTo: string; score: number; reason: string }> = [];
  for (let i = 0; i < papers.length; i++) {
    for (let j = i + 1; j < papers.length; j++) {
      const sharedTopics = topics.filter(
        (t) => t.paperIds.includes(papers[i].id) && t.paperIds.includes(papers[j].id)
      );
      if (sharedTopics.length === 0) continue;
      const score = sharedTopics.reduce((s, t) => s + t.score, 0) / sharedTopics.length;
      related.push({
        paperId: papers[i].id,
        relatedTo: papers[j].id,
        score,
        reason: `Shared topics: ${sharedTopics.map((t) => t.term).join(", ")}`,
      });
    }
  }
  return related.sort((a, b) => b.score - a.score).slice(0, 12);
}

/** Citation graph analysis from bib entries — co-citation and author links. */
export function analyzeCitationGraph(
  entries: BibEntry[],
  externalNodes?: GraphNode[],
  externalEdges?: GraphEdge[]
): { nodes: GraphNode[]; edges: GraphEdge[]; metrics: Record<string, number> } {
  const nodes: GraphNode[] = entries.map((e) => ({
    id: e.key,
    label: e.title || e.key,
    doi: e.doi,
  }));
  const edges: GraphEdge[] = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      const authorOverlap =
        a.author && b.author && a.author.split(" and ").some((auth) => b.author!.includes(auth.split(",")[0]?.trim() ?? ""));
      if (authorOverlap) {
        edges.push({ from: a.key, to: b.key, label: "shared author" });
      }
      if (a.year === b.year && a.journal && b.journal && a.journal === b.journal) {
        edges.push({ from: a.key, to: b.key, label: "same venue/year" });
      }
    }
  }

  if (externalNodes) nodes.push(...externalNodes.filter((n) => !nodes.some((x) => x.id === n.id)));
  if (externalEdges) edges.push(...externalEdges);

  return {
    nodes,
    edges,
    metrics: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      avgDegree: nodes.length > 0 ? (edges.length * 2) / nodes.length : 0,
    },
  };
}

/** Full semantic analysis pipeline (local, no LLM). */
export function runSemanticAnalysis(
  papers: ResearchPaper[],
  draftTex: string,
  bibEntries: BibEntry[] = []
): SemanticAnalysisReport {
  const topics = extractTopics(papers);
  const clusters = clusterPapers(papers);
  const claims = extractClaims(papers);
  const methodologies = compareMethodologies(papers);
  const contradictions = detectContradictions(papers, topics);
  const gaps = detectResearchGaps(papers, draftTex, topics);
  const timeline = buildTimeline(papers, topics);
  const relatedPapers = discoverRelatedPapers(papers, topics);

  return {
    generatedAt: new Date().toISOString(),
    topics,
    clusters,
    claims,
    methodologies,
    contradictions,
    gaps,
    timeline,
    relatedPapers,
  };
}
