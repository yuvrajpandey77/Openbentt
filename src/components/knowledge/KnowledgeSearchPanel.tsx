import { useState } from "react";
import { knowledgeApi } from "@/lib/research/knowledgeApi";
import type { KnowledgeEntity } from "@/lib/knowledge/types";
import { EntityPanel } from "@/components/knowledge/EntityPanel";
import { ConnectorPanel } from "@/components/knowledge/ConnectorPanel";

/**
 * Knowledge search + document bridge (Knowledge ↔ Evidence ↔ Documents).
 * Bounded results; selecting an entity shows inspection with evidence.
 */
export function KnowledgeSearchPanel({ projectId }: { projectId?: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<KnowledgeEntity[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const run = async (q: string): Promise<void> => {
    setQuery(q);
    if (!q.trim()) { setHits([]); return; }
    setSearching(true);
    setError(null);
    try {
      const rows = await knowledgeApi.searchEntities({ query: q, projectId, limit: 20 });
      setHits(rows);
    } catch {
      setError("Knowledge search failed.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <section aria-label="Knowledge graph search">
      <label htmlFor="knowledge-search-input">Search entities, aliases, identifiers</label>
      <input
        id="knowledge-search-input"
        type="search"
        value={query}
        onChange={(e) => void run(e.target.value)}
        placeholder="Person, paper, DOI, alias…"
      />
      {searching ? <p aria-live="polite">Searching…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <ul aria-live="polite">
        {hits.map((h) => (
          <li key={h.id}>
            <button type="button" onClick={() => setSelected(h.id)}>
              {h.canonicalName} · {h.type}
            </button>
          </li>
        ))}
      </ul>
      {selected ? <EntityPanel entityId={selected} onSelect={setSelected} /> : null}
      <ConnectorPanel projectId={projectId} />
    </section>
  );
}
