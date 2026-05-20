/** Parse structured writing assists from assistant chat replies. */

export function parseAbstractVariants(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];

  const splitParts = text.split(/(?=Abstract\s*\d+\s*[:.)-]?\s*)/i).filter((p) => p.trim().length > 0);
  const variants: string[] = [];
  for (const part of splitParts) {
    const cleaned = cleanAbstractBody(part.replace(/^Abstract\s*\d+\s*[:.)-]?\s*/i, ""));
    if (cleaned.length >= 24) variants.push(cleaned);
  }
  if (variants.length >= 1) return dedupeAbstracts(variants).slice(0, 5);

  const latex = text.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/i);
  if (latex?.[1]?.trim()) {
    return [cleanAbstractBody(latex[1])];
  }

  if (/^abstract\b/i.test(text) && text.length >= 80 && text.length < 4000) {
    const single = cleanAbstractBody(text.replace(/^abstract\s*[:.)]?\s*/i, ""));
    if (single.length >= 40) return [single];
  }

  return [];
}

function cleanAbstractBody(s: string): string {
  return s
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function dedupeAbstracts(list: string[]): string[] {
  const out: string[] = [];
  for (const a of list) {
    if (out.some((x) => x.slice(0, 80) === a.slice(0, 80))) continue;
    out.push(a);
  }
  return out;
}

export function parseKeywordSuggestions(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];

  const lines: string[] = [];
  const kwLine = text.match(/(?:research\s+)?keywords?\s*[:-]\s*([^\n]+)/i)?.[1];
  if (kwLine) lines.push(kwLine);
  const pdfLine = text.match(/(?:pdf\s+)?metadata\s+keywords?\s*[:-]\s*([^\n]+)/i)?.[1];
  if (pdfLine) lines.push(pdfLine);
  const bulletBlock = text.match(/(?:^|\n)\s*[-*]\s*([^\n]+)/g);
  if (bulletBlock && /keyword/i.test(text)) {
    for (const b of bulletBlock) {
      const t = b.replace(/^\s*[-*]\s*/, "").trim();
      if (t.length > 2 && t.length < 80) lines.push(t);
    }
  }

  const merged = lines
    .join(", ")
    .split(/[,;\n]/)
    .map((k) => k.replace(/^\d+[.)]\s*/, "").trim())
    .filter((k) => k.length > 1 && k.length < 64);

  return [...new Set(merged)].slice(0, 16);
}

export function looksLikeAbstractReply(text: string): boolean {
  return /Abstract\s*\d/i.test(text) || /\\begin\{abstract\}/i.test(text);
}

export function looksLikeKeywordReply(text: string): boolean {
  return /keywords?\s*:/i.test(text) || /research keywords/i.test(text);
}

export interface ParsedCaption {
  label: string;
  caption: string;
}

/** Parse `Caption for fig:intro: ...` or `\\caption{...}` with optional label hints. */
export function parseCaptionSuggestions(raw: string, knownLabels: string[] = []): ParsedCaption[] {
  const text = raw.trim();
  if (!text) return [];

  const out: ParsedCaption[] = [];

  for (const lab of knownLabels) {
    const esc = lab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exact = text.match(new RegExp(`Caption\\s+for\\s+${esc}\\s*:\\s*([^\\n]+)`, "i"));
    if (exact?.[1]) {
      const caption = exact[1].trim().replace(/\*\*/g, "");
      if (caption.length >= 8) out.push({ label: lab, caption });
    }
  }

  if (knownLabels.length === 0) {
    const lineRe = /Caption\s+for\s+([^\n]+?)\s*:\s*([^\n]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(text)) !== null) {
      const label = m[1].trim();
      const caption = m[2].trim().replace(/\*\*/g, "");
      if (label && caption.length >= 8 && !out.some((o) => o.label === label)) out.push({ label, caption });
    }
  }

  for (const lab of knownLabels) {
    const esc = lab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = text.match(
      new RegExp(`(?:Figure|Table)\\s+(?:ref\\{)?${esc}[\\s\\S]{0,400}?caption\\s*:\\s*([^\\n]+)`, "i")
    );
    if (block?.[1]) {
      out.push({ label: lab, caption: block[1].trim() });
    }
  }

  const capBlocks = text.matchAll(/\\caption\{([^}]+)\}/g);
  for (const cap of capBlocks) {
    const caption = cap[1].trim();
    if (caption.length < 8) continue;
    const label =
      knownLabels.find((l) => text.includes(l) && text.indexOf(l) < (cap.index ?? 0) + 200) ??
      `float-${out.length + 1}`;
    if (!out.some((o) => o.caption === caption)) out.push({ label, caption });
  }

  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.label}:${c.caption.slice(0, 40)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function looksLikeCaptionReply(text: string): boolean {
  return /Caption\s+for\s+/i.test(text) || /\\caption\{/i.test(text);
}
