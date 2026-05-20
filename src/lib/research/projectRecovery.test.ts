import { describe, expect, it } from "vitest";
import { parseProjectJsonSafe, stripEmbeddingsForWebPersist } from "@/lib/research/projectRecovery";
import type { ResearchProjectData } from "@/types/researchProject";

const minimal: ResearchProjectData = {
  id: "proj-1",
  title: "Thesis",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  targetVenue: "generic",
  linkedThreadIds: [],
  draftTex: "\\section{A}",
  bibliography: "",
  bibEntries: [],
  papers: [],
  chunks: [],
  revisionSuggestions: [],
  modelAttributions: [],
  abstractVariants: [],
  keywordSuggestions: [],
  captionSuggestions: [],
};

describe("parseProjectJsonSafe", () => {
  it("parses valid project JSON", () => {
    const parsed = parseProjectJsonSafe(JSON.stringify(minimal));
    expect(parsed?.id).toBe("proj-1");
    expect(parsed?.draftTex).toContain("\\section");
  });

  it("recovers id and draft from JSON missing closing brace", () => {
    const broken = `{"id":"proj-x","title":"Broken","draftTex":"hello world"`;
    const parsed = parseProjectJsonSafe(broken);
    expect(parsed?.id).toBe("proj-x");
    expect(parsed?.draftTex).toBe("hello world");
  });

  it("returns null when id cannot be salvaged", () => {
    expect(parseProjectJsonSafe("{not valid at all")).toBeNull();
  });
});

describe("stripEmbeddingsForWebPersist", () => {
  it("removes chunkEmbeddings from persisted payload", () => {
    const withEmb = { ...minimal, chunkEmbeddings: { "c1": [1, 2, 3] } };
    const stripped = stripEmbeddingsForWebPersist(withEmb);
    expect(stripped.chunkEmbeddings).toBeUndefined();
    expect(stripped.id).toBe(minimal.id);
  });
});
