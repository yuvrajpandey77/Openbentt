import { useEffect, useState } from "react";
import { knowledgeApi } from "@/lib/research/knowledgeApi";
import type { Evidence, KnowledgeEntity, Relationship } from "@/lib/knowledge/types";
import { EvidenceList } from "@/components/knowledge/EvidenceList";
import { RelationshipList } from "@/components/knowledge/RelationshipList";

/** Entity inspection: name/type/aliases/identifiers/properties/relationships/evidence. */
export function EntityPanel({ entityId, onSelect }: { entityId: string; onSelect?: (id: string) => void }) {
  const [entity, setEntity] = useState<KnowledgeEntity | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const [e, rels, ev] = await Promise.all([
          knowledgeApi.resolveEntity(entityId),
          knowledgeApi.listRelationships(entityId, { limit: 30 }),
          knowledgeApi.getEvidenceFor("entity", entityId),
        ]);
        if (cancelled) return;
        setEntity(e);
        setRelationships(rels);
        setEvidence(ev);
      } catch {
        if (!cancelled) setError("Could not load this entity.");
      }
    })();
    return () => { cancelled = true; };
  }, [entityId]);

  if (error) return <p role="alert">{error}</p>;
  if (!entity) return <p aria-live="polite">Loading entity…</p>;

  const names = new Map<string, KnowledgeEntity>([[entity.id, entity]]);
  return (
    <section aria-label={`Entity: ${entity.canonicalName}`}>
      <h2>{entity.canonicalName}</h2>
      <p>{entity.type} · {entity.status}</p>
      {entity.description ? <p>{entity.description}</p> : null}
      {entity.aliases.length ? (
        <p>Also known as: {entity.aliases.join(", ")}</p>
      ) : null}
      {entity.externalIds.length ? (
        <ul aria-label="External identifiers">
          {entity.externalIds.map((x) => (
            <li key={`${x.namespace}:${x.value}`}><code>{x.namespace}:{x.value}</code></li>
          ))}
        </ul>
      ) : null}
      <h3>Relationships</h3>
      <RelationshipList relationships={relationships} entitiesById={names} onSelect={onSelect} />
      <h3>Evidence</h3>
      <EvidenceList evidence={evidence} />
    </section>
  );
}
