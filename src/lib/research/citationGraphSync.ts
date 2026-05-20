import type { BibEntry } from "@/lib/bibtex";
import { appendBibEntry } from "@/lib/research/citationTools";
import type { GraphNode } from "@/lib/citationGraph";

/** Bib keys already present (project + graph library nodes). */
export function existingBibKeys(bibRaw: string): Set<string> {
  const keys = new Set<string>();
  const re = /@\w+\s*\{\s*([^,\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bibRaw)) !== null) keys.add(m[1]);
  return keys;
}

/** Turn Semantic Scholar graph nodes into importable BibTeX entries. */
export function bibEntriesFromGraphNodes(
  nodes: GraphNode[],
  bibRaw: string
): { entries: BibEntry[]; bib: string } {
  const have = existingBibKeys(bibRaw);
  const entries: BibEntry[] = [];
  let bib = bibRaw;
  for (const n of nodes) {
    if (have.has(n.id)) continue;
    if (!n.id.startsWith("s2:")) continue;
    const key = `s2${n.id.slice(3).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
    if (have.has(key)) continue;
    const title = (n.label || n.id).replace(/[{}]/g, "");
    const entry: BibEntry = {
      key,
      type: "misc",
      title,
      doi: n.doi,
      raw: `@misc{${key},
  title={${title}},
  note={Imported from Semantic Scholar citation graph},
}`,
    };
    entries.push(entry);
    bib = appendBibEntry(bib, entry);
    have.add(key);
  }
  return { entries, bib };
}
