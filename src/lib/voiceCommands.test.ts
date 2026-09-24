import { describe, it, expect } from "vitest";
import { parseVoiceCommand } from "./voiceCommands";

describe("parseVoiceCommand", () => {
  it("routes nav-verb tab requests to routes", () => {
    expect(parseVoiceCommand("open projects")).toBe("/projects");
    expect(parseVoiceCommand("go to tasks")).toBe("/tasks");
    expect(parseVoiceCommand("show diagnostics")).toBe("/diagnostics");
    expect(parseVoiceCommand("open the editor")).toBe("/notebook");
    expect(parseVoiceCommand("take me to research")).toBe("/labs");
    expect(parseVoiceCommand("switch to files")).toBe("/files");
    expect(parseVoiceCommand("open settings")).toBe("/settings");
    expect(parseVoiceCommand("open chat")).toBe("/chat");
  });
  it("routes bare tab names", () => {
    expect(parseVoiceCommand("tasks")).toBe("/tasks");
    expect(parseVoiceCommand("projects")).toBe("/projects");
  });
  it("leaves real prompts for chat (no false navigation)", () => {
    expect(parseVoiceCommand("compile my thesis and fix the errors")).toBeNull();
    expect(parseVoiceCommand("rewrite chapter 3 and add citations")).toBeNull();
    expect(parseVoiceCommand("what are my tasks for today")).toBeNull();
    expect(parseVoiceCommand("open the pod bay doors")).toBeNull();
    expect(parseVoiceCommand("")).toBeNull();
  });
});
