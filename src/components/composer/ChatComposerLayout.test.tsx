import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Regression: the chat shell and the empty-state page used to mount their own
 * ChatInput, producing two full composers/toolbars on a new chat. These tests
 * pin the single-owner layout: one composer, moved between state-driven slots
 * without unmounting it.
 */
const mocks = vi.hoisted(() => ({
  composerMounts: 0,
  chatState: {
    chats: [{ id: "c1", messages: [] as unknown[], taskIds: [] as string[] }],
    currentChatId: "c1",
    isLoading: false,
    isLoadingConfig: false,
    apiConfig: { aiProvider: "ollama", model: "llama3" },
    openCodeLayer: { available: true, checking: false },
    createNewChat: vi.fn(),
    setWorkspaceRouteAssist: vi.fn(),
  },
}));

vi.mock("@/context/ChatContext", () => ({
  useChat: () => ({ ...mocks.chatState, createNewChat: mocks.chatState.createNewChat }),
  canSendChat: () => true,
  resolveExecutionWorkspace: () => "/tmp/workspace",
  AGENT_WORKSPACE_KEY: "openbentt-agent-workspace",
}));

vi.mock("@/context/LocalAIContext", () => ({
  useLocalAI: () => ({ health: "ready", effectiveModel: null }),
}));

vi.mock("@/hooks/useGlobalShortcuts", () => ({ useGlobalShortcuts: () => {} }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

vi.mock("@/context/NarrationContext", () => ({
  NarrationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/Sidebar", () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock("@/components/RightSidebar", () => ({ default: () => <div data-testid="right-sidebar" /> }));
vi.mock("@/components/AppChromeHeader", () => ({ AppChromeHeader: () => <header data-testid="app-header" /> }));
vi.mock("@/components/ExecutionInspector", () => ({
  ExecutionInspector: () => <div data-testid="execution-inspector" />,
}));
vi.mock("@/components/narration/VoiceDock", () => ({ VoiceDock: () => <div /> }));
vi.mock("@/components/CommandMenu", () => ({ CommandMenu: () => <div /> }));
vi.mock("@/components/TaskCenterToasts", () => ({ TaskCenterToasts: () => <div /> }));
vi.mock("@/components/PrivacyAnalytics", () => ({ PrivacyAnalytics: () => <div /> }));
vi.mock("@/components/DesktopUpdateNotifier", () => ({ DesktopUpdateNotifier: () => <div /> }));

vi.mock("@/components/ChatInput", () => {
  const StubChatInput = ({ placeholderOverride }: { placeholderOverride?: string }) => {
    React.useEffect(() => {
      mocks.composerMounts += 1;
    }, []);
    return (
      <div data-testid="chat-input" data-placeholder={placeholderOverride ?? "dynamic"}>
        <textarea aria-label="Message" />
        <span>Workspace</span>
        <span>Approvals</span>
        <span>Chat</span>
        <span>Roles</span>
        <span>Projects</span>
      </div>
    );
  };
  return { default: StubChatInput };
});

vi.mock("@/components/ChatProviderPicker", () => ({
  ChatProviderPicker: () => <div />,
  needsChatProviderChoice: () => false,
}));

vi.mock("@/lib/agent/chatProviderChoice", () => ({
  loadChatProviderChoice: () => "ollama",
  clearChatProviderChoice: () => {},
}));

import AppLayout from "@/layouts/AppLayout";
import { ChatHome } from "@/components/ChatHome";
import {
  DOCKED_COMPOSER_SLOT_TEST_ID,
  EMPTY_COMPOSER_SLOT_TEST_ID,
} from "@/components/composer/ComposerSlots";

/** Mirrors HomeChatArea's state-driven page switch without its unrelated setup banners. */
const ChatPage: React.FC = () => {
  const chat = mocks.chatState.chats.find((c) => c.id === mocks.chatState.currentChatId);
  return chat && chat.messages.length > 0 ? (
    <div data-testid="chat-messages">messages</div>
  ) : (
    <ChatHome />
  );
};

const Harness: React.FC = () => (
  <MemoryRouter initialEntries={["/chat"]}>
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="chat" element={<ChatPage />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

function setMessages(messages: unknown[], chatId = "c1") {
  mocks.chatState.chats = [{ id: chatId, messages, taskIds: [] }];
  mocks.chatState.currentChatId = chatId;
}

describe("single shared chat composer", () => {
  beforeEach(() => {
    mocks.composerMounts = 0;
    setMessages([]);
    mocks.chatState.isLoading = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders exactly one composer in the centred empty-state slot", () => {
    render(<Harness />);

    expect(screen.getAllByTestId("chat-input")).toHaveLength(1);
    expect(screen.getByTestId(EMPTY_COMPOSER_SLOT_TEST_ID).contains(screen.getByTestId("chat-input"))).toBe(true);
    expect(screen.queryByTestId(DOCKED_COMPOSER_SLOT_TEST_ID)).toBeNull();
    expect(screen.getByText("Ready when you are.")).toBeTruthy();
    // The toolbar lives inside the composer, so it appears once too.
    expect(screen.getAllByText("Workspace")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("moves the same composer instance to the docked slot on the first message", () => {
    const view = render(<Harness />);
    const composerNode = screen.getByTestId("chat-input");
    expect(composerNode.getAttribute("data-placeholder")).toBe("Ask anything...");

    setMessages([{ id: "m1", role: "user", content: "hello" }]);
    view.rerender(<Harness />);

    expect(screen.getAllByTestId("chat-input")).toHaveLength(1);
    expect(screen.getByTestId("chat-input")).toBe(composerNode);
    expect(screen.getByTestId(DOCKED_COMPOSER_SLOT_TEST_ID).contains(composerNode)).toBe(true);
    expect(screen.queryByTestId(EMPTY_COMPOSER_SLOT_TEST_ID)).toBeNull();
    expect(screen.getByTestId("chat-messages")).toBeTruthy();
    expect(screen.getAllByText("Workspace")).toHaveLength(1);
    expect(mocks.composerMounts).toBe(1);
  });

  it("keeps one docked composer when switching chats and restoring the empty state", () => {
    const view = render(<Harness />);
    const composerNode = screen.getByTestId("chat-input");

    setMessages([{ id: "m2", role: "user", content: "hi" }], "c2");
    view.rerender(<Harness />);
    expect(screen.getAllByTestId("chat-input")).toHaveLength(1);
    expect(screen.getByTestId("chat-input")).toBe(composerNode);

    setMessages([], "c3");
    view.rerender(<Harness />);
    expect(screen.getAllByTestId("chat-input")).toHaveLength(1);
    expect(screen.getByTestId("chat-input")).toBe(composerNode);
    expect(screen.getByTestId(EMPTY_COMPOSER_SLOT_TEST_ID).contains(composerNode)).toBe(true);
    expect(mocks.composerMounts).toBe(1);
  });

  it("does not duplicate the composer on provider changes or window resizing", () => {
    const view = render(<Harness />);
    const composerNode = screen.getByTestId("chat-input");

    mocks.chatState.apiConfig = { aiProvider: "openrouter", model: "gpt-4o" };
    view.rerender(<Harness />);
    window.dispatchEvent(new Event("resize"));
    view.rerender(<Harness />);

    expect(screen.getAllByTestId("chat-input")).toHaveLength(1);
    expect(screen.getByTestId("chat-input")).toBe(composerNode);
    expect(mocks.composerMounts).toBe(1);
  });
});
