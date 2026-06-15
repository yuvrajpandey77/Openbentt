import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isChatPwaAllowedPath, isChatPwaStandalone } from "@/lib/chatPwa";

/** Block marketing / workspace routes inside the installed chat PWA. */
export function ChatPwaStandaloneGuard({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  if (isChatPwaStandalone() && !isChatPwaAllowedPath(pathname)) {
    return <Navigate to="/chat" replace />;
  }
  return <>{children}</>;
}
