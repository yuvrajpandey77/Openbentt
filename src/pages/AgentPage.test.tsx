import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AgentPage from "@/pages/AgentPage";

/** Minimal desktop bridge so the panel renders its full workspace UI. */
function stubBridge() {
  const noopSub = () => () => {};
  (window as unknown as Record<string, unknown>).openbenttAgent = {
    detectOpenCode: async () => ({ installed: false }),
    getStatus: async () => ({ runtime: { status: "STOPPED" }, tasks: 0, sessions: 0 }),
    getRuntimeStatus: async () => ({
      opencode: { status: "STOPPED" },
      omniRoute: { status: "NOT_INSTALLED", port: 20128, baseUrl: "" },
      tasks: 0,
      sessions: 0,
    }),
    getModels: async () => ({ models: [] }),
    onEvent: noopSub,
    onVoiceEvent: noopSub,
  };
}

/** Agent workspace renders the execution panel without crashing. */
describe("AgentPage", () => {
  beforeEach(() => {
    stubBridge();
  });
  it("renders the Agent workspace with task controls", () => {
    render(
      <MemoryRouter>
        <AgentPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Agent" })).toBeTruthy();
    expect(screen.getByPlaceholderText(/\/home\/user\/projects\/foo/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /run with opencode/i })).toBeTruthy();
  });

  it("includes the voice control surface", () => {
    render(
      <MemoryRouter>
        <AgentPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("region", { name: /voice control/i })).toBeTruthy();
  });
});
