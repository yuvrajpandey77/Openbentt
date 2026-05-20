import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkpointKey,
  clearIndexCheckpoint,
  loadIndexCheckpoint,
  saveIndexCheckpoint,
} from "@/lib/research/indexCheckpoint";
import { installLocalStorageMock } from "../../../test/helpers/localStorage";

describe("indexCheckpoint", () => {
  let restoreStorage: () => void;

  beforeEach(() => {
    restoreStorage = installLocalStorageMock().restore;
    clearIndexCheckpoint("proj-a");
  });

  afterEach(() => {
    restoreStorage();
  });

  it("saves and loads interrupted indexing progress", () => {
    saveIndexCheckpoint({
      projectId: "proj-a",
      vectors: { "c1": [1, 0, 0] },
      doneIds: ["c1"],
      total: 3,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    const cp = loadIndexCheckpoint("proj-a");
    expect(cp?.vectors.c1).toEqual([1, 0, 0]);
    expect(checkpointKey("proj-a")).toContain("proj-a");
  });

  it("clears checkpoint after successful rebuild", () => {
    saveIndexCheckpoint({
      projectId: "proj-a",
      vectors: {},
      doneIds: [],
      total: 1,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    clearIndexCheckpoint("proj-a");
    expect(loadIndexCheckpoint("proj-a")).toBeNull();
  });
});
