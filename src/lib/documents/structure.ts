/**
 * Phase 2 — Deterministic structure detection (no LLM for basic structure).
 * Groups heading-led blocks into sections for PDF/Markdown/office content.
 */
import type { DocumentContent, DocumentSection } from "@/lib/documents/types";

export function detectSections(content: DocumentContent): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let current: DocumentSection | null = null;
  let si = 0;
  const flush = () => {
    if (current && current.blockIds.length) sections.push(current);
    current = null;
  };
  for (const b of content.blocks) {
    if (b.kind === "heading") {
      flush();
      current = {
        id: `s${si++}`, title: b.text.slice(0, 200),
        level: b.level ?? 1, page: b.page, blockIds: [b.id],
      };
    } else if (current) {
      current.blockIds.push(b.id);
    }
  }
  flush();
  // Link blocks back to sections.
  const owner = new Map<string, string>();
  for (const s of sections) for (const id of s.blockIds) owner.set(id, s.id);
  for (const b of content.blocks) {
    const sid = owner.get(b.id);
    if (sid) b.sectionId = sid;
  }
  return sections;
}
