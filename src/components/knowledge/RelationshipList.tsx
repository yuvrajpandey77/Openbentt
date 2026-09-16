import type { KnowledgeEntity, Relationship } from "@/lib/knowledge/types";

/** Bounded relationship list: subject —TYPE→ object + confidence/status. */
export function RelationshipList({
  relationships,
  entitiesById,
  limit = 30,
  onSelect,
}: {
  relationships: Relationship[];
  entitiesById: Map<string, KnowledgeEntity>;
  limit?: number;
  onSelect?: (id: string) => void;
}) {
  const rows = relationships.slice(0, limit);
  const nameOf = (id: string): string => entitiesById.get(id)?.canonicalName ?? id;
  return (
    <ul aria-label="Relationships">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onSelect?.(r.subjectEntityId)} aria-label={`Open ${nameOf(r.subjectEntityId)}`}>
            {nameOf(r.subjectEntityId)}
          </button>
          <span aria-label={`relationship ${r.type}`}> —{r.type}→ </span>
          <button type="button" onClick={() => onSelect?.(r.objectEntityId)} aria-label={`Open ${nameOf(r.objectEntityId)}`}>
            {nameOf(r.objectEntityId)}
          </button>
          <span> · {r.confidence} · {r.status}</span>
        </li>
      ))}
      {relationships.length > rows.length ? <li>…and {relationships.length - rows.length} more</li> : null}
    </ul>
  );
}
