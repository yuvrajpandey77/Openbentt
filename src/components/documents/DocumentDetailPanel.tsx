import type { OpenbenttDocument, DocumentContent } from "@/lib/documents/types";
import { DocumentStatusBadge } from "@/components/documents/DocumentStatusBadge";

/** Minimal accessible document detail surface (additive; no redesign). */
export function DocumentDetailPanel({
  document,
  content,
}: {
  document: OpenbenttDocument;
  content?: DocumentContent;
}) {
  const meta = document.metadata;
  return (
    <section aria-label={`Document detail: ${document.title}`}>
      <h2>{document.title}</h2>
      <DocumentStatusBadge status={document.status} errorCode={document.errorCode} />
      <dl>
        <div><dt>Type</dt><dd>{document.sourceType} · {document.mimeType}</dd></div>
        <div><dt>Source</dt><dd>{document.source}</dd></div>
        <div><dt>Checksum</dt><dd><code>{document.checksum.slice(0, 16)}…</code></dd></div>
        <div><dt>Extraction</dt><dd>{document.extractionStatus}</dd></div>
        {meta.authors?.value ? <div><dt>Authors</dt><dd>{meta.authors.value} (origin: {meta.authors.origin})</dd></div> : null}
        {meta.doi?.value ? <div><dt>DOI</dt><dd>{meta.doi.value} (origin: {meta.doi.origin})</dd></div> : null}
        {meta.pageCount?.value != null ? <div><dt>Pages</dt><dd>{meta.pageCount.value}</dd></div> : null}
        {meta.wordCount?.value != null ? <div><dt>Words</dt><dd>{meta.wordCount.value}</dd></div> : null}
      </dl>
      {content?.sections?.length ? (
        <nav aria-label="Document sections">
          <h3>Sections</h3>
          <ul>
            {content.sections.map((s) => (
              <li key={s.id}>{s.title}{typeof s.page === "number" ? ` — page ${s.page}` : ""}</li>
            ))}
          </ul>
        </nav>
      ) : null}
    </section>
  );
}
