/**
 * Phase 3 — Bounded graph traversal core (pure; stores feed it edge lists).
 * Cycle-safe via visited sets; depth hard-capped; node-capped. The renderer
 * can never trigger an unbounded query — limits are validated before use.
 */
import { KNOWLEDGE_LIMITS } from "@/lib/knowledge/limits";

export interface TraverseEdge {
  id: string;
  type: string;
  subject: string;
  object: string;
  status: string;
}

export interface TraverseStep {
  edgeId: string;
  type: string;
  from: string;
  to: string;
  depth: number;
}

/**
 * Breadth-first traversal from `start` following edges in both directions
 * (direction recorded per step; RELATED_TO-style symmetric edges included).
 * Only `asserted`/`uncertain` relationships are followed by default.
 */
export function boundedTraverse(
  start: string,
  edges: TraverseEdge[],
  opts?: { depth?: number; limit?: number; statuses?: Set<string> }
): { nodes: string[]; steps: TraverseStep[] } {
  const depth = Math.min(Math.max(opts?.depth ?? 1, 1), KNOWLEDGE_LIMITS.maxTraversalDepth);
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), KNOWLEDGE_LIMITS.maxTraversalNodes);
  const statuses = opts?.statuses ?? new Set(["asserted", "uncertain"]);
  const adj = new Map<string, TraverseEdge[]>();
  for (const e of edges) {
    if (!statuses.has(e.status)) continue;
    if (!adj.has(e.subject)) adj.set(e.subject, []);
    if (!adj.has(e.object)) adj.set(e.object, []);
    adj.get(e.subject)!.push(e);
    if (e.subject !== e.object) adj.get(e.object)!.push(e);
  }
  const visited = new Set<string>([start]);
  const nodes: string[] = [start];
  const steps: TraverseStep[] = [];
  let frontier = [start];
  for (let d = 1; d <= depth; d++) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const e of adj.get(node) ?? []) {
        const other = e.subject === node ? e.object : e.subject;
        steps.push({ edgeId: e.id, type: e.type, from: node, to: other, depth: d });
        if (!visited.has(other) && nodes.length < limit) {
          visited.add(other);
          nodes.push(other);
          next.push(other);
        }
        if (nodes.length >= limit) return { nodes, steps };
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return { nodes, steps };
}
