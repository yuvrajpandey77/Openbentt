import { createRoot } from "react-dom/client";
import { migrateAllLegacyStorage } from "@/lib/storageMigrate";
import { enforceChatPwaEntry, enableChatPwa } from "@/lib/chatPwa";
import { isWebClient } from "@/config/platformSurface";
import App from "./App.tsx";
import "./index.css";

migrateAllLegacyStorage();

if (typeof window !== "undefined") {
  const redirecting = enforceChatPwaEntry();
  if (
    !redirecting &&
    isWebClient() &&
    (window.location.pathname === "/chat" || window.location.pathname.startsWith("/chat/"))
  ) {
    void enableChatPwa();
  }
  if (!redirecting) {
    createRoot(document.getElementById("root")!).render(<App />);
  }
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
