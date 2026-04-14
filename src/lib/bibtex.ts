/** BibTeX import with balanced-brace field values. */

export interface BibEntry {
  key: string;
  type: string;
  title?: string;
  author?: string;
  year?: string;
  doi?: string;
  url?: string;
  journal?: string;
  booktitle?: string;
  raw: string;
}

/** Index of matching `}` for `{` at `openIdx`. */
function skipBalanced(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length;
}

function extractField(body: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*`, "i");
  const m = re.exec(body);
  if (!m || m.index === undefined) return undefined;
  let pos = m.index + m[0].length;
  while (pos < body.length && /\s/.test(body[pos])) pos++;
  if (pos >= body.length) return undefined;
  if (body[pos] === "{") {
    const close = skipBalanced(body, pos);
    return body.slice(pos + 1, close).replace(/\s+/g, " ").trim();
  }
  if (body[pos] === '"') {
    const end = body.indexOf('"', pos + 1);
    if (end < 0) return body.slice(pos + 1).trim();
    return body.slice(pos + 1, end).replace(/\s+/g, " ").trim();
  }
  const rest = body.slice(pos);
  const stop = rest.search(/[,}\n\r]/);
  const chunk = stop >= 0 ? rest.slice(0, stop) : rest;
  return chunk.replace(/\s+/g, " ").trim();
}

function splitBibEntries(text: string): string[] {
  const s = text.replace(/\r\n/g, "\n");
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const at = s.indexOf("@", i);
    if (at < 0) break;
    const brace = s.indexOf("{", at);
    if (brace < 0) break;
    const end = skipBalanced(s, brace);
    out.push(s.slice(at, end + 1).trim());
    i = end + 1;
  }
  return out;
}

export function parseBibtex(text: string): BibEntry[] {
  const chunks = splitBibEntries(text);
  const out: BibEntry[] = [];
  for (const chunk of chunks) {
    const o = chunk.indexOf("{");
    if (o < 0) continue;
    const type = chunk.slice(1, o).replace(/^@/, "").trim().toLowerCase();
    const inner = chunk.slice(o + 1, -1);
    const c0 = inner.indexOf(",");
    if (c0 < 0) continue;
    const key = inner.slice(0, c0).trim();
    const body = inner.slice(c0 + 1);
    out.push({
      key,
      type,
      title: extractField(body, "title"),
      author: extractField(body, "author"),
      year: extractField(body, "year"),
      doi: extractField(body, "doi"),
      url: extractField(body, "url"),
      journal: extractField(body, "journal"),
      booktitle: extractField(body, "booktitle"),
      raw: chunk,
    });
  }
  return out;
}

export function bibEntriesToContext(entries: BibEntry[], maxChars = 8000): string {
  const lines = entries.map((e) => {
    const bits = [e.title, e.author, e.year, e.doi ? `DOI:${e.doi}` : "", e.journal || e.booktitle]
      .filter(Boolean)
      .join(" | ");
    return `- (${e.key}) ${bits}`;
  });
  const t = lines.join("\n");
  return t.length <= maxChars ? t : t.slice(0, maxChars) + "\n…[truncated]";
}
