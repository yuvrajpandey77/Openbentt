import { describe, it, expect } from "vitest";
import {
  detectModeIntent,
  modeIntentToSuggestion,
  shouldSuggestModeChange,
  isInternalTaskStep,
} from "./modeDetection";

describe("detectModeIntent", () => {
  // CHAT tests
  it("returns chat for empty input", () => {
    const result = detectModeIntent("");
    expect(result.recommendedMode).toBe("chat");
    expect(result.confidence).toBe("high");
  });

  it("returns chat for conversational queries", () => {
    const result = detectModeIntent("What is React?");
    expect(result.recommendedMode).toBe("chat");
  });

  it("returns chat for explanation requests", () => {
    const result = detectModeIntent("Explain how authentication works");
    expect(result.recommendedMode).toBe("chat");
  });

  it("returns chat for informational questions", () => {
    const result = detectModeIntent("How do I build a React app?");
    expect(result.recommendedMode).toBe("chat");
  });

  it("returns chat for best practice questions", () => {
    const result = detectModeIntent("What is the best way to implement authentication?");
    expect(result.recommendedMode).toBe("chat");
  });

  // PLAN tests
  it("returns plan for explicit planning keywords", () => {
    const result = detectModeIntent("Plan how to design authentication");
    expect(result.recommendedMode).toBe("plan");
  });

  it("returns plan for analysis requests", () => {
    const result = detectModeIntent("Analyze this codebase and recommend changes");
    expect(result.recommendedMode).toBe("plan");
  });

  it("returns plan for investigation requests", () => {
    const result = detectModeIntent("Investigate this bug and propose a fix");
    expect(result.recommendedMode).toBe("plan");
  });

  it("returns plan for architecture review", () => {
    const result = detectModeIntent("Review the architecture and tell me what should change");
    expect(result.recommendedMode).toBe("plan");
  });

  // BUILD tests
  it("returns build for explicit implementation requests", () => {
    const result = detectModeIntent("Implement authentication in this app");
    expect(result.recommendedMode).toBe("build");
  });

  it("returns build for fix/refactor requests", () => {
    const result = detectModeIntent("Fix the login bug");
    expect(result.recommendedMode).toBe("build");
  });

  it("returns build for create/add requests with project context", () => {
    const result = detectModeIntent("Create a new login page", { projectRoot: "/home/project" });
    expect(result.recommendedMode).toBe("build");
  });

  it("returns build for update/change requests", () => {
    const result = detectModeIntent("Update the API to use JWT");
    expect(result.recommendedMode).toBe("build");
  });

  // TASK tests
  it("returns task for multi-step autonomous work", () => {
    const result = detectModeIntent("Work through all failing tests and fix them");
    expect(result.recommendedMode).toBe("task");
  });

  it("returns task for systematic fixes", () => {
    const result = detectModeIntent("Systematically fix all issues in the project");
    expect(result.recommendedMode).toBe("task");
  });

  it("returns task for continue-until patterns", () => {
    const result = detectModeIntent("Fix all the authentication bugs and keep testing until everything works");
    expect(result.recommendedMode).toBe("task");
  });

  it("returns task for full implementation requests", () => {
    const result = detectModeIntent("Build the complete authentication system");
    expect(result.recommendedMode).toBe("task");
  });

  it("returns task for end-to-end requests", () => {
    const result = detectModeIntent("Implement this feature, test it, and continue until it works");
    expect(result.recommendedMode).toBe("task");
  });

  // PROJECT CONTEXT tests
it("boosts execution modes with project context", () => {
    const withoutProject = detectModeIntent("Add authentication");
    const withProject = detectModeIntent("Add authentication", { projectRoot: "/home/project" });
    // Confidence should be same or higher with project context
    const confidenceOrder = { low: 0, medium: 1, high: 2 };
    expect(confidenceOrder[withProject.confidence]).toBeGreaterThanOrEqual(confidenceOrder[withoutProject.confidence]);
  });

  // EXPLICIT MODE OVERRIDE tests
  it("respects explicit user mode selection", () => {
    const result = detectModeIntent("Implement auth", { currentMode: "chat" });
    // When user is in chat mode, it should detect build
    expect(result.recommendedMode).toBe("build");
  });

  it("respects explicit plan mode selection", () => {
    const result = detectModeIntent("Implement auth", { currentMode: "plan" });
    expect(result.recommendedMode).toBe("plan");
    expect(result.reason).toContain("explicitly selected");
  });

  it("respects explicit build mode selection", () => {
    const result = detectModeIntent("Explain this", { currentMode: "build" });
    expect(result.recommendedMode).toBe("build");
  });

  it("respects explicit task mode selection", () => {
    const result = detectModeIntent("Explain this", { currentMode: "task" });
    expect(result.recommendedMode).toBe("task");
  });

  // TASK CONTINUATION tests
  it("continues task when execution is running", () => {
    const result = detectModeIntent("Continue", {
      isTaskRunning: true,
      currentTaskStatus: "RUNNING",
    });
    expect(result.recommendedMode).toBe("task");
    expect(result.reason).toContain("Continuing active task");
  });

  // CONVERSATION CONTEXT tests
  it("detects build from planning conversation context", () => {
    const result = detectModeIntent("Okay, implement it", {
      conversationHistory: [
        { role: "assistant", content: "Here is the plan: Step 1: Design auth. Step 2: Implement." },
        { role: "user", content: "Sounds good" },
      ],
    });
    expect(result.recommendedMode).toBe("build");
  });

  it("detects build from analysis conversation context", () => {
    const result = detectModeIntent("Go ahead and do it", {
      conversationHistory: [
        { role: "assistant", content: "After analyzing the architecture, I recommend we refactor the auth module." },
      ],
    });
    expect(result.recommendedMode).toBe("build");
  });

  // FALSE POSITIVE PREVENTION tests
  it("does not trigger build for how-to questions", () => {
    const result = detectModeIntent("How do I implement authentication?");
    expect(result.recommendedMode).toBe("chat");
  });

  it("does not trigger build for best practice questions", () => {
    const result = detectModeIntent("What is the best way to fix this bug?");
    expect(result.recommendedMode).toBe("chat");
  });

  it("does not trigger build for explanation requests", () => {
    const result = detectModeIntent("Can you show me how to create an API?");
    expect(result.recommendedMode).toBe("chat");
  });

  it("does not trigger build for learning requests", () => {
    const result = detectModeIntent("Explain how to fix this bug");
    expect(result.recommendedMode).toBe("chat");
  });

  // ATTACHMENTS BOOST tests
  it("boosts confidence with file attachments", () => {
    const result = detectModeIntent("Fix this", { hasAttachments: true });
    expect(result.confidence).not.toBe("low");
  });

  // INTERNAL TASK STEP tests
  it("detects internal task steps", () => {
    const result = isInternalTaskStep("continue", { isTaskRunning: true, currentTaskStatus: "RUNNING" });
    expect(result).toBe(true);
  });

  it("detects ok as internal task step", () => {
    const result = isInternalTaskStep("ok", { isTaskRunning: true, currentTaskStatus: "RUNNING" });
    expect(result).toBe(true);
  });

  it("does not detect new messages as internal steps", () => {
    const result = isInternalTaskStep("Fix the login bug", { isTaskRunning: true, currentTaskStatus: "RUNNING" });
    expect(result).toBe(false);
  });
});

