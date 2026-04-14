import { describe, it, expect } from "vitest";
import { parseBibtex, bibEntriesToContext } from "./bibtex";

describe("parseBibtex", () => {
  it("parses a simple article", () => {
    const src = `
@article{smith2020,
  title = {Hello World},
  author = {Smith, A.},
  year = {2020},
  doi = {10.1000/test}
}`;
    const e = parseBibtex(src);
    expect(e).toHaveLength(1);
    expect(e[0].key).toBe("smith2020");
    expect(e[0].title).toBe("Hello World");
    expect(e[0].doi).toBe("10.1000/test");
  });
});

describe("bibEntriesToContext", () => {
  it("joins entries", () => {
    const t = bibEntriesToContext([
      { key: "a", type: "article", title: "T", raw: "" },
      { key: "b", type: "inproceedings", title: "U", raw: "" },
    ]);
    expect(t).toContain("(a)");
    expect(t).toContain("(b)");
  });
});
