import { describe, it, expect, beforeEach } from "vitest";
import {
  EXECUTION_RUNTIME,
  executionDisplayLabel,
  getExecutionRuntime,
  setExecutionRuntime,
} from "@/lib/agent/executionRuntime";

describe("canonical execution runtime", () => {
  beforeEach(() => {
    try {
      localStorage.removeItem("openbentt-execution-runtime");
    } catch {
      /* noop */
    }
  });

  it("defaults to OpenCode without configuration", () => {
    expect(EXECUTION_RUNTIME).toBe("opencode");
    expect(getExecutionRuntime()).toBe("opencode");
  });

  it("exposes a human label distinct from model selection", () => {
    expect(executionDisplayLabel()).toBe("OpenCode");
    expect(executionDisplayLabel("opencode")).toBe("OpenCode");
  });

  it("persists the default runtime", () => {
    setExecutionRuntime("opencode");
    expect(getExecutionRuntime()).toBe("opencode");
  });
});
