import { describe, it, expect } from "vitest";
import {
  getTasksForConversation,
  isProjectConversation,
  linkTaskToConversation,
} from "@/lib/conversation";

describe("canonical conversation model", () => {
  it("distinguishes global vs project chat ONLY by projectId", () => {
    expect(isProjectConversation({ projectId: null })).toBe(false);
    expect(isProjectConversation({})).toBe(false);
    expect(isProjectConversation({ projectId: "" })).toBe(false);
    expect(isProjectConversation({ projectId: "proj-1" })).toBe(true);
  });

  it("maps one conversation to many tasks without duplicating history", () => {
    let map = {};
    map = linkTaskToConversation(map, "conv-1", "task-a");
    map = linkTaskToConversation(map, "conv-1", "task-b");
    map = linkTaskToConversation(map, "conv-2", "task-c");
    // Re-linking the same task is a no-op (no duplicates).
    map = linkTaskToConversation(map, "conv-1", "task-a");
    expect(getTasksForConversation(map, "conv-1")).toEqual(["task-a", "task-b"]);
    expect(getTasksForConversation(map, "conv-2")).toEqual(["task-c"]);
    expect(getTasksForConversation(map, "conv-unknown")).toEqual([]);
  });
});
