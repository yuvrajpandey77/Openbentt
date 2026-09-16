import { describe, expect, it } from "vitest";
import { normalizeDoi, normalizeName, normalizePersonName, splitAuthorNames } from "@/lib/knowledge/normalize";
import { entityIdFor, paperIdForDoi } from "@/lib/knowledge/identity";

describe("entity normalization + identity", () => {
  it("normalizes case/whitespace variants together", () => {
    expect(normalizeName("OpenAI")).toBe(normalizeName(" openai "));
    expect(normalizeName(" OpenAI  ")).toBe("openai");
  });
  it("person names handle Last, First without merging strangers", () => {
    expect(normalizePersonName("Doe, John")).toBe("john doe");
    // Similar strings stay distinct — candidates, not identity.
    expect(normalizeName("Apple Inc.")).not.toBe(normalizeName("Apple Records"));
    expect(entityIdFor("organization", normalizeName("Apple Inc.")))
      .not.toBe(entityIdFor("organization", normalizeName("Apple Records")));
  });
  it("splits author lists deterministically", () => {
    expect(splitAuthorNames("Ada Lovelace and Alan Turing")).toEqual(["Ada Lovelace", "Alan Turing"]);
    expect(splitAuthorNames("Doe, John")).toEqual(["Doe, John"]);
    expect(splitAuthorNames("A; B; C")).toEqual(["A", "B", "C"]);
    expect(splitAuthorNames("Smith et al.")).toEqual(["Smith"]);
    expect(splitAuthorNames("")).toEqual([]);
  });
  it("doi normalization anchors paper identity", () => {
    expect(normalizeDoi("https://doi.org/10.1038/Nature12373.")).toBe("10.1038/nature12373");
    expect(paperIdForDoi("10.1038/nature12373")).toBe(paperIdForDoi("https://doi.org/10.1038/nature12373"));
  });
  it("ids are stable and namespaced", () => {
    expect(entityIdFor("person", "ada lovelace")).toMatch(/^ent_person_[0-9a-f]{8}$/);
    expect(paperIdForDoi("10.1/x")).toMatch(/^ent_paper_[0-9a-f]{8}$/);
  });
});
