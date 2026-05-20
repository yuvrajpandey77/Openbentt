export interface LatexFigure {
  label: string;
  caption: string;
  line: number;
  kind: "figure" | "table";
}

export function listLatexFloats(tex: string): LatexFigure[] {
  const lines = tex.split("\n");
  const out: LatexFigure[] = [];
  let env: "figure" | "table" | null = null;
  let label = "";
  let caption = "";
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\\begin\{figure\}/.test(line)) {
      env = "figure";
      label = "";
      caption = "";
      startLine = i + 1;
    } else if (/\\begin\{table\}/.test(line)) {
      env = "table";
      label = "";
      caption = "";
      startLine = i + 1;
    } else if (env && /\\end\{(figure|table)\}/.test(line)) {
      out.push({ label: label || `${env}-${out.length + 1}`, caption, line: startLine, kind: env });
      env = null;
    } else if (env) {
      const cap = line.match(/\\caption\{([^}]*)\}/);
      if (cap) caption = cap[1];
      const lab = line.match(/\\label\{([^}]*)\}/);
      if (lab) label = lab[1];
    }
  }
  return out;
}

export function insertAbstract(tex: string, abstract: string): string {
  const block = `\\begin{abstract}\n${abstract.trim()}\n\\end{abstract}\n`;
  if (/\\begin\{abstract\}/.test(tex)) {
    return tex.replace(/\\begin\{abstract\}[\s\S]*?\\end\{abstract\}/, block.trim());
  }
  const doc = tex.indexOf("\\begin{document}");
  if (doc >= 0) {
    const after = doc + "\\begin{document}".length;
    return tex.slice(0, after) + "\n\n" + block + tex.slice(after);
  }
  return block + "\n" + tex;
}

export function insertKeywords(tex: string, keywords: string[]): string {
  const kw = keywords.join(", ");
  const line = `\\keywords{${kw}}\n`;
  if (/\\keywords\{/.test(tex)) {
    return tex.replace(/\\keywords\{[^}]*\}/, `\\keywords{${kw}}`);
  }
  const absEnd = tex.indexOf("\\end{abstract}");
  if (absEnd >= 0) {
    const pos = absEnd + "\\end{abstract}".length;
    return tex.slice(0, pos) + "\n" + line + tex.slice(pos);
  }
  const doc = tex.indexOf("\\begin{document}");
  if (doc >= 0) {
    return tex.slice(0, doc) + line + tex.slice(doc);
  }
  return line + tex;
}

export function applyCaption(tex: string, label: string, newCaption: string): string {
  const re = new RegExp(
    `(\\\\begin\\{(figure|table)\\}[\\s\\S]*?\\\\label\\{${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\}[\\s\\S]*?\\\\caption\\{)[^}]*(\\})`,
    "m"
  );
  if (re.test(tex)) return tex.replace(re, `$1${newCaption}$3`);
  const re2 = new RegExp(
    `(\\\\caption\\{)[^}]*(\\}[\\s\\S]*?\\\\label\\{${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\})`,
    "m"
  );
  if (re2.test(tex)) return tex.replace(re2, `$1${newCaption}$2`);
  return tex;
}

export function suggestFigureReferences(tex: string, label: string): string {
  const ref = `Figure~\\ref{${label}}`;
  if (tex.includes(`\\ref{${label}}`)) return tex;
  const sec = tex.indexOf("\\section{");
  if (sec < 0) return tex + `\n\n% Consider referencing: ${ref}\n`;
  const insertAt = tex.indexOf("\n", sec);
  return tex.slice(0, insertAt + 1) + `% TODO: cite float — ${ref}\n` + tex.slice(insertAt + 1);
}

export function parseOutline(text: string): { level: number; title: string; body: string }[] {
  const lines = text.split("\n");
  const sections: { level: number; title: string; body: string }[] = [];
  let current: { level: number; title: string; body: string } | null = null;

  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    const num = line.match(/^(\d+\.)\s+(.+)$/);
    if (h) {
      if (current) sections.push(current);
      current = { level: h[1].length, title: h[2].trim(), body: "" };
    } else if (num) {
      if (current) sections.push(current);
      current = { level: 2, title: num[2].trim(), body: "" };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    } else if (line.trim()) {
      current = { level: 1, title: "Introduction", body: line };
    }
  }
  if (current) sections.push(current);
  return sections;
}

export function outlineToLatexSkeleton(
  sections: { level: number; title: string; body: string }[],
  existingPreamble?: string
): string {
  const preamble =
    existingPreamble ??
    `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\title{Research Draft}
\\author{Author}
\\date{\\today}
`;
  let body = "\\begin{document}\n\\maketitle\n";
  for (const s of sections) {
    const cmd = s.level <= 1 ? "section" : s.level === 2 ? "subsection" : "subsubsection";
    body += `\\${cmd}{${s.title}}\n`;
    if (s.body.trim()) body += s.body.trim() + "\n\n";
    else body += "% TODO: expand this section\n\n";
  }
  body += "\\bibliography{references}\n\\end{document}\n";
  if (preamble.includes("\\begin{document}")) return body;
  return preamble + "\n" + body;
}
