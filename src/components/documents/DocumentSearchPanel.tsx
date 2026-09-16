import { useState } from "react";
import { searchDocuments } from "@/lib/documents/search";

/** Minimal provenance-exposing search surface (keyboard + screen-reader safe). */
export function DocumentSearchPanel({ projectId }: { projectId?: string }) {
  const [query, setQuery] = useState("");
  const hits = searchDocuments(query, projectId ? { projectId } : {});
  return (
    <section aria-label="Document search">
      <label htmlFor="doc-search-input">Search documents</label>
      <input
        id="doc-search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search titles and content…"
      />
      <ul aria-live="polite">
        {hits.map((h) => (
          <li key={h.document.id}>
            <strong>{h.document.title}</strong>
            {h.sectionId ? <span> · Section: {h.sectionId}</span> : null}
            {typeof h.page === "number" ? <span> · Page: {h.page}</span> : null}
            <p>{h.snippet}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
