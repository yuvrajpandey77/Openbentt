import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useChat } from "@/context/ChatContext";

/**
 * Phase 9 — global keyboard shortcuts.
 * Careful never to hijack text input (Enter/Shift+Enter stay with the composer).
 */
export function useGlobalShortcuts(options: {
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onToggleRightSidebar: () => void;
}) {
  const { onOpenSearch, onOpenSettings } = options;
  const navigate = useNavigate();
  const { createNewChat } = useChat();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const inTextInput =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenSearch();
        return;
      }
      if (mod && e.key.toLowerCase() === "n" && !inTextInput) {
        e.preventDefault();
        createNewChat();
        navigate("/chat");
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        onOpenSettings();
        return;
      }
      if (mod && e.key.toLowerCase() === "j" && !inTextInput) {
        e.preventDefault();
        onToggleRightSidebar();
        return;
      }
      if (e.key === "Escape" && !inTextInput) {
        // Transient UI (palettes, menus) handles its own Escape; nothing global to do.
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenSearch, onOpenSettings, navigate, createNewChat]);
}
