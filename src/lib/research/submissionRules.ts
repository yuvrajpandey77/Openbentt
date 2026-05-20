import type { SubmissionCheck, TargetVenue } from "@/types/researchProject";
import { extractCiteKeysFromTex } from "@/lib/research/citationTools";
import { listLatexFloats } from "@/lib/research/latexTools";
import { parseBibtex } from "@/lib/bibtex";

function wordCount(tex: string): number {
  const plain = tex
    .replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, " ")
    .replace(/[{}%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain ? plain.split(" ").length : 0;
}

function abstractWords(tex: string): number {
  const m = tex.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
  if (!m) return 0;
  return m[1].replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
}

const VENUE_LIMITS: Record<TargetVenue, { abstractMax: number; titleMax?: number }> = {
  generic: { abstractMax: 300 },
  ieee: { abstractMax: 250 },
  acm: { abstractMax: 250 },
  nature: { abstractMax: 200 },
  arxiv: { abstractMax: 350 },
};

export function runSubmissionChecks(
  tex: string,
  bibRaw: string,
  venue: TargetVenue
): SubmissionCheck[] {
  const limits = VENUE_LIMITS[venue];
  const checks: SubmissionCheck[] = [];
  const wc = wordCount(tex);
  const aw = abstractWords(tex);
  const floats = listLatexFloats(tex);
  const cites = extractCiteKeysFromTex(tex);
  const bib = parseBibtex(bibRaw);

  checks.push({
    id: "abstract-present",
    label: "Abstract present",
    passed: aw > 0,
    detail: aw > 0 ? `${aw} words in abstract.` : "Add \\begin{abstract}…\\end{abstract}.",
  });

  checks.push({
    id: "abstract-length",
    label: `Abstract ≤ ${limits.abstractMax} words (${venue})`,
    passed: aw === 0 || aw <= limits.abstractMax,
    detail: aw ? `${aw} words.` : "No abstract to measure.",
  });

  checks.push({
    id: "document-class",
    label: "Document class declared",
    passed: /\\documentclass/.test(tex),
    detail: /\\documentclass/.test(tex) ? "\\documentclass found." : "Missing \\documentclass.",
  });

  checks.push({
    id: "citations-resolved",
    label: "All \\cite keys in bibliography",
    passed: cites.every((k) => bib.some((e) => e.key === k)),
    detail: `${cites.length} cite keys, ${bib.length} bib entries.`,
  });

  const missingCaps = floats.filter((f) => !f.caption.trim());
  checks.push({
    id: "float-captions",
    label: "Figures/tables have captions",
    passed: missingCaps.length === 0,
    detail:
      missingCaps.length === 0
        ? `${floats.length} float(s) with captions.`
        : `${missingCaps.length} float(s) missing \\caption.`,
  });

  const missingLabels = floats.filter((f) => !f.label.trim());
  checks.push({
    id: "float-labels",
    label: "Figures/tables have \\label",
    passed: missingLabels.length === 0,
    detail:
      missingLabels.length === 0
        ? "All floats labeled."
        : `${missingLabels.length} float(s) missing \\label.`,
  });

  checks.push({
    id: "bibliography-block",
    label: "Bibliography section",
    passed: /\\bibliography|\\begin\{thebibliography\}/.test(tex),
    detail: /\\bibliography/.test(tex)
      ? "Uses \\bibliography."
      : /thebibliography/.test(tex)
        ? "Uses thebibliography."
        : "Add bibliography before submit.",
  });

  checks.push({
    id: "draft-length",
    label: "Substantive draft",
    passed: wc >= 200,
    detail: `~${wc} words in body.`,
  });

  return checks;
}
