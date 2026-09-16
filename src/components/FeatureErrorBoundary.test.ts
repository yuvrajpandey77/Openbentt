import { describe, it, expect } from "vitest";
import type React from "react";
import { FeatureErrorBoundary } from "./FeatureErrorBoundary";

/** Flatten a React element tree to its text content for assertions (no DOM needed). */
function elementText(el: unknown): string {
  if (el === null || el === undefined) return "";
  if (typeof el === "string" || typeof el === "number") return String(el);
  if (Array.isArray(el)) return el.map(elementText).join(" ");
  if (typeof el === "object" && el !== null && "props" in (el as Record<string, unknown>)) {
    const props = (el as { props: { children?: unknown } }).props;
    return elementText(props.children);
  }
  return "";
}

describe("FeatureErrorBoundary", () => {
  it("derives error state with a reference id", () => {
    const state = FeatureErrorBoundary.getDerivedStateFromError(new Error("boom"));
    expect(state.error).toBeInstanceOf(Error);
    expect(state.errorId).toMatch(/^ERR-/);
  });

  it("renders children when healthy", () => {
    const b = new FeatureErrorBoundary({ feature: "chat", children: "inner" });
    expect(b.render()).toBe("inner");
  });

  it("renders an isolated fallback naming the feature", () => {
    const b = new FeatureErrorBoundary({ feature: "notebook", children: "inner" });
    b.state = { error: new Error("render exploded"), errorId: "ERR-test123" };
    const text = elementText(b.render() as React.ReactElement);
    expect(text).toContain("notebook");
    expect(text).toContain("render exploded");
    expect(text).toContain("ERR-test123");
    expect(text).toContain("Try again");
  });

  it("redacts secret-looking values from the displayed message", () => {
    const b = new FeatureErrorBoundary({ feature: "chat", children: "inner" });
    b.state = { error: new Error("provider rejected sk-or-v1-SECRETSECRET12"), errorId: "ERR-x" };
    const text = elementText(b.render() as React.ReactElement);
    expect(text).not.toContain("SECRETSECRET12");
    expect(text).toContain("[redacted-secret]");
  });

  it("truncates very long messages", () => {
    const b = new FeatureErrorBoundary({ feature: "chat", children: "inner" });
    b.state = { error: new Error("x".repeat(2000)), errorId: "ERR-x" };
    const text = elementText(b.render() as React.ReactElement);
    expect(text.length).toBeLessThan(2000);
  });
});
