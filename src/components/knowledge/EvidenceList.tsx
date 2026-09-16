import type { Evidence } from "@/lib/knowledge/types";

/** Bounded evidence list: document → page → section → snippet. No full-text dumps. */
export function EvidenceList({ evidence, limit = 20 }: { evidence: Evidence[]; limit?: number }) {
  const rows = evidence.slice(0, limit);
  return (
    <ul aria-label="Supporting evidence">
      {rows.map((e) => (
        <li key={e.id}>
          <span>{e.sourceRef.title ?? e.sourceRef.documentId}</span>
          {typeof e.sourceRef.page === "number" ? <span> · Page {e.sourceRef.page}</span> : null}
          {e.sourceRef.section ? <span> · Section {e.sourceRef.section}</span> : null}
          <span> · {e.status}</span>
          {e.quote ? <blockquote>{e.quote}</blockquote> : null}
        </li>
      ))}
      {evidence.length > rows.length ? <li>…and {evidence.length - rows.length} more</li> : null}
    </ul>
  );
}
