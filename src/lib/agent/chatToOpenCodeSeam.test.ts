import { describe, it, expect } from "vitest";
import { decideRoute } from "@/lib/agent/openCodeHarness";

/**
 * Chat → OpenCode seam: normal questions stay in chat, execution-class
 * turns route to OpenCode by default (no manual agent selection).
 */
describe("unified Chat → OpenCode seam", () => {
  it("keeps conversational questions in chat", () => {
    const d = decideRoute("What is normalization?");
    expect(d.routeToOpenCode).toBe(false);
  });

  it("routes execution work to OpenCode by default", () => {
    const d = decideRoute("Read this project and fix the failing tests.");
    expect(d.routeToOpenCode).toBe(true);
    expect(d.category).toBe("CODE");
  });

  it("plans by default, builds only when asked", () => {
    expect(decideRoute("Analyze these files and tell me what's wrong.").mode).toBe("plan");
    expect(decideRoute("Read this project and fix the failing tests.").mode).toBe("build");
    expect(decideRoute("What is normalization?").mode).toBe("plan");
  });

  it("routes component creation to OpenCode", () => {
    const d = decideRoute("Create a component for this project with a login form.");
    expect(d.routeToOpenCode).toBe(true);
  });
});
