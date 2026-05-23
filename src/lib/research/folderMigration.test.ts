import { describe, expect, it } from "vitest";
import {
  defaultProjectFolders,
  folderForProjectPath,
  migrateProjectFolders,
} from "@/lib/research/folderMigration";
import type { ResearchProjectData } from "@/types/researchProject";

const base: ResearchProjectData = {
  id: "p1",
  title: "T",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  targetVenue: "generic",
  linkedThreadIds: [],
  draftTex: "",
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

describe("folderMigration", () => {
  it("migrates missing folders to defaults", () => {
    const next = migrateProjectFolders(base);
    expect(next.folders).toHaveLength(5);
    expect(next.folders![0].label).toBe("chapters");
  });

  it("preserves custom folders when present", () => {
    const custom = [{ id: "custom-1", label: "refs", kind: "custom" as const, order: 0 }];
    const next = migrateProjectFolders({ ...base, folders: custom });
    expect(next.folders).toEqual(custom);
  });

  it("maps project paths to system folders", () => {
    const folders = defaultProjectFolders();
    expect(folderForProjectPath(folders, "chapters/intro.tex")?.label).toBe("chapters");
    expect(folderForProjectPath(folders, "notes/foo.tex")?.label).toBe("includes");
  });
});
