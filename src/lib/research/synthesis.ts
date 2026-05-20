import type { ResearchPaper } from "@/types/researchProject";
import type { BibEntry } from "@/lib/bibtex";
import {
  runSemanticAnalysis,
  type SemanticAnalysisReport,
} from "@/lib/research/semanticEngine";

export interface SynthesisTheme {
  theme: string;
  papers: string[];
  summary: string;
}

export interface SynthesisReport extends SemanticAnalysisReport {
  paperCount: number;
  themes: SynthesisTheme[];
  gaps: string[];
  markdown: string;
}

/** Cross-paper synthesis powered by semantic engine (TF-IDF topics, clustering, gaps, timeline). */
export function buildCrossPaperSynthesis(
  papers: ResearchPaper[],
  draftTex = "",
  bibEntries: BibEntry[] = []
): SynthesisReport {
  const analysis = runSemanticAnalysis(papers, draftTex, bibEntries);
  const generatedAt = analysis.generatedAt;

  if (papers.length === 0) {
    return {
      ...analysis,
      paperCount: 0,
      themes: [],
      gaps: ["Upload PDFs to the library to run synthesis."],
      timeline: [],
      markdown: "# Cross-paper synthesis\n\nNo papers in project yet.\n",
    };
  }

  const themes: SynthesisTheme[] = analysis.topics
    .filter((t) => t.paperIds.length >= 2)
    .slice(0, 8)
    .map((t) => ({
      theme: t.term,
      papers: t.paperIds.map((id) => papers.find((p) => p.id === id)?.metadata.title ?? id),
      summary: t.provenance,
    }));

  const gaps = analysis.gaps.map((g) => `${g.description} (${g.confidence} confidence — ${g.evidence})`);

  let md = `# Cross-paper synthesis\n\n_${papers.length} papers · ${generatedAt}_\n\n`;
  md += "## Themes (TF-IDF extraction)\n\n";
  for (const t of themes) {
    md += `### ${t.theme}\n${t.summary}\n\nPapers: ${t.papers.join("; ")}\n\n`;
  }

  if (analysis.clusters.length > 0) {
    md += "## Paper clusters\n\n";
    for (const c of analysis.clusters) {
      md += `- **${c.label}** (${c.paperIds.length} papers, cohesion ${(c.cohesion * 100).toFixed(0)}%)\n`;
    }
    md += "\n";
  }

  if (analysis.claims.length > 0) {
    md += "## Extracted claims\n\n";
    for (const c of analysis.claims.slice(0, 6)) {
      md += `- *${c.paperTitle}*: "${c.sentence.slice(0, 160)}…"\n`;
    }
    md += "\n";
  }

  if (analysis.contradictions.length > 0) {
    md += "## Potential contradictions (verify manually)\n\n";
    for (const c of analysis.contradictions) {
      md += `- **${c.topic}**: ${c.paperA} vs ${c.paperB}\n`;
    }
    md += "\n";
  }

  md += "## Research gaps\n\n";
  for (const g of gaps) md += `- ${g}\n`;

  md += "\n## Timeline evolution\n\n";
  for (const row of analysis.timeline) {
    md += `- **${row.year}**: ${row.papers.join(", ")}\n  _${row.evolutionNote}_\n`;
  }

  if (analysis.relatedPapers.length > 0) {
    md += "\n## Related paper pairs\n\n";
    for (const r of analysis.relatedPapers.slice(0, 6)) {
      const a = papers.find((p) => p.id === r.paperId);
      const b = papers.find((p) => p.id === r.relatedTo);
      md += `- ${a?.metadata.title ?? r.paperId} ↔ ${b?.metadata.title ?? r.relatedTo}: ${r.reason}\n`;
    }
  }

  return {
    ...analysis,
    paperCount: papers.length,
    themes,
    gaps,
    markdown: md,
  };
}
