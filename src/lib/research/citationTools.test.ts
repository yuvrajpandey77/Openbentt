import { describe, expect, it } from "vitest";
import {
  extractCiteKeysFromTex,
  lintCitations,
  formatCitation,
  lintBibliographyHealth,
  bibliographyHealthReport,
} from "@/lib/research/citationTools";
import { parseBibtex } from "@/lib/bibtex";
import { formatWithCsl } from "@/lib/research/cslEngine";
import { isValidDoiFormat, normalizeDoi } from "@/lib/research/crossrefClient";

describe("citationTools", () => {
  it("extracts cite keys", () => {
    expect(extractCiteKeysFromTex("See \\cite{smith2020} and \\citep{jones2021}.")).toEqual([
      "smith2020",
      "jones2021",
    ]);
  });

  it("lints missing bib entries", () => {
    const issues = lintCitations("\\cite{missing}", "");
    expect(issues.some((i) => i.kind === "missing_bib")).toBe(true);
  });

  it("formats ieee citation via CSL", () => {
    const e = parseBibtex('@article{a, title={Deep Learning}, author={Smith, John}, year={2020}, journal={Nature}}')[0];
    const formatted = formatCitation(e, "ieee");
    expect(formatted).toContain("Smith");
    expect(formatted).toContain("Deep Learning");
  });

  it("formats APA via citeproc engine", () => {
    const e = parseBibtex('@article{a, title={Test Paper}, author={Doe, Jane}, year={2019}}')[0];
    const out = formatWithCsl(e, "apa");
    expect(out).toMatch(/Doe/);
    expect(out).toMatch(/2019/);
  });

  it("detects duplicate keys in bibliography health", () => {
    const bib = `@article{a, title={T1}, author={A}, year={2020}}
@article{a, title={T2}, author={B}, year={2021}}`;
    const issues = lintBibliographyHealth(bib);
    expect(issues.some((i) => i.message.includes("Duplicate cite key"))).toBe(true);
  });

  it("reports bibliography completeness", () => {
    const report = bibliographyHealthReport(
      '@article{good, title={T}, author={A}, year={2020}}'
    );
    expect(report.entryCount).toBe(1);
    expect(report.completenessScore).toBeGreaterThan(0.5);
  });
});

describe("crossrefClient", () => {
  it("normalizes DOI URLs", () => {
    expect(normalizeDoi("https://doi.org/10.1038/nature12373")).toBe("10.1038/nature12373");
  });

  it("validates DOI format", () => {
    expect(isValidDoiFormat("10.1038/nature12373")).toBe(true);
    expect(isValidDoiFormat("not-a-doi")).toBe(false);
  });
});
