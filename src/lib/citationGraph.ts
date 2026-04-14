import type { BibEntry } from "@/lib/bibtex";

export interface GraphNode {
  id: string;
  label: string;
  doi?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface CitationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Build a simple graph from bibliography: sequential chain + DOI lookup edges from Semantic Scholar when possible. */
export async function buildCitationGraphFromBib(entries: BibEntry[], signal?: AbortSignal): Promise<CitationGraph> {
  const nodes: GraphNode[] = entries.map((e) => ({
    id: e.key,
    label: e.title || e.key,
    doi: e.doi,
  }));
  const edges: GraphEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i].id, to: nodes[i + 1].id, label: "library order" });
  }

  const withDoi = entries.filter((e) => e.doi?.trim());
  for (const e of withDoi.slice(0, 5)) {
    try {
      const u = new URL("https://api.semanticscholar.org/graph/v1/paper/DOI:" + encodeURIComponent(e.doi!.trim()));
      u.searchParams.set(
        "fields",
        "title,citations.title,citations.paperId,references.title,references.paperId"
      );
      const res = await fetch(u.toString(), { signal, mode: "cors" });
      if (!res.ok) continue;
      const paper = (await res.json()) as {
        citations?: Array<{ title?: string; paperId?: string }>;
        references?: Array<{ title?: string; paperId?: string }>;
      };
      const cites = paper.citations ?? [];
      for (const c of cites.slice(0, 4)) {
        if (!c.paperId) continue;
        const nid = `s2:${c.paperId}`;
        if (!nodes.some((n) => n.id === nid)) {
          nodes.push({ id: nid, label: c.title || c.paperId });
        }
        edges.push({ from: e.key, to: nid, label: "cites" });
      }
      const refs = paper.references ?? [];
      for (const r of refs.slice(0, 4)) {
        if (!r.paperId) continue;
        const nid = `s2:${r.paperId}`;
        if (!nodes.some((n) => n.id === nid)) {
          nodes.push({ id: nid, label: r.title || r.paperId });
        }
        edges.push({ from: e.key, to: nid, label: "references" });
      }
    } catch {
      /* skip */
    }
  }

  return { nodes, edges };
}