describe("modeIntentToSuggestion", () => {
  it("converts ModeIntent to ModeSuggestion", () => {
    const intent = {
      recommendedMode: "build" as const,
      confidence: "high" as const,
      reason: "Test reason",
      requiresProjectContext: true,
      requiresExecution: true,
      requiresUserApproval: true,
    };
    const suggestion = modeIntentToSuggestion(intent);
    expect(suggestion.mode).toBe("build");
    expect(suggestion.confidence).toBe("high");
    expect(suggestion.reason).toBe("Test reason");
  });
});

describe("shouldSuggestModeChange", () => {
  it("returns false when modes are the same", () => {
    const intent = { recommendedMode: "chat" as const, confidence: "high" as const, reason: "", requiresProjectContext: false, requiresExecution: false, requiresUserApproval: false };
    expect(shouldSuggestModeChange("chat", intent, false)).toBe(false);
  });

  it("returns false for low confidence", () => {
    const intent = { recommendedMode: "build" as const, confidence: "low" as const, reason: "", requiresProjectContext: false, requiresExecution: false, requiresUserApproval: false };
    expect(shouldSuggestModeChange("chat", intent, false)).toBe(false);
  });

  it("returns true for chat -> build with medium confidence", () => {
    const intent = { recommendedMode: "build" as const, confidence: "medium" as const, reason: "", requiresProjectContext: false, requiresExecution: false, requiresUserApproval: false };
    expect(shouldSuggestModeChange("chat", intent, false)).toBe(true);
  });

  it("returns true for chat -> plan with high confidence", () => {
    const intent = { recommendedMode: "plan" as const, confidence: "high" as const, reason: "", requiresProjectContext: false, requiresExecution: false, requiresUserApproval: false };
    expect(shouldSuggestModeChange("chat", intent, false)).toBe(true);
  });

  it("returns true for chat -> task with high confidence", () => {
    const intent = { recommendedMode: "task" as const, confidence: "high" as const, reason: "", requiresProjectContext: false, requiresExecution: false, requiresUserApproval: false };
    expect(shouldSuggestModeChange("chat", intent, false)).toBe(true);
  });

  it("returns false for non-chat current mode with medium confidence", () => {
    const intent = { recommendedMode: "build" as const, confidence: "medium" as const, reason: "", requiresProjectContext: false, requiresExecution: false, requiresUserApproval: false };
    expect(shouldSuggestModeChange("plan", intent, false)).toBe(false);
  });

  it("returns true for non-chat current mode with high confidence", () => {
    const intent = { recommendedMode: "build" as const, confidence: "high" as const, reason: "", requiresProjectContext: false, requiresExecution: false, requiresUserApproval: false };
    expect(shouldSuggestModeChange("plan", intent, false)).toBe(true);
  });

  it("returns false when user explicitly selected a mode", () => {
    const intent = { recommendedMode: "build" as const, confidence: "high" as const, reason: "", requiresProjectContext: false, requiresExecution: false, requiresUserApproval: false };
    expect(shouldSuggestModeChange("plan", intent, true)).toBe(false);
  });

  it("returns false for chat recommendation", () => {
    const intent = { recommendedMode: "chat" as const, confidence: "high" as const, reason: "", requiresProjectContext: false, requiresExecution: false, requiresUserApproval: false };
    expect(shouldSuggestModeChange("build", intent, false)).toBe(false);
  });
});